import { BrowserWindow, net } from 'electron'
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { PreviewKind, PreviewPayload } from '@shared/api'
import { DOCUMENT_LANGUAGE, csvToHtml, isDocumentFile, markdownToHtml, readDocumentHtml } from './documentText'
import { assetsDir, docDir, foldersDir } from './paths'

export type { PreviewKind, PreviewPayload }

const TEXT_LIMIT = 512 * 1024

const LANGUAGES: Record<string, string> = {
  '.json': 'json',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.xml': 'xml',
  '.svg': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.html': 'xml',
  '.htm': 'xml',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.css': 'css',
  '.sh': 'bash',
  '.bash': 'bash',
  '.sql': 'sql',
  '.diff': 'diff',
  '.patch': 'diff',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'ini'
}

export interface PreviewText {
  content: string
  language: string
  truncated: boolean
}

function languageOf(file: string): string {
  return LANGUAGES[extname(file).toLowerCase()] ?? 'plaintext'
}

export function readPreviewText(src: string): PreviewText | null {
  const file = toLocalPath(src)
  if (isDocumentFile(file)) {
    const html = readDocumentHtml(file)
    return html ? { content: html, language: DOCUMENT_LANGUAGE, truncated: false } : null
  }
  let size = 0
  try {
    const stat = statSync(file)
    if (!stat.isFile()) return null
    size = stat.size
  } catch {
    return null
  }
  let raw = Buffer.alloc(0)
  if (size > 0) {
    try {
      const handle = openSync(file, 'r')
      try {
        const buffer = Buffer.alloc(Math.min(size, TEXT_LIMIT + 1))
        raw = buffer.subarray(0, readSync(handle, buffer, 0, buffer.length, 0))
      } finally {
        closeSync(handle)
      }
    } catch {
      return null
    }
  }
  const truncated = raw.length > TEXT_LIMIT
  if (truncated) raw = raw.subarray(0, TEXT_LIMIT)
  if (raw.includes(0)) return null
  const text = raw.toString('utf8')
  const ext = extname(file).toLowerCase()
  if (ext === '.md' || ext === '.markdown' || ext === '.mdown') {
    return { content: markdownToHtml(text), language: DOCUMENT_LANGUAGE, truncated }
  }
  if (ext === '.csv' || ext === '.tsv') {
    const table = csvToHtml(text, ext === '.tsv' ? '\t' : ',')
    return { content: table.html, language: DOCUMENT_LANGUAGE, truncated: truncated || table.truncated }
  }
  return { content: text, language: languageOf(file), truncated }
}

const registry = new Map<number, PreviewPayload>()

export function previewFor(win: BrowserWindow | null): PreviewPayload | null {
  if (!win) return null
  return registry.get(win.id) ?? null
}

const REMOTE = /^(https?|lirofile|data|blob):/i

export function isRemoteSrc(src: string): boolean {
  return REMOTE.test(src.trim())
}

export function toLocalPath(src: string): string {
  const value = src.trim()
  if (/^lirofile:/i.test(value)) return liroAssetPath(value)
  if (!/^file:/i.test(value)) return value
  try {
    return fileURLToPath(value)
  } catch {
    return value
  }
}

function looksLikePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('/') || value.startsWith('\\')
}

function liroAssetPath(src: string): string {
  try {
    const url = new URL(src)
    const segments = url.pathname.split('/').filter(Boolean)
    const docId = decodeURIComponent(url.hostname || segments.shift() || '')
    const file = decodeURIComponent(segments.join('/'))
    const name = basename(file)
    if (!docId || !name || name.includes('..')) return ''
    if (docId === 'folder') return join(foldersDir(), name)
    const asset = join(assetsDir(docId), name)
    return existsSync(asset) ? asset : join(docDir(docId), name)
  } catch {
    return ''
  }
}

export function previewSrc(src: string): string {
  const value = src.trim()
  if (!value || isRemoteSrc(value)) return value
  if (/^[a-z][a-z0-9+.-]+:/i.test(value)) return value
  if (!looksLikePath(value)) return value
  try {
    return pathToFileURL(value).toString()
  } catch {
    return value
  }
}

export function guessKind(src: string, fallback: PreviewKind): PreviewKind {
  const clean = src.split(/[?#]/)[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|apng|jfif)$/.test(clean)) return 'image'
  if (/\.pdf$/.test(clean)) return 'pdf'
  if (/\.(mp4|webm|ogv|mov|mkv|m4v|mp3|wav|ogg|oga|m4a|flac|aac)$/.test(clean)) return 'media'
  if (/^https?:\/\//.test(clean)) return 'web'
  if (
    /\.(txt|md|markdown|json|csv|log|xml|ya?ml|html?|js|mjs|cjs|jsx|ts|tsx|css|scss|less|sh|bash|sql|diff|patch|ini|cfg|conf|toml|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|docx|docm|dotx|xlsx|xlsm|pptx)$/.test(
      clean
    )
  ) {
    return 'text'
  }
  return fallback
}

export function normalizePreview(payload: PreviewPayload): PreviewPayload {
  const src = previewSrc(payload.src)
  return { ...payload, src, kind: guessKind(src, payload.kind), online: net.isOnline() }
}

export function openPreview(payload: PreviewPayload, devUrl: string | undefined): BrowserWindow {
  const normalized = normalizePreview(payload)
  const win = new BrowserWindow({
    width: normalized.kind === 'media' ? 900 : 1120,
    height: normalized.kind === 'media' ? 620 : 800,
    minWidth: 480,
    minHeight: 360,
    backgroundColor: '#0d0d0f',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false
    }
  })
  registry.set(win.id, normalized)
  win.setTitle(normalized.title || 'Предпросмотр')
  win.on('closed', () => registry.delete(win.id))
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => ({ action: 'deny' }))
  if (devUrl) void win.loadURL(`${devUrl}#/preview`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '#/preview' })
  return win
}