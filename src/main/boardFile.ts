import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { BoardAssetRequest, BoardFileRequest, BoardFileResult, BoardImageRef } from '@shared/api'
import type { AssetRef } from '@shared/types'
import { extensionToMime, mimeToExtension } from '@shared/util'
import { assetsDir } from './paths'
import { store } from './store'
import { dataUrlToBuffer } from './import/server'
import { DOCUMENT_LANGUAGE, readDocumentImages } from './documentText'
import { readPreviewText } from './preview'
import { assetsBytesOf, buildStats } from './import/commit'

const FILE_LIMIT = 64 * 1024 * 1024
const NAME_LIMIT = 160
const EXCERPT_LIMIT = 600

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
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (match) => ENTITIES[match] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function excerptOf(path: string): string {
  const document = readPreviewText(path)
  if (!document || (document.language !== DOCUMENT_LANGUAGE && document.language !== 'plaintext')) return ''
  return withoutTags(document.content).slice(0, EXCERPT_LIMIT)
}

export function assetPathOf(docId: string, file: string): string {
  const name = basename(String(file ?? ''))
  if (!name || name === '.' || name === '..') throw new Error('Имя файла не подходит')
  return join(assetsDir(docId), name)
}

function registerAsset(docId: string, ref: AssetRef): void {
  const doc = store.readDoc(docId)
  if (doc.assets[ref.file] && doc.assets[ref.file].bytes === ref.bytes) return
  doc.assets = { ...doc.assets, [ref.file]: ref }
  doc.stats = buildStats(doc.items, assetsBytesOf(doc))
  store.writeDoc(doc)
}

export function saveBoardFile(request: BoardFileRequest): BoardFileResult {
  const parsed = dataUrlToBuffer(request.dataUrl)
  if (!parsed || !parsed.buffer.byteLength) throw new Error('Файл пуст или не прочитан')
  if (parsed.buffer.byteLength > FILE_LIMIT) throw new Error('Файл слишком большой')
  const docId = request.docId
  const name = basename(String(request.name || '')).replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().slice(0, NAME_LIMIT) || 'Файл'
  const ext = extensionOf(name, parsed.mime)
  const file = `${createHash('sha1').update(parsed.buffer).digest('hex').slice(0, 20)}.${ext}`
  const path = assetPathOf(docId, file)
  const mime = !parsed.mime || parsed.mime === 'application/octet-stream' ? extensionToMime(ext) : parsed.mime
  const ref: AssetRef = { file, mime, bytes: parsed.buffer.byteLength, local: true }
  mkdirSync(assetsDir(docId), { recursive: true })
  if (!existsSync(path)) writeFileSync(path, parsed.buffer)
  registerAsset(docId, ref)
  return { file, name, mime, bytes: ref.bytes, excerpt: excerptOf(path) }
}

export function saveBoardAsset(request: BoardAssetRequest): boolean {
  const parsed = dataUrlToBuffer(request.dataUrl)
  if (!parsed || !parsed.buffer.byteLength) return false
  const path = assetPathOf(request.docId, request.file)
  const exists = existsSync(path)
  if (exists && statSync(path).size === parsed.buffer.byteLength) return false
  mkdirSync(assetsDir(request.docId), { recursive: true })
  writeFileSync(path, parsed.buffer)
  const file = basename(path)
  const ref: AssetRef = {
    file,
    mime: request.mime || extensionToMime(extname(file).slice(1).toLowerCase()),
    bytes: parsed.buffer.byteLength,
    local: true
  }
  registerAsset(request.docId, ref)
  return true
}

export function hasBoardAsset(docId: string, file: string): boolean {
  try {
    return statSync(assetPathOf(docId, file)).isFile()
  } catch {
    return false
  }
}

export function boardFileImages(docId: string, file: string): BoardImageRef[] {
  try {
    const path = assetPathOf(docId, file)
    return existsSync(path) ? readDocumentImages(path) : []
  } catch {
    return []
  }
}
