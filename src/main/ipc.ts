import { app, BrowserWindow, ClipboardItem, clipboard, dialog, ipcMain, nativeImage, net, shell } from 'electron'
import type { NativeImage } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BoardAssetRequest, BoardFileRequest, IpcResult } from '@shared/api'
import type {
  ApiImportOptions,
  BoardItem,
  BoardWorkspace,
  ExportOptions,
  ExportResult,
  LibraryIndex,
  Project,
  Settings
} from '@shared/types'
import { DEFAULT_SETTINGS, store } from './store'
import { assetsDir, docDir, folderIconFile, getRoot, indexFile, readJson, setRoot, workspaceFile, writeAtomic } from './paths'
import { assetUrl, revealPath, revealRoot } from './protocol'
import { takePendingCode } from './live/protocol'
import { CaptureManager } from './import/capture'
import { buildExtensionFiles } from './import/extension'
import { importFromFile } from './import/file'
import { importFromApi, listBoards, type SourceBoardSummary } from './import/api'
import { buildDoc, buildStats, assetsBytesOf, commitDoc, persistInlineAssets } from './import/commit'
import { boardFileImages, hasBoardAsset, saveBoardAsset, saveBoardFile } from './boardFile'
import { exportBoard, exportToPath } from './export/exporter'
import { exportFolder } from './export/render'
import { openPreview, previewFor, readPreviewText, type PreviewPayload } from './preview'
import { askToRestart, checkForUpdate } from './updater'
import { readChanges } from './changes'
import { sanitizeFileName } from '@shared/util'
import type { RawItem } from './import/normalize'
import { dataUrlToBuffer } from './import/server'
import { boundsOfItems, extensionToMime, isImageMime, parseBoardRef, roundRect, uid } from '@shared/util'
import { newCode, normalizeCode, pickRoomCode } from './live/crypto'
import { createRoom, deleteRoom, readRoom, waitForAnswer, writeAnswer } from './live/signal'

let mainWindow: BrowserWindow | null = null
let capture: CaptureManager | null = null
const jobs = new Map<string, AbortController>()

const IMAGE_FILTERS = [
  {
    name: 'Картинки',
    extensions: ['png', 'jpg', 'jpeg', 'jfif', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'apng', 'heic', 'heif']
  },
  { name: 'Все файлы', extensions: ['*'] }
]

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function setMainWindow(window: BrowserWindow | null): void {
  mainWindow = window
}

export function getCapture(): CaptureManager {
  if (!capture) {
    capture = new CaptureManager(
      (snapshot) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('event:capture:update', snapshot)
      },
      (event) => {
        if (!mainWindow || mainWindow.isDestroyed()) return
        mainWindow.webContents.send('event:toast', { text: event.text, kind: event.kind === 'error' ? 'error' : 'capture' })
      }
    )
  }
  return capture
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function fail(error: unknown, code?: string): IpcResult<never> {
  const message = error instanceof Error ? error.message : String(error)
  return { ok: false, error: message, code }
}

function sendLibraryChanged(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('event:library:changed', store.index)
  }
}

function sendSettings(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('event:settings:changed', store.settings)
  }
}

export function openBoardFile(path: string): string {
  try {
    const result = importFromFile({ path })
    sendLibraryChanged()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('event:nav:go', `#/board/${result.docId}`)
    }
    return result.docId
  } catch (error) {
    console.error('файл доски не открылся', error)
    return ''
  }
}

export function pickAndOpenBoardFile(): void {
  const chosen = firstPath(
    dialog.showOpenDialogSync(mainWindow ?? undefined!, {
      title: 'Откройте файл доски',
      properties: ['openFile'],
      filters: [{ name: 'Файлы Liro', extensions: ['liro', 'json', 'zip', 'rtb'] }]
    })
  )
  if (chosen) openBoardFile(chosen)
}

const IMAGE_LIMIT = 24 * 1024 * 1024

function nameFromUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const last = parsed.pathname.split('/').filter(Boolean).pop() ?? ''
    const clean = decodeURIComponent(last.split('?')[0]).trim()
    if (clean) return clean
    return parsed.hostname
  } catch {
    return 'Картинка'
  }
}

