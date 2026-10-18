import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { AssetRef, BoardDoc, BoardItem, BoardMeta, SourceInfo } from '@shared/types'
import { boundsOfItems, clamp, mimeToExtension, roundRect, uid } from '@shared/util'
import { store } from '../store'
import { assetsDir } from '../paths'
import { dataUrlToBuffer, type CollectedImage } from './server'
import { normalizeItems, type RawItem } from './normalize'

export function assetsBytesOf(doc: BoardDoc): number {
  let total = 0
  for (const ref of Object.values(doc.assets ?? {})) total += ref.bytes ?? 0
  return total
}

function assetSlotsOf(item: BoardItem): Array<[() => AssetRef | undefined, (ref: AssetRef) => void]> {
  if (item.kind === 'image') return [[() => item.asset, (ref) => void (item.asset = ref)]]
  if (item.kind === 'card') return [[() => item.thumbnail, (ref) => void (item.thumbnail = ref)]]
  if (item.kind === 'embed' || item.kind === 'document' || item.kind === 'video') {
    return [[() => item.asset, (ref) => void (item.asset = ref)]]
  }
  return []
}

export function persistInlineAssets(docId: string, doc: BoardDoc): number {
  let saved = 0
  for (const item of doc.items) {
    for (const [get, set] of assetSlotsOf(item)) {
      const asset = get()
      if (!asset?.dataUrl) continue
      const parsed = dataUrlToBuffer(asset.dataUrl)
      if (!parsed) {
        set({ ...asset, dataUrl: undefined })
        continue
      }
      const hash = createHash('sha1').update(parsed.buffer).digest('hex')
      const ext = mimeToExtension(parsed.mime || asset.mime)
      const file = `${hash.slice(0, 20)}.${ext}`
      const path = join(assetsDir(docId), file)
      mkdirSync(assetsDir(docId), { recursive: true })
      if (!existsSync(path)) writeFileSync(path, parsed.buffer)
      const ref: AssetRef = {
        file,
        mime: parsed.mime || asset.mime,
        bytes: parsed.buffer.byteLength,
        sourceUrl: asset.sourceUrl,
        local: true
      }
      doc.assets = doc.assets ?? {}
      doc.assets[file] = ref
      set(ref)
      saved += 1
    }
  }
  return saved
}

export function buildStats(items: BoardItem[], assetsBytes: number): BoardDoc['stats'] {
  const byKind: Record<string, number> = {}
  let plainChars = 0
  let images = 0
  let connectors = 0
  let frames = 0
  let texts = 0
  let sticky = 0
  for (const item of items) {
    byKind[item.kind] = (byKind[item.kind] ?? 0) + 1
    if (item.kind === 'image') images += 1
    if (item.kind === 'connector') connectors += 1
    if (item.kind === 'frame') frames += 1
    if (item.kind === 'text' || item.kind === 'shape') texts += 1
    if (item.kind === 'sticky') sticky += 1
    if ('plain' in item) plainChars += String((item as { plain?: string }).plain ?? '').length
  }
  return { items: items.length, byKind, frames, images, connectors, texts, sticky, plainChars, assetsBytes }
}

export interface BuildDocOptions {
  docId?: string
  title?: string
  rawItems: RawItem[]
  images?: Map<string, CollectedImage>
  assets?: Record<string, AssetRef>
  source: Partial<SourceInfo> & { kind: SourceInfo['kind'] }
  warnings?: string[]
  projectId?: string
  tags?: string[]
  maxAssetBytes?: number
  viewport?: { x: number; y: number; zoom: number }
  bounds?: BoardDoc['bounds']
  description?: string
}

export interface BuildDocResult {
  doc: BoardDoc
  warnings: string[]
}

const DATA_URL = /^data:([^;,]+)?(;base64)?,(.*)$/s

function decodeDataUrl(value: string): { buffer: Buffer; mime: string } | null {
  const match = DATA_URL.exec(value)
  if (!match) return null
  const mime = match[1] || 'application/octet-stream'
  try {
    const payload = match[3] ?? ''
    const buffer = match[2]
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8')
    return buffer.byteLength ? { buffer, mime } : null
  } catch {
    return null
  }
}

function inlineDataUrls(doc: BoardDoc, warnings: string[]): void {
  const pending: BoardItem[] = []
  if (!doc.items.length) return
  try {
    mkdirSync(assetsDir(doc.id), { recursive: true })
  } catch (error) {
    warnings.push(`Папка картинок: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  for (const item of doc.items) {
    const asset =
      item.kind === 'image'
        ? item.asset
        : item.kind === 'card'
          ? item.thumbnail ?? item.asset
          : (item as { asset?: AssetRef }).asset
    if (!asset?.sourceUrl || asset.file || !asset.sourceUrl.startsWith('data:')) continue
    const decoded = decodeDataUrl(asset.sourceUrl)
    if (!decoded) continue
    const hash = createHash('sha1').update(decoded.buffer).digest('hex')
    const ext = mimeToExtension(decoded.mime, asset.sourceUrl)
    const file = `${hash.slice(0, 20)}.${ext}`
    const path = join(assetsDir(doc.id), file)
    try {
      if (!existsSync(path)) writeFileSync(path, decoded.buffer)
    } catch (error) {
      warnings.push(`Картинка ${item.id}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const ref: AssetRef = {
      file,
      mime: decoded.mime,
      bytes: decoded.buffer.byteLength,
      local: true
    }
    doc.assets[file] = ref
    if (item.kind === 'image') item.asset = { ...ref, sourceUrl: asset.sourceUrl.slice(0, 120) }
    else if (item.kind === 'card' && item.thumbnail) item.thumbnail = { ...ref }
    else if ((item as { asset?: AssetRef }).asset) (item as { asset?: AssetRef }).asset = { ...ref }
    pending.push(item)
  }
  if (pending.length) warnings.push(`Сохранено встроенных картинок: ${pending.length}`)
}

export function buildDoc(options: BuildDocOptions): BuildDocResult {
  const docId = options.docId ?? uid('bd_')
  const normalized = normalizeItems(options.rawItems)
  const warnings = [...(options.warnings ?? []), ...normalized.warnings]
  const assets: Record<string, AssetRef> = { ...(options.assets ?? {}) }
  let assetBytes = 0

  const images = options.images
  if (images && images.size) {
    mkdirSync(assetsDir(docId), { recursive: true })
    for (const [itemId, image] of images.entries()) {
      const parsed = dataUrlToBuffer(image.dataUrl)
      if (!parsed) {
        warnings.push(`Картинка ${itemId}: не удалось разобрать данные`)
        continue
      }
      const maxBytes = options.maxAssetBytes ?? 96 * 1024 * 1024
      if (parsed.buffer.byteLength > maxBytes) {
        warnings.push(`Картинка ${itemId} пропущена: размер больше лимита`)
        continue
      }
      const hash = createHash('sha1').update(parsed.buffer).digest('hex')
      const ext = mimeToExtension(parsed.mime || image.mime, image.label)
      const file = `${hash.slice(0, 20)}.${ext}`
      const path = join(assetsDir(docId), file)
      try {
        if (!existsSync(path)) writeFileSync(path, parsed.buffer)
      } catch (error) {
        warnings.push(`Картинка ${itemId}: ${error instanceof Error ? error.message : String(error)}`)
        continue
      }
      const ref: AssetRef = {
        file,
        mime: parsed.mime || image.mime || 'image/png',
        bytes: parsed.buffer.byteLength,
        sourceUrl: image.label || undefined,
        local: true
      }
      assets[file] = ref
      assetBytes += ref.bytes
      attachImage(normalized.items, itemId, ref)
    }
  }

  for (const ref of Object.values(assets)) assetBytes += ref.bytes ?? 0

  const bounds = options.bounds ?? roundRect(boundsOfItems(normalized.items, 160))
  const title = options.title?.trim() || options.source.name || 'Доска'
  const viewport = options.viewport ?? {
    x: bounds.x,
    y: bounds.y,
    zoom: clamp(Math.min(bounds.width, bounds.height) / 1400, 0.02, 1)
  }

  const source: SourceInfo = {
    kind: options.source.kind,
    url: options.source.url,
    boardId: options.source.boardId,
    teamId: options.source.teamId,
    name: options.source.name,
    importedAt: new Date().toISOString(),
    itemCount: normalized.items.length,
    notes: warnings.slice(0, 24)
  }

  const doc: BoardDoc = {
    schemaVersion: 1,
    id: docId,
    title,
    description: options.description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bounds,
    viewport,
    items: normalized.items,
    assets,
    stats: buildStats(normalized.items, assetBytes),
    source,
    projectId: options.projectId,
    tags: options.tags ?? [],
    favorite: false,
    archived: false
  }
  inlineDataUrls(doc, warnings)
  let totalBytes = 0
  for (const ref of Object.values(doc.assets)) totalBytes += ref.bytes ?? 0
  doc.stats = buildStats(doc.items, totalBytes)
  return { doc, warnings }
}

function attachImage(items: BoardItem[], itemId: string, ref: AssetRef): void {
  const item = items.find((entry) => entry.id === itemId)
  if (!item) return
  if (item.kind === 'image') {
    item.asset = { ...ref, sourceUrl: ref.sourceUrl ?? item.asset?.sourceUrl }
    return
  }
  if (item.kind === 'card' && item.thumbnail) {
    item.thumbnail = { ...ref, sourceUrl: ref.sourceUrl ?? item.thumbnail.sourceUrl }
    return
  }
  if ((item.kind === 'embed' || item.kind === 'document' || item.kind === 'video') && item.asset) {
    item.asset = { ...ref, sourceUrl: ref.sourceUrl ?? item.asset.sourceUrl }
  }
}

export function commitDoc(doc: BoardDoc): BoardMeta {
  store.createDoc(doc.id, doc)
  return store.meta(doc.id)!
}