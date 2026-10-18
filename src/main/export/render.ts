import { BrowserWindow } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clamp } from '@shared/util'
import { docDir, getRoot } from '../paths'
import { store } from '../store'

const MAX_PIXELS = 36_000_000
const MAX_SIDE = 9000
const MAX_WINDOW = 8600

export interface RenderParams {
  docId: string
  scope: 'board' | 'frame' | 'selection'
  targetId?: string
  selectionIds?: string[]
  scale: number
  background: 'white' | 'transparent'
  print?: boolean
  paper?: 'a4' | 'a3'
  tileCols?: number
  tileRows?: number
  mode?: 'png' | 'html' | 'print'
  viewportWidth?: number
  viewportHeight?: number
}

export function rendererEntry(): string {
  const dev = process.env.ELECTRON_RENDERER_URL
  if (dev) return dev
  return pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
}

export function measure(params: RenderParams): { width: number; height: number } {
  const doc = store.readDoc(params.docId)
  if (params.scope === 'frame' && params.targetId) {
    const frame = doc.items.find((item) => item.id === params.targetId)
    if (frame) return { width: Math.max(64, Math.ceil(frame.w + 140)), height: Math.max(64, Math.ceil(frame.h + 140)) }
  }
  if (params.scope === 'selection' && params.selectionIds?.length) {
    const ids = new Set(params.selectionIds)
    const items = doc.items.filter((item) => ids.has(item.id))
    if (items.length) {
      const minX = Math.min(...items.map((item) => item.x)) - 60
      const minY = Math.min(...items.map((item) => item.y)) - 60
      const maxX = Math.max(...items.map((item) => item.x + Math.max(1, item.w))) + 60
      const maxY = Math.max(...items.map((item) => item.y + Math.max(1, item.h))) + 60
      return { width: Math.max(64, Math.ceil(maxX - minX)), height: Math.max(64, Math.ceil(maxY - minY)) }
    }
  }
  return { width: Math.max(64, Math.ceil(doc.bounds.width)), height: Math.max(64, Math.ceil(doc.bounds.height)) }
}

export function fitScale(width: number, height: number, requested: number): number {
  let scale = Math.max(0.02, requested)
  let guard = 0
  while ((width * scale) * (height * scale) > MAX_PIXELS || width * scale > MAX_SIDE || height * scale > MAX_SIDE) {
    scale *= 0.88
    guard += 1
    if (guard > 40 || scale < 0.02) break
  }
  return Number(scale.toFixed(4))
}

function queryFor(params: RenderParams, extra: Record<string, string>): string {
  const search = new URLSearchParams({
    docId: params.docId,
    scope: params.scope,
    scale: '1',
    background: params.background,
    ...extra
  })
  if (params.targetId) search.set('targetId', params.targetId)
  if (params.selectionIds?.length) search.set('selection', params.selectionIds.join(','))
  return search.toString()
}

async function openWindow(params: RenderParams, extra: Record<string, string>, size: { width: number; height: number }): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: clamp(Math.round(size.width), 320, 6000),
    height: clamp(Math.round(size.height), 240, 4000),
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      webSecurity: true
    }
  })
  win.setMenu(null)
  const entry = rendererEntry()
  const query = queryFor(params, extra)
  if (entry.startsWith('http')) await win.loadURL(`${entry}/render?${query}`)
  else await win.loadURL(`${entry}#/render?${query}`)
  return win
}

export interface PngResult {
  buffer: Buffer
  width: number
  height: number
  actualScale: number
}

