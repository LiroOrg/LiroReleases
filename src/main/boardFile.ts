import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { BoardAssetRequest, BoardFileRequest, BoardFileResult, BoardImageRef } from '@shared/api'
import type { AssetRef, BoardItem, DocumentItem } from '@shared/types'
import { boundsOfItems, extensionToMime, mimeToExtension, roundRect, uid } from '@shared/util'
import { assetsDir } from './paths'
import { store } from './store'
import { assetUrl } from './protocol'
import { assetsBytesOf, buildStats } from './import/commit'
import { dataUrlToBuffer } from './import/server'
import { DOCUMENT_LANGUAGE, isDocumentFile, readDocumentImages } from './documentText'
import { readPreviewText } from './preview'

const FILE_WIDTH = 300
const FILE_HEIGHT = 424
const EXCERPT_LIMIT = 620
const NAME_LIMIT = 160

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'"
}

function extensionOf(name: string, mime: string): string {
  const fromName = extname(name).replace(/^\./, '').toLowerCase()
  if (/^[a-z0-9]{1,5}$/.test(fromName)) return fromName
  return mimeToExtension(mime)
}

function withoutTags(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match] ?? ' ')
}

function excerptOf(docId: string, file: string, path: string): string {
  if (!isDocumentFile(path)) return ''
  const document = readPreviewText(assetUrl(docId, file))
  if (!document || document.language !== DOCUMENT_LANGUAGE) return ''
  return withoutTags(document.content).replace(/\s+/g, ' ').trim().slice(0, EXCERPT_LIMIT)
}

function topZ(items: BoardItem[]): number {
  let top = 0
  for (const item of items) top = Math.max(top, item.z ?? 0)
  return top + 1
}

export function assetPathOf(docId: string, file: string): string {
  const name = basename(String(file ?? ''))
  if (!name || name === '.' || name.startsWith('..')) throw new Error('Имя файла не подходит')
  return join(assetsDir(docId), name)
}

export function hasBoardAsset(docId: string, file: string): boolean {
  try {
    return statSync(assetPathOf(docId, file)).isFile()
  } catch {
    return false
  }
}

export function readBoardFileImages(docId: string, file: string): BoardImageRef[] {
  const path = assetPathOf(docId, file)
  if (!existsSync(path)) return []
  return readDocumentImages(path)
}

export function saveBoardAsset(request: BoardAssetRequest): boolean {
  const parsed = dataUrlToBuffer(request.dataUrl)
  if (!parsed || !parsed.buffer.byteLength) return false
  const path = assetPathOf(request.docId, request.file)
  if (existsSync(path) && statSync(path).size === parsed.buffer.byteLength) return false
  const doc = store.readDoc(request.docId)
  mkdirSync(assetsDir(doc.id), { recursive: true })
  writeFileSync(path, parsed.buffer)
  const file = basename(path)
  const held = doc.assets?.[file]
  const ref: AssetRef = held
    ? { ...held, bytes: parsed.buffer.byteLength, local: true }
    : { file, mime: request.mime || extensionToMime(extname(file).slice(1).toLowerCase()), bytes: parsed.buffer.byteLength, local: true }
  doc.assets = { ...doc.assets, [file]: ref }
  doc.stats = buildStats(doc.items, assetsBytesOf(doc))
  store.writeDoc(doc)
  return true
}

export function addBoardFile(request: BoardFileRequest): BoardFileResult {
  const parsed = dataUrlToBuffer(request.dataUrl)
  if (!parsed || !parsed.buffer.byteLength) throw new Error('Файл пуст или не прочитан')
  const doc = store.readDoc(request.docId)
  const name = (request.name || 'Файл').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().slice(0, NAME_LIMIT) || 'Файл'
  const ext = extensionOf(name, parsed.mime)
  const hash = createHash('sha1').update(parsed.buffer).digest('hex').slice(0, 20)
  const file = `${hash}.${ext}`
  const dir = assetsDir(doc.id)
  mkdirSync(dir, { recursive: true })
  const path = assetPathOf(doc.id, file)
  if (!existsSync(path)) writeFileSync(path, parsed.buffer)
  const mime = parsed.mime === 'application/octet-stream' || !parsed.mime ? extensionToMime(ext) : parsed.mime
  const ref: AssetRef = { file, mime, bytes: parsed.buffer.byteLength, local: true }
  const id = uid('doc_')
  const item: DocumentItem = {
    id,
    kind: 'document',
    x: Math.round(request.x - FILE_WIDTH / 2),
    y: Math.round(request.y - FILE_HEIGHT / 2),
    w: FILE_WIDTH,
    h: FILE_HEIGHT,
    rotation: 0,
    z: topZ(doc.items),
    title: name,
    asset: ref,
    excerpt: excerptOf(doc.id, file, path)
  }
  doc.items = [...doc.items, item]
  doc.assets = { ...doc.assets, [file]: doc.assets[file] ?? ref }
  doc.bounds = roundRect(boundsOfItems(doc.items, 160))
  doc.stats = buildStats(doc.items, assetsBytesOf(doc))
  store.writeDoc(doc)
  return { id, file, name, mime: ref.mime, excerpt: item.excerpt ?? '' }
}