async function fetchImage(url: string): Promise<{ dataUrl: string; mime: string; name: string }> {
  const value = url.trim()
  if (!/^https?:\/\//i.test(value)) throw new Error('Нужна ссылка, начинающаяся с http:// или https://')
  const response = await net.fetch(value, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Liro/1.0 (https://liro.app)', Accept: 'image/*,*/*;q=0.8' }
  })
  if (!response.ok) throw new Error(`Сервер ответил ${response.status}`)
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (type && !type.startsWith('image/')) throw new Error('По этой ссылке не картинка')
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) throw new Error('Сервер вернул пустой ответ')
  if (buffer.length > IMAGE_LIMIT) throw new Error('Картинка слишком большая')
  const mime = type || 'image/png'
  return { dataUrl: `data:${mime};base64,${buffer.toString('base64')}`, mime, name: nameFromUrl(value) }
}

const ASSET_SHARE_LIMIT = 12 * 1024 * 1024

function readAssetDataUrl(docId: string, file: string): string | null {
  const safeName = file.split('/').pop() ?? file
  if (!docId || !safeName || safeName.includes('..')) return null
  const assetFile = join(assetsDir(docId), safeName)
  const docFile = join(docDir(docId), safeName)
  const target = existsSync(assetFile) ? assetFile : existsSync(docFile) ? docFile : null
  if (!target) return null
  try {
    if (statSync(target).size > ASSET_SHARE_LIMIT) return null
    const ext = safeName.split('.').pop()?.toLowerCase() ?? ''
    return `data:${extensionToMime(ext)};base64,${readFileSync(target).toString('base64')}`
  } catch {
    return null
  }
}

function uniqueItemIds(items: BoardItem[], taken: Set<string>): Map<string, string> {
  const renamed = new Map<string, string>()
  for (const item of items) {
    let id = item.id
    let counter = 2
    while (taken.has(id)) {
      id = `${item.id}_${counter}`
      counter += 1
    }
    taken.add(id)
    if (id !== item.id) {
      renamed.set(item.id, id)
      item.id = id
    }
  }
  const follow = (item: BoardItem, key: 'parentId' | 'groupId' | 'startItemId' | 'endItemId'): void => {
    const holder = item as unknown as Record<string, string | undefined>
    const value = holder[key]
    if (value) holder[key] = renamed.get(value) ?? value
  }
  for (const item of items) {
    follow(item, 'parentId')
    follow(item, 'groupId')
    follow(item, 'startItemId')
    follow(item, 'endItemId')
  }
  return renamed
}