export async function renderPng(params: RenderParams): Promise<PngResult> {
  const measured = measure(params)
  const scale = fitScale(measured.width, measured.height, params.scale)
  const targetWidth = Math.max(1, Math.round(measured.width * scale))
  const targetHeight = Math.max(1, Math.round(measured.height * scale))
  const win = new BrowserWindow({
    width: clamp(targetWidth, 320, MAX_WINDOW),
    height: clamp(targetHeight, 240, MAX_WINDOW),
    show: false,
    backgroundColor: params.background === 'transparent' ? '#00000000' : '#ffffff',
    webPreferences: {
      offscreen: true,
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  })
  win.setMenu(null)
  const entry = rendererEntry()
  const query = queryFor(params, {
    mode: 'png',
    scale: String(scale),
    width: String(targetWidth),
    height: String(targetHeight)
  })
  try {
    await loadInto(win, entry, query)
    await waitForRender(win, 30000)
    await new Promise((resolve) => setTimeout(resolve, 700))
    try {
      win.webContents.invalidate()
    } catch {}
    const opaque = params.background !== 'transparent'
    const image = await waitForPaint(win, 12000, opaque)
    if (image && !image.isEmpty()) {
      const size = image.getSize()
      return { buffer: image.toPNG(), width: size.width, height: size.height, actualScale: scale }
    }
    await new Promise((resolve) => setTimeout(resolve, 900))
    try {
      win.webContents.invalidate()
    } catch {}
    const captured = await win.webContents.capturePage()
    const size = captured.getSize()
    return { buffer: captured.toPNG(), width: size.width, height: size.height, actualScale: scale }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

async function loadInto(win: BrowserWindow, entry: string, query: string): Promise<void> {
  if (entry.startsWith('http')) await win.loadURL(`${entry}/render?${query}`)
  else await win.loadURL(`${entry}#/render?${query}`)
}

interface RenderInfo {
  width: number
  height: number
  printWidth?: string
  printHeight?: string
  ready: boolean
}

function waitForRender(win: BrowserWindow, timeoutMs: number): Promise<RenderInfo | null> {
  return new Promise((resolve) => {
    const started = Date.now()
    const poll = async (): Promise<void> => {
      if (win.isDestroyed()) return resolve(null)
      try {
        const value = (await win.webContents.executeJavaScript(
          'window.__liroAppRender && window.__liroAppRender.info ? window.__liroAppRender.info() : null'
        )) as RenderInfo | null
        if (value?.ready) {
          resolve(value)
          return
        }
      } catch {}
      if (Date.now() - started > timeoutMs) {
        resolve(null)
        return
      }
      setTimeout(() => void poll(), 180)
    }
    void poll()
  })
}

function looksBlank(image: Electron.NativeImage): boolean {
  const size = image.getSize()
  if (size.width < 8 || size.height < 8) return true
  let bitmap: Buffer
  try {
    bitmap = image.toBitmap()
  } catch {
    return true
  }
  const stride = size.width * 4
  const rows = [0, Math.floor(size.height / 2), size.height - 1]
  for (const row of rows) {
    for (const column of [0, Math.floor(size.width / 2), size.width - 1]) {
      const at = row * stride + column * 4
      if (at + 2 >= bitmap.length) continue
      if (bitmap[at] > 8 || bitmap[at + 1] > 8 || bitmap[at + 2] > 8) return false
    }
  }
  return true
}

function waitForPaint(win: BrowserWindow, timeoutMs: number, rejectBlank: boolean): Promise<Electron.NativeImage | null> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (image: Electron.NativeImage | null): void => {
      if (settled) return
      settled = true
      win.webContents.off('paint', onPaint)
      clearTimeout(timer)
      resolve(image)
    }
    const onPaint = (_event: unknown, _dirty: unknown, image: Electron.NativeImage): void => {
      const size = image.getSize()
      if (size.width <= 8 || size.height <= 8) return
      if (rejectBlank && looksBlank(image)) return
      finish(image)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    win.webContents.on('paint', onPaint)
    setTimeout(() => {
      try {
        win.webContents.invalidate()
      } catch {}
    }, 400)
  })
}

export async function renderHtml(params: RenderParams): Promise<string> {
  const win = await openWindow(
    params,
    { mode: 'html', scale: '1', width: '2600', height: '1500' },
    { width: 2600, height: 1500 }
  )
  try {
    await waitForRender(win, 30000)
    await new Promise((resolve) => setTimeout(resolve, 400))
    const html = await win.webContents.executeJavaScript('window.__liroAppRender ? window.__liroAppRender.html() : ""')
    return typeof html === 'string' ? html : ''
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export async function renderPdf(params: RenderParams, target: string): Promise<{ bytes: number; width: number; height: number }> {
  const win = await openWindow(
    params,
    {
      mode: 'print',
      scale: '1',
      print: '1',
      paper: params.paper ?? 'a3',
      tileCols: String(params.tileCols ?? 1),
      tileRows: String(params.tileRows ?? 1)
    },
    { width: 1600, height: 1200 }
  )
  try {
    const info = await waitForRender(win, 30000)
    await new Promise((resolve) => setTimeout(resolve, 600))
    const data = await win.webContents.printToPDF({
      printBackground: true,
      landscape: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      preferCSSPageSize: true
    })
    writeFileSync(target, data)
    return { bytes: data.byteLength, width: info?.width ?? 0, height: info?.height ?? 0 }
  } finally {
    if (!win.isDestroyed()) win.destroy()
  }
}

export function exportFolder(): string {
  const dir = join(getRoot(), 'exports')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function thumbnailPath(docId: string): string {
  return join(docDir(docId), 'thumb.png')
}