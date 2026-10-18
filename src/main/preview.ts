import { BrowserWindow } from 'electron'
import { join } from 'node:path'
import type { PreviewKind, PreviewPayload } from '@shared/api'

export type { PreviewKind, PreviewPayload }

const registry = new Map<number, PreviewPayload>()

export function previewFor(win: BrowserWindow | null): PreviewPayload | null {
  if (!win) return null
  return registry.get(win.id) ?? null
}

function guessKind(src: string, fallback: PreviewKind): PreviewKind {
  const clean = src.split('?')[0].toLowerCase()
  if (/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|apng|jfif)$/.test(clean)) return 'image'
  if (/\.pdf$/.test(clean)) return 'pdf'
  if (/\.(mp4|webm|ogv|mov|mkv|m4v|mp3|wav|ogg|oga|m4a|flac|aac)$/.test(clean)) return 'media'
  if (/^(https?:)?\/\//.test(clean)) return 'web'
  if (/\.(txt|md|json|csv|log|xml|ya?ml|html?)$/.test(clean)) return 'text'
  return fallback
}

export function normalizePreview(payload: PreviewPayload): PreviewPayload {
  return { ...payload, kind: guessKind(payload.src, payload.kind) }
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
  win.on('closed', () => registry.delete(win.id))
  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(({ url }) => ({ action: 'deny' }))
  if (devUrl) void win.loadURL(`${devUrl}#/preview`)
  else void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '#/preview' })
  return win
}