export function registerIpc(): void {
  ipcMain.handle('settings:get', () => ok(store.settings))
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    store.settings = { ...DEFAULT_SETTINGS, ...store.settings, ...patch }
    store.saveSettings()
    sendSettings()
    return ok(store.settings)
  })
  ipcMain.handle('storage:reveal', () => {
    revealRoot()
    return ok(getRoot())
  })
  ipcMain.handle('storage:move', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      title: 'Выберите папку для библиотеки Liro',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || !result.filePaths[0]) return fail('Папка не выбрана', 'canceled')
    const dir = result.filePaths[0]
    setRoot(dir)
    store.load()
    sendLibraryChanged()
    return ok(getRoot())
  })

  ipcMain.handle('library:get', () => ok(store.index))
  ipcMain.handle('board:list', (_e, archived?: boolean) => ok(store.boards({ archived: archived === true })))
  ipcMain.handle('board:open', (_e, docId: string) => {
    const doc = store.readDoc(docId)
    store.index.lastOpenedBoardId = docId
    store.saveIndex()
    return ok(doc)
  })
  ipcMain.handle('board:create', (_e, title: string, projectId?: string) => {
    const docId = uid('bd_')
    const created = buildDoc({
      docId,
      title: title?.trim() || 'Новая доска',
      rawItems: [],
      source: { kind: 'file' },
      projectId
    })
    commitDoc(created.doc)
    sendLibraryChanged()
    return ok(created.doc)
  })
  ipcMain.handle('board:create-session', (_e, title: string) => {
    const docId = uid('bd_')
    const created = buildDoc({
      docId,
      title: title?.trim() || 'Совместная доска',
      rawItems: [],
      source: { kind: 'file' }
    })
    commitDoc(created.doc)
    store.patchMeta(docId, { tags: [...(store.meta(docId)?.tags ?? []), 'сессия'] })
    sendLibraryChanged()
    return ok(created.doc)
  })
  ipcMain.handle('board:rename', (_e, docId: string, title: string) => {
    const meta = store.patchMeta(docId, { title: title.trim() || 'Без названия' })
    sendLibraryChanged()
    return ok(meta)
  })
  ipcMain.handle(
    'board:update',
    (_e, docId: string, patch: Record<string, unknown>) => {
      const meta = store.patchMeta(docId, patch)
      sendLibraryChanged()
      return ok(meta)
    }
  )
  ipcMain.handle('board:delete', (_e, docId: string, deleteFiles: boolean) => {
    store.deleteDoc(docId)
    if (!deleteFiles) mkdirSync(docDir(docId), { recursive: true })
    sendLibraryChanged()
    return ok(true)
  })
  ipcMain.handle('board:duplicate', (_e, docId: string) => {
    const newId = uid('bd_')
    const meta = store.duplicateDoc(docId, newId)
    sendLibraryChanged()
    return ok(meta)
  })
  ipcMain.handle('board:reorder', (_e, ids: string[]) => {
    store.reorderBoards(ids)
    sendLibraryChanged()
    return ok(true)
  })
  ipcMain.handle('board:reveal', (_e, docId: string) => {
    revealPath(join(docDir(docId), 'board.json'))
    return ok(docDir(docId))
  })
  ipcMain.handle('board:export', async (_e, options: ExportOptions) => ok(await runExport(options, false)))
  ipcMain.handle('board:export-save-as', async (_e, options: ExportOptions) => {
    const result = await dialog.showSaveDialog(mainWindow ?? undefined!, {
      title: 'Сохранить экспорт',
      defaultPath: suggestedName(options),
      filters: exportFilters(options)
    })
    if (result.canceled || !result.filePath) return fail('Сохранение отменено', 'canceled')
    return ok(await runExport(options, true, result.filePath))
  })
  ipcMain.handle('board:thumbnail', async (_e, docId: string) => {
    try {
      const file = await exportBoard({ docId, thumbnail: true })
      store.setThumbnail(docId, file ? 'thumb.png' : undefined)
      sendLibraryChanged()
      return ok(file)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('board:viewport', (_e, docId: string, viewport: { x: number; y: number; zoom: number }) => {
    store.saveViewport(docId, viewport)
    return ok(true)
  })
  ipcMain.handle('board:items', (_e, docId: string, items: unknown[]) => {
    try {
      const doc = store.readDoc(docId)
      const next = items as BoardItem[]
      doc.items = next
      persistInlineAssets(docId, doc)
      doc.bounds = roundRect(boundsOfItems(next, 160))
      doc.stats = buildStats(next, assetsBytesOf(doc))
      store.writeDoc(doc)
      return ok(true)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('board:paste-items', (_e, payload: { docId: string; sourceDocId: string; items: BoardItem[] }) => {
    try {
      const doc = store.readDoc(payload.docId)
      const source = payload.sourceDocId === payload.docId ? null : store.readDoc(payload.sourceDocId)
      const sourceAssets = source?.assets ?? {}
      const incoming = payload.items ?? []
      const next = [...doc.items]
      for (const item of incoming) {
        const clone: BoardItem = { ...item }
        if ((clone.kind === 'image' || clone.kind === 'document') && clone.asset?.local && clone.asset.file) {
          const file = clone.asset.file
          const target = join(assetsDir(payload.docId), file)
          const origin = join(assetsDir(payload.sourceDocId), file)
          if (!existsSync(target) && existsSync(origin)) {
            mkdirSync(assetsDir(payload.docId), { recursive: true })
            copyFileSync(origin, target)
          }
          const ref = sourceAssets[file]
          if (ref) {
            doc.assets = doc.assets ?? {}
            doc.assets[file] = { ...ref }
          }
        }
        next.push(clone)
      }
      doc.items = next
      doc.bounds = roundRect(boundsOfItems(next, 160))
      doc.stats = buildStats(next, assetsBytesOf(doc))
      store.writeDoc(doc)
      return ok({ added: incoming.length })
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  })
  ipcMain.handle('board:link-source', async (_e, docId: string) => {
    const doc = store.readDoc(docId)
    const url = doc.source.url
    if (!url) return fail('У доски нет ссылки на оригинал')
    await shell.openExternal(url)
    return ok(url)
  })
  ipcMain.handle('asset:url', (_e, docId: string, file: string) => ok(assetUrl(docId, file)))
  ipcMain.handle('asset:data', (_e, docId: string, file: string) => ok(readAssetDataUrl(docId, file)))
  ipcMain.handle('asset:missing', (_e, docId: string) => ok(store.boards().length > 0 && !indexFile().length ? true : false))
  ipcMain.handle('board:save-file', (_e, request: BoardFileRequest) => {
    try {
      const result = saveBoardFile(request)
      sendLibraryChanged()
      return ok(result)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('board:save-asset', (_e, request: BoardAssetRequest) => {
    try {
      return ok(saveBoardAsset(request))
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('board:has-asset', (_e, docId: string, file: string) => ok(hasBoardAsset(docId, file)))
  ipcMain.handle('board:file-images', (_e, docId: string, file: string) => ok(boardFileImages(docId, file)))
  ipcMain.handle('board:workspace-get', (_e, docId: string) => ok(readJson<BoardWorkspace>(workspaceFile(docId), {})))
  ipcMain.handle('board:workspace-set', (_e, docId: string, patch: BoardWorkspace) => {
    const current = readJson<BoardWorkspace>(workspaceFile(docId), {})
    const next: BoardWorkspace = { ...current, ...patch }
    writeAtomic(workspaceFile(docId), JSON.stringify(next, null, 2))
    return ok(true)
  })

  ipcMain.handle('board:append', (_e, payload: { docId: string; items: unknown[]; images?: Array<{ itemId: string; dataUrl: string }>; offsetX?: number; offsetY?: number }) => {
    try {
      const doc = store.readDoc(payload.docId)
      const images = new Map<string, { mime: string; dataUrl: string; bytes: number }>()
      for (const image of payload.images ?? []) {
        images.set(image.itemId, {
          mime: /data:([^;]+)/.exec(image.dataUrl)?.[1] ?? 'image/png',
          dataUrl: image.dataUrl,
          bytes: Math.round(image.dataUrl.length * 0.75)
        })
      }
      const built = buildDoc({
        docId: payload.docId,
        rawItems: (payload.items ?? []) as RawItem[],
        images,
        source: { kind: 'file' },
        title: doc.title
      })
      const offsetX = payload.offsetX ?? 0
      const offsetY = payload.offsetY ?? 0
      const baseZ = doc.items.length
      const incoming = built.doc.items as BoardItem[]
      const renamed = uniqueItemIds(incoming, new Set(doc.items.map((item) => item.id)))
      const merged = [
        ...doc.items,
        ...incoming.map((item, index) => ({
          ...item,
          x: item.x + offsetX,
          y: item.y + offsetY,
          z: baseZ + index
        })) as BoardItem[]
      ]
      doc.items = merged
      doc.bounds = roundRect(boundsOfItems(merged, 160))
      doc.stats = buildStats(merged, doc.stats.assetsBytes + built.doc.stats.assetsBytes)
      store.writeDoc(doc)
      sendLibraryChanged()
      return ok({ added: built.doc.items.length, images: images.size, renamed: Object.fromEntries(renamed) })
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('project:create', (_e, name: string) => {
    const project = store.createProject(name)
    sendLibraryChanged()
    return ok(project)
  })
  ipcMain.handle('project:rename', (_e, id: string, name: string) => {
    const project = store.updateProject(id, { name })
    sendLibraryChanged()
    return ok(project)
  })
  ipcMain.handle('project:update', (_e, id: string, patch: Partial<Project>) => {
    const project = store.updateProject(id, patch)
    sendLibraryChanged()
    return ok(project)
  })
  ipcMain.handle('project:delete', (_e, id: string, mode: string) => {
    if (mode === 'deleteBoards') {
      for (const board of store.boards({ projectId: id })) store.deleteDoc(board.id)
    }
    store.deleteProject(id)
    rmSync(folderIconFile(id), { force: true })
    sendLibraryChanged()
    return ok(true)
  })
  ipcMain.handle('project:icon-image', (_e, payload: { projectId: string; dataUrl?: string }) => {
    try {
      const file = folderIconFile(payload.projectId)
      if (!payload.dataUrl) {
        rmSync(file, { force: true })
        store.updateProject(payload.projectId, { hasIconImage: false })
        sendLibraryChanged()
        return ok(false)
      }
      const parsed = dataUrlToBuffer(payload.dataUrl)
      if (!parsed) return fail(new Error('Не удалось прочитать картинку'))
      let bytes = parsed.buffer
      try {
        const image = nativeImage.createFromBuffer(parsed.buffer)
        if (!image.isEmpty()) bytes = image.toPNG()
      } catch {}
      writeAtomic(file, bytes)
      store.updateProject(payload.projectId, { hasIconImage: true })
      sendLibraryChanged()
      return ok(true)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('project:reorder', (_e, ids: string[]) => {
    store.reorderProjects(ids)
    sendLibraryChanged()
    return ok(true)
  })

  ipcMain.handle('import:api', async (_e, options: ApiImportOptions) => {
    const jobId = uid('job_')
    const controller = new AbortController()
    jobs.set(jobId, controller)
    const progress = (message: string, percent: number, extra?: { items?: number; detail?: string }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('event:import:progress', {
          id: jobId,
          kind: 'api',
          phase: percent >= 100 ? 'done' : 'starting',
          message,
          percent,
          items: extra?.items,
          detail: extra?.detail,
          warnings: [],
          canCancel: true
        })
      }
    }
    try {
      const result = await importFromApi({
        token: String(options.token ?? ''),
        boardRef: String(options.boardRef ?? ''),
        title: options.name,
        projectId: options.projectId,
        downloadImages: options.downloadImages !== false,
        withStyles: options.withStyles !== false,
        maxImageBytes: Number(options.maxImageBytes ?? 32 * 1024 * 1024),
        imageQuality: store.settings.imageQuality,
        signal: controller.signal,
        onProgress: progress
      })
      sendLibraryChanged()
      const thumb = await exportBoard({ docId: result.meta.id, thumbnail: true }).catch(() => '')
      return ok({ ...result.meta, thumbnail: thumb ? 'thumb.png' : undefined })
    } catch (error) {
      return fail(error)
    } finally {
      jobs.delete(jobId)
    }
  })
  ipcMain.handle('import:cancel', (_e, jobId: string) => {
    const job = jobs.get(jobId)
    job?.abort()
    return ok(!!job)
  })
  ipcMain.handle('import:file', (_e, path?: string) => {
    try {
      const chosen = path
        ? path
        : firstPath(
            dialog.showOpenDialogSync(mainWindow ?? undefined!, {
              title: 'Выберите файл доски',
              properties: ['openFile'],
              filters: [{ name: 'Файлы Liro', extensions: ['liro', 'json', 'zip', 'rtb'] }]
            })
          )
      if (!chosen) return fail('Импорт отменён', 'canceled')
      const result = importFromFile({ path: chosen })
      sendLibraryChanged()
      return ok(result.meta)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('import:raw', (_e, payload: { items: unknown[]; title?: string; projectId?: string }) => {
    try {
      const result = buildDoc({
        title: payload.title ?? 'Вставка из буфера',
        rawItems: payload.items as RawItem[],
        source: { kind: 'file', name: payload.title },
        projectId: payload.projectId
      })
      const meta = commitDoc(result.doc)
      sendLibraryChanged()
      return ok(meta)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('import:images', async (_e, payload: { images: Array<{ itemId: string; dataUrl: string }>; items: unknown[]; title?: string; projectId?: string }) => {
    try {
      const images = new Map<string, { mime: string; dataUrl: string; bytes: number }>()
      for (const image of payload.images) {
        images.set(image.itemId, {
          mime: /data:([^;]+)/.exec(image.dataUrl)?.[1] ?? 'image/png',
          dataUrl: image.dataUrl,
          bytes: Math.round(image.dataUrl.length * 0.75)
        })
      }
      const result = buildDoc({
        title: payload.title ?? 'Вставка из буфера',
        rawItems: payload.items as RawItem[],
        images,
        source: { kind: 'file', name: payload.title },
        projectId: payload.projectId
      })
      const meta = commitDoc(result.doc)
      sendLibraryChanged()
      return ok(meta)
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('import:html', async (_e, payload: { html: string; title?: string; projectId?: string }) => {
    try {
      const parsed = parseHtmlPayload(payload.html)
      const result = buildDoc({
        title: payload.title ?? 'Вставка из буфера',
        rawItems: parsed.items as RawItem[],
        source: { kind: 'file', name: payload.title },
        projectId: payload.projectId
      })
      const meta = commitDoc(result.doc)
      sendLibraryChanged()
      return ok(meta)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('capture:open', async (_e, url: string) => {
    try {
      const manager = getCapture()
      const ref = parseBoardRef(url)
      const target = /^https?:/i.test(url) ? url : `https://miro.com/app/board/${encodeURIComponent(ref.boardId)}/`
      if (!ref.boardId && !/^https?:/i.test(url)) return fail('Укажите ссылку на доску')
      manager.openEmbedded(target)
      return ok({ sessionId: 'local', opened: true })
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('capture:snapshot', () => ok(getCapture().snapshot()))
  ipcMain.handle('capture:save', async (_e, _sessionId: string, name?: string, projectId?: string) => {
    try {
      const meta = await getCapture().save({ title: name, projectId })
      const thumb = await exportBoard({ docId: meta.id, thumbnail: true }).catch(() => '')
      sendLibraryChanged()
      return ok({ ...meta, thumbnail: thumb ? 'thumb.png' : undefined })
    } catch (error) {
      return fail(error)
    }
  })
  ipcMain.handle('capture:abort', () => {
    getCapture().reset()
    return ok(true)
  })
  ipcMain.handle('capture:tools', () => {
    const files = buildExtensionFiles()
    return ok(files)
  })
  ipcMain.handle('capture:open-tools', (_e, which: 'folder' | 'xpi' | 'bookmarklet') => {
    const files = buildExtensionFiles()
    if (which === 'folder') revealRoot()
    else if (which === 'xpi') revealPath(files.xpi)
    else shell.openPath(files.bookmarklet)
    return ok(true)
  })
  ipcMain.handle('capture:info', () => {
    const manager = getCapture()
    return ok({ port: manager.port, token: manager.token })
  })
  ipcMain.handle('capture:logout', () => {
    getCapture().closeEmbedded()
    return ok(true)
  })
  ipcMain.handle('source:boards', async (_e, payload: { token: string; teamId: string }) => {
    try {
      const boards: SourceBoardSummary[] = await listBoards(payload.token, payload.teamId)
      return ok(boards)
    } catch (error) {
      return fail(error)
    }
  })

  ipcMain.handle('clipboard:read-html', async () => {
    const html = await readClipboardHtml()
    return ok(html)
  })
  ipcMain.handle('clipboard:write-html', async (_e, payload: { html: string; text: string }) => {
    await writeClipboard(payload.html, payload.text)
    return ok(true)
  })
  ipcMain.handle('clipboard:write-text', (_e, text: string) => {
    clipboard.writeText(String(text ?? ''))
    return ok(true)
  })
  ipcMain.handle('clipboard:write-image', async (_e, payload: { dataUrl: string }) => {
    const parsed = dataUrlToBuffer(payload.dataUrl)
    if (!parsed) return ok(false)
    try {
      const image = nativeImage.createFromBuffer(parsed.buffer)
      if (!image.isEmpty()) {
        syncClipboard.writeImage?.(image)
        return ok(true)
      }
    } catch {}
    await clipboard.write([
      new ClipboardItem({ [parsed.mime]: new Blob([new Uint8Array(parsed.buffer)], { type: parsed.mime }) })
    ])
    return ok(true)
  })

  ipcMain.handle('clipboard:read-image', async () => {
    try {
      const image = syncClipboard.readImage?.()
      if (image && !image.isEmpty()) return ok(image.toDataURL())
    } catch {}
    try {
      const items = await clipboard.read()
      for (const item of items) {
        for (const type of item.types) {
          if (!type.startsWith('image/')) continue
          const payload = await item.getType(type)
          if (typeof payload === 'string') return ok(payload)
          if (!(payload instanceof Blob)) continue
          const bytes = Buffer.from(await payload.arrayBuffer())
          if (!bytes.length) continue
          return ok(`data:${type};base64,${bytes.toString('base64')}`)
        }
      }
      return ok('')
    } catch {
      return ok('')
    }
  })

  ipcMain.handle('dialog:pick-image', async () => {
    if (!mainWindow) return ok('')
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите картинку',
      properties: ['openFile'],
      filters: IMAGE_FILTERS
    })
    if (result.canceled || !result.filePaths.length) return ok('')
    try {
      const buffer = readFileSync(result.filePaths[0])
      const mime = extensionToMime(result.filePaths[0].split('.').pop() ?? '')
      if (!isImageMime(mime)) return ok('')
      return ok(`data:${mime};base64,${buffer.toString('base64')}`)
    } catch {
      return ok('')
    }
  })

  ipcMain.handle('dialog:pick-images', async () => {
    if (!mainWindow) return ok<string[]>([])
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Выберите картинки',
      properties: ['openFile', 'multiSelections'],
      filters: IMAGE_FILTERS
    })
    if (result.canceled || !result.filePaths.length) return ok<string[]>([])
    const images: string[] = []
    for (const filePath of result.filePaths) {
      try {
        const buffer = readFileSync(filePath)
        const mime = extensionToMime(filePath.split('.').pop() ?? '')
        if (!isImageMime(mime)) continue
        images.push(`data:${mime};base64,${buffer.toString('base64')}`)
      } catch {}
    }
    return ok(images)
  })

  ipcMain.handle('window:minimize', (event) => {
  const target = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
  target?.minimize()
  return ok(true)
})
  ipcMain.handle('window:maximize', (event) => {
    const target = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (!target) return ok(false)
    if (target.isMaximized()) target.unmaximize()
    else target.maximize()
    return ok(true)
  })
  ipcMain.handle('window:close', (event) => {
    const target = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    target?.close()
    return ok(true)
  })
  ipcMain.handle('preview:open', (event, payload: PreviewPayload) => {
    openPreview(payload, process.env.ELECTRON_RENDERER_URL)
    return ok(true)
  })
  ipcMain.handle('preview:get', (event) => {
    return ok(previewFor(BrowserWindow.fromWebContents(event.sender)))
  })
  ipcMain.handle('preview:text', (_event, file: string) => {
    return ok(readPreviewText(file))
  })
  ipcMain.handle('image:fetch', async (_event, url: string) => {
    try {
      return ok(await fetchImage(url))
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'image')
    }
  })
  ipcMain.handle('live:pending-code', () => ok(takePendingCode()))
  ipcMain.handle('app:info', () =>    ok({
      version: app.getVersion(),
      electron: process.versions.electron,
      storage: getRoot(),
      platform: process.platform,
      packaged: app.isPackaged
    })
  )
  ipcMain.handle('update:check', (_e, quiet?: boolean) => {
    checkForUpdate(quiet !== true)
    return ok(true)
  })
  ipcMain.handle('update:apply', () => {
    askToRestart()
    return ok(true)
  })
  ipcMain.handle('changes:read', async () => {
    try {
      return ok(await readChanges())
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'changes')
    }
  })
  ipcMain.handle('shell:open-external', async (_e, url: string) => {
    await shell.openExternal(url)
    return ok(true)
  })
  ipcMain.handle('shell:show-item', (_e, target: string) => {
    revealPath(target)
    return ok(true)
  })
  ipcMain.handle('live:host-code', () => ok(newCode()))
  ipcMain.handle('live:host-create', async (_e, offer: string, wanted?: string) => {
    try {
      const code = pickRoomCode(wanted)
      await createRoom(code, String(offer ?? ''))
      return ok(code)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'live')
    }
  })
  ipcMain.handle('live:host-wait', async (_e, code: string) => {
    try {
      const answer = await waitForAnswer(normalizeCode(String(code ?? '')), 120000)
      return ok(answer)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'live')
    }
  })
  ipcMain.handle('live:host-cleanup', async (_e, code: string) => {
    try {
      await deleteRoom(normalizeCode(String(code ?? '')))
      return ok(true)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'live')
    }
  })
  ipcMain.handle('live:guest-fetch', async (_e, code: string) => {
    try {
      const room = await readRoom(normalizeCode(String(code ?? '')))
      return ok(room?.offer ?? null)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'live')
    }
  })
  ipcMain.handle('live:guest-answer', async (_e, code: string, answer: string) => {
    try {
      await writeAnswer(normalizeCode(String(code ?? '')), String(answer ?? ''))
      return ok(true)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'live')
    }
  })
  ipcMain.handle('dialog:pick-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, { properties: ['openDirectory'] })
    if (result.canceled) return fail('Отменено', 'canceled')
    return ok(result.filePaths[0])
  })
  ipcMain.handle('dialog:pick-files', async (_e, filters?: { name: string; extensions: string[] }[]) => {
    const result = await dialog.showOpenDialog(mainWindow ?? undefined!, {
      properties: ['openFile'],
      filters: filters ?? [{ name: 'Все файлы', extensions: ['*'] }]
    })
    if (result.canceled) return fail('Отменено', 'canceled')
    return ok(result.filePaths.map((file) => ({ name: file.split(/[\\/]/).pop() ?? file, path: file, size: 0 })))
  })
  ipcMain.handle('library:export', () => {
    const result = dialog.showSaveDialogSync(mainWindow ?? undefined!, {
      title: 'Экспорт библиотеки',
      defaultPath: 'liro-library.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (!result) return fail('Отменено', 'canceled')
    writeFileSync(result, JSON.stringify(store.index, null, 2), 'utf8')
    return ok(result)
  })
}

function firstPath(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined
  return Array.isArray(value) ? value[0] : value
}

interface SyncClipboard {
  readHTML?: () => string
  writeHTML?: (html: string) => void
  writeText?: (text: string, type?: string) => void
  readImage?: () => { isEmpty(): boolean; toDataURL(): string }
  writeImage?: (image: NativeImage) => void
}

const syncClipboard = clipboard as unknown as SyncClipboard

async function readClipboardHtml(): Promise<string> {
  try {
    const direct = syncClipboard.readHTML?.()
    if (direct) return direct
  } catch {}
  try {
    const items = await clipboard.read()
    for (const item of items) {
      const type = item.types.find((value) => value === 'text/html')
      if (!type) continue
      const value = await item.getType('text/html')
      if (typeof value === 'string') return value
      if (value instanceof Blob) return await value.text()
    }
  } catch {
    return ''
  }
  return ''
}

async function writeClipboard(html: string, text: string): Promise<void> {
  try {
    syncClipboard.writeHTML?.(html)
    syncClipboard.writeText?.(text)
    return
  } catch {}
  await clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([text], { type: 'text/plain' })
    })
  ])
}

const EXPORT_FILE_NAMES: Record<ExportOptions['format'], string> = {
  liro: 'Файл Liro',
  png: 'PNG',
  html: 'HTML',
  svg: 'SVG'
}

function suggestedName(options: ExportOptions): string {
  const doc = store.readDoc(options.docId)
  const base = doc.title.replace(/[\\/:*?"<>|]/g, ' ')
  return `${base}.${options.format}`
}

function exportFilters(options: ExportOptions): Electron.FileFilter[] {
  return [{ name: EXPORT_FILE_NAMES[options.format], extensions: [options.format] }]
}

async function runExport(options: ExportOptions, saveAs: boolean, targetPath?: string): Promise<ExportResult> {
  try {
    const target = targetPath ?? defaultExportPath(options)
    return await exportToPath(options, target)
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function defaultExportPath(options: ExportOptions): string {
  const doc = store.readDoc(options.docId)
  const base = sanitizeFileName(doc.title) || 'board'
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return join(exportFolder(), `${base}-${stamp}.${options.format}`)
}

export function parseHtmlPayload(html: string): { items: unknown[] } {
  const items: unknown[] = []
  const re = /<(div|section|article)\b([^>]*)>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  let index = 0
  while ((match = re.exec(html)) !== null) {
    const attrs = match[2]
    const inner = match[3]
    const style = /style\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? ''
    const left = /left\s*:\s*(-?[\d.]+)px/i.exec(style)
    const top = /top\s*:\s*(-?[\d.]+)px/i.exec(style)
    const width = /width\s*:\s*(-?[\d.]+)px/i.exec(style)
    const height = /height\s*:\s*(-?[\d.]+)px/i.exec(style)
    const type = /data-type\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? 'text'
    const id = /data-item-id\s*=\s*"([^"]*)"/i.exec(attrs)?.[1] ?? `paste_${index}`
    const text = inner.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    items.push({
      id,
      type: /sticky/i.test(type) ? 'sticky_note' : /image/i.test(type) ? 'image' : /shape/i.test(type) ? 'shape' : /text/i.test(type) ? 'text' : 'text',
      x: left ? parseFloat(left[1]) + (width ? parseFloat(width[1]) / 2 : 0) : 0,
      y: top ? parseFloat(top[1]) + (height ? parseFloat(height[1]) / 2 : 0) : 0,
      width: width ? parseFloat(width[1]) : 200,
      height: height ? parseFloat(height[1]) : 60,
      position: { x: left ? parseFloat(left[1]) : 0, y: top ? parseFloat(top[1]) : 0, origin: 'x_y', relativeTo: 'canvas_center' },
      geometry: { width: width ? parseFloat(width[1]) : 200, height: height ? parseFloat(height[1]) : 60 },
      style: {},
      data: { content: inner },
      __pasteIndex: index
    })
    index += 1
  }
  return { items }
}

export function libraryIndex(): LibraryIndex {
  return store.index
}

export function assetsPathFor(docId: string): string {
  return assetsDir(docId)
}