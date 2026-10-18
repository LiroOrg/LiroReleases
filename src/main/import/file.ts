import { basename, extname, join } from 'node:path'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import type { BoardDoc, BoardMeta } from '@shared/types'
import { uid } from '@shared/util'
import { assetsDir, docDir } from '../paths'
import { isZip, readZip } from '../util/zip'
import { buildDoc, commitDoc } from './commit'
import type { RawItem } from './normalize'
import { store } from '../store'

export interface FileImportOptions {
  path: string
  title?: string
  projectId?: string
}

export interface FileImportResult {
  meta: BoardMeta
  warnings: string[]
  docId: string
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
  pdf: 'application/pdf',
  json: 'application/json'
}

export function importFromFile(options: FileImportOptions): FileImportResult {
  const file = options.path
  if (!existsSync(file)) throw new Error('Файл не найден')
  const ext = extname(file).toLowerCase()
  if (ext === '.zip' || ext === '.rtb' || ext === '.xpi') {
    const buffer = readFileSync(file)
    if (!isZip(buffer)) throw new Error('Файл не является архивом ZIP')
    return importFromZip(buffer, options)
  }
  if (ext === '.json') return importFromJsonText(readFileSync(file, 'utf8'), options)
  throw new Error(`Формат ${ext || 'без расширения'} не поддерживается`)
}

function importFromZip(buffer: Buffer, options: FileImportOptions): FileImportResult {
  const entries = readZip(buffer)
  if (!entries.size) throw new Error('Архив пуст или повреждён')
  const boardFile = [...entries.keys()].find((name) => /(board|liro|miroapp)\.json$/i.test(name))
  if (boardFile) return importFromJsonText(entries.get(boardFile)!.toString('utf8'), options, entries)
  for (const [name, value] of entries) {
    if (!name.toLowerCase().endsWith('.json')) continue
    try {
      const parsed = JSON.parse(value.toString('utf8')) as unknown
      if (looksLikeItems(parsed)) return importFromJsonText(value.toString('utf8'), options, entries)
    } catch {
      continue
    }
  }
  throw new Error('В архиве не найдено описание доски')
}

function looksLikeItems(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => entry && typeof entry === 'object' && 'id' in entry)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['data', 'items', 'results']) {
      const list = record[key]
      if (Array.isArray(list) && list.some((entry) => entry && typeof entry === 'object' && 'id' in entry)) return true
    }
  }
  return false
}

function extractItems(value: unknown): RawItem[] {
  if (Array.isArray(value)) return value as RawItem[]
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['items', 'data', 'results', 'objects']) {
      if (Array.isArray(record[key])) return record[key] as RawItem[]
    }
  }
  return []
}

function isOurDoc(value: unknown): value is BoardDoc {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<BoardDoc>
  if (record.schemaVersion === undefined || !Array.isArray(record.items) || !record.items.length) return false
  return typeof record.items[0] === 'object' && record.items[0] !== null && 'kind' in (record.items[0] as object)
}

function guessMime(file: string): string {
  const ext = file.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function importFromJsonText(text: string, options: FileImportOptions, zipEntries?: Map<string, Buffer>): FileImportResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Файл не содержит корректный JSON')
  }
  const fallbackTitle = basename(options.path).replace(/\.[^.]+$/, '') || 'Доска'

  if (isOurDoc(parsed)) {
    const source = parsed
    const nextId = uid('bd_')
    mkdirSync(assetsDir(nextId), { recursive: true })
    const target: BoardDoc = {
      ...source,
      id: nextId,
      title: options.title?.trim() || source.title || fallbackTitle,
      projectId: options.projectId ?? source.projectId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assets: {},
      source: { ...source.source, kind: 'file', importedAt: new Date().toISOString() }
    }
    let bytes = 0
    if (zipEntries) {
      for (const [name, value] of zipEntries) {
        if (!name.startsWith('assets/')) continue
        const file = name.slice('assets/'.length)
        if (!file) continue
        writeFileSync(join(assetsDir(nextId), file), value)
        const ref = source.assets?.[file]
        target.assets[file] = ref
          ? { ...ref, bytes: value.byteLength, local: true }
          : { file, mime: guessMime(file), bytes: value.byteLength, local: true }
        bytes += value.byteLength
      }
    } else {
      const sourceAssets = join(docDir(source.id), 'assets')
      if (existsSync(sourceAssets)) {
        for (const entry of readdirSync(sourceAssets)) {
          try {
            copyFileSync(join(sourceAssets, entry), join(assetsDir(nextId), entry))
            const size = readFileSync(join(assetsDir(nextId), entry)).byteLength
            const ref = source.assets?.[entry]
            target.assets[entry] = ref ? { ...ref, local: true } : { file: entry, mime: guessMime(entry), bytes: size, local: true }
            bytes += size
          } catch {
            continue
          }
        }
      }
    }
    target.stats = { ...source.stats, assetsBytes: bytes }
    store.createDoc(nextId, target)
    return { meta: store.meta(nextId)!, warnings: [], docId: nextId }
  }

  const rawItems = extractItems(parsed)
  if (!rawItems.length) throw new Error('В файле не найдено ни одного элемента доски')
  const result = buildDoc({
    docId: uid('bd_'),
    title: options.title?.trim() || fallbackTitle,
    rawItems,
    source: { kind: 'file', name: fallbackTitle },
    projectId: options.projectId
  })
  const meta = commitDoc(result.doc)
  return { meta, warnings: result.warnings, docId: result.doc.id }
}

export { commitDoc }