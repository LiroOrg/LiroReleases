import type { CaptureSnapshot, FileRef, SourceBoardSummary, PreviewPayload, PreviewText } from '@shared/api'
import type { IpcResult } from '@shared/api'
import type { ChangeEntry } from '@shared/changes'
import type { ApiImportOptions, CaptureOptions } from '@shared/types'
import type {
  BoardDoc,
  BoardItem,
  BoardMeta,
  BoardWorkspace,
  ExportOptions,
  ExportResult,
  LibraryIndex,
  Project,
  Settings
} from '@shared/types'

export class AppError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message)
  }
}

async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const result = await promise
  if (!result || result.ok !== true) throw new AppError(result?.error ?? 'Неизвестная ошибка', result?.code)
  return result.data as T
}

export const api = {
  settings: {
    get: () => unwrap(window.liro.api.settingsGet()),
    set: (patch: Partial<Settings>) => unwrap(window.liro.api.settingsSet(patch))
  },
  storage: {
    reveal: () => unwrap(window.liro.api.storageReveal()),
    move: () => unwrap(window.liro.api.storageMove())
  },
  library: {
    get: () => unwrap(window.liro.api.libraryGet()),
    boards: (archived?: boolean) => unwrap(window.liro.api.boardList(archived)),
    exportIndex: () => unwrap(window.liro.api.libraryExport())
  },
  board: {
    open: (docId: string) => unwrap<BoardDoc>(window.liro.api.boardOpen(docId)),
    create: (title: string, projectId?: string) => unwrap<BoardDoc>(window.liro.api.boardCreate(title, projectId)),
    createSession: (title: string) => unwrap<BoardDoc>(window.liro.api.boardCreateSession(title)),
    rename: (docId: string, title: string) => unwrap<BoardMeta>(window.liro.api.boardRename(docId, title)),
    update: (docId: string, patch: Partial<BoardMeta>) =>
      unwrap<BoardMeta>(window.liro.api.boardUpdate(docId, patch as never)),
    remove: (docId: string, deleteFiles: boolean) => unwrap(window.liro.api.boardDelete(docId, deleteFiles)),
    duplicate: (docId: string) => unwrap<BoardMeta>(window.liro.api.boardDuplicate(docId)),
    reorder: (ids: string[]) => unwrap<boolean>(window.liro.api.boardReorder(ids)),
    reveal: (docId: string) => unwrap(window.liro.api.boardReveal(docId)),
    export: (options: ExportOptions) => unwrap<ExportResult>(window.liro.api.boardExport(options)),
    exportSaveAs: (options: ExportOptions) => unwrap<ExportResult>(window.liro.api.boardExportSaveAs(options)),
    thumbnail: (docId: string) => unwrap<string>(window.liro.api.boardRefreshThumbnail(docId)),
    saveViewport: (docId: string, viewport: { x: number; y: number; zoom: number }) =>
      unwrap(window.liro.api.boardSaveViewport(docId, viewport)),
    saveItems: (docId: string, items: unknown[]) => unwrap(window.liro.api.boardSaveItems(docId, items)),
    appendItems: (payload: {
      docId: string
      items: unknown[]
      images?: Array<{ itemId: string; dataUrl: string }>
      offsetX?: number
      offsetY?: number
    }) => unwrap<{ added: number; images: number; renamed?: Record<string, string> }>(
      window.liro.api.boardAppendItems(payload)
    ),
    pasteItems: (payload: { docId: string; sourceDocId: string; items: BoardItem[] }) =>
      unwrap<{ added: number }>(window.liro.api.boardPasteItems(payload)),
    openSource: (docId: string) => unwrap(window.liro.api.boardLinkToSource(docId)),
    assetUrl: (docId: string, file: string) => unwrap<string>(window.liro.api.assetUrl(docId, file)),
    assetData: (docId: string, file: string) => unwrap<string | null>(window.liro.api.assetData(docId, file)),
    workspace: {
      get: (docId: string) => unwrap<BoardWorkspace>(window.liro.api.boardWorkspaceGet(docId)),
      set: (docId: string, patch: BoardWorkspace) => unwrap<boolean>(window.liro.api.boardWorkspaceSet(docId, patch))
    }
  },
  project: {
    create: (name: string) => unwrap<Project>(window.liro.api.projectCreate(name)),
    rename: (id: string, name: string) => unwrap<Project>(window.liro.api.projectRename(id, name)),
    update: (id: string, patch: Partial<Project>) => unwrap<Project>(window.liro.api.projectUpdate(id, patch)),
    remove: (id: string, mode: 'unassign' | 'deleteBoards') => unwrap(window.liro.api.projectDelete(id, mode)),
    reorder: (ids: string[]) => unwrap(window.liro.api.projectReorder(ids)),
    setIconImage: (projectId: string, dataUrl?: string) => unwrap(window.liro.api.projectIconImage(projectId, dataUrl))
  },
  importer: {
    fromApi: (options: ApiImportOptions) => unwrap<BoardMeta>(window.liro.api.importFromApi(options)),
    fromFile: (path?: string) => unwrap<BoardMeta>(window.liro.api.importFromFile(path)),
    raw: (payload: { items: unknown[]; title?: string; projectId?: string }) =>
      unwrap<BoardMeta>(window.liro.api.importRaw(payload)),
    withImages: (payload: {
      items: unknown[]
      images: Array<{ itemId: string; dataUrl: string }>
      title?: string
      projectId?: string
    }) => unwrap<BoardMeta>(window.liro.api.importWithImages(payload)),
    html: (payload: { html: string; title?: string; projectId?: string }) =>
      unwrap<BoardMeta>(window.liro.api.importHtml(payload)),
    fromHtml: (payload: { html: string; title?: string; projectId?: string }) =>
      unwrap<BoardMeta>(window.liro.api.importHtml(payload)),
    cancel: (jobId: string) => unwrap(window.liro.api.importCancel(jobId))
  },
  capture: {
    open: (url: string, options: CaptureOptions) => unwrap(window.liro.api.captureOpen(url, options)),
    snapshot: (sessionId = 'local') => unwrap<CaptureSnapshot>(window.liro.api.captureSnapshot(sessionId)),
    save: (name?: string, projectId?: string) =>
      unwrap<BoardMeta>(window.liro.api.captureSave('local', name, projectId)),
    abort: () => unwrap(window.liro.api.captureAbort('local')),
    tools: () => unwrap<{ xpi: string; bookmarklet: string; toolsDir: string }>(window.liro.api.captureTools()),
    openTools: (which: 'folder' | 'xpi' | 'bookmarklet') => unwrap(window.liro.api.captureOpenTools(which)),
    info: () => unwrap<{ port: number; token: string }>(window.liro.api.captureInfo()),
    logout: () => unwrap(window.liro.api.captureLogout())
  },
  source: {
    boards: (token: string, teamId: string) => unwrap<SourceBoardSummary[]>(window.liro.api.sourceBoards(token, teamId))
  },
  clipboard: {
    readHtml: () => unwrap<string>(window.liro.api.clipboardReadHtml()),
    writeHtml: (html: string, text: string) => unwrap(window.liro.api.clipboardWriteHtml(html, text)),
    writeText: (text: string) => unwrap(window.liro.api.clipboardWriteText(text)),
    writeImage: (dataUrl: string) => unwrap(window.liro.api.clipboardWriteImage(dataUrl)),
    readImage: () => unwrap<string>(window.liro.api.clipboardReadImage())
  },
  dialog: {
    pickImage: () => unwrap<string>(window.liro.api.pickImage()),
    pickImages: () => unwrap<string[]>(window.liro.api.pickImages())
  },
  preview: {
    open: (payload: PreviewPayload) => unwrap(window.liro.api.previewOpen(payload)),
    get: () => unwrap<PreviewPayload | null>(window.liro.api.previewGet()),
    text: (file: string) => unwrap<PreviewText | null>(window.liro.api.previewText(file))
  },
  image: {
    fetch: (url: string) => unwrap<{ dataUrl: string; mime: string; name: string }>(window.liro.api.imageFetch(url))
  },
  windows: {
    minimize: () => unwrap(window.liro.api.windowMinimize()),
    maximize: () => unwrap(window.liro.api.windowMaximize()),
    close: () => unwrap(window.liro.api.windowClose())
  },
  app: {
    info: () =>
      unwrap<{ version: string; electron: string; storage: string; platform: string; packaged: boolean }>(
        window.liro.api.appInfo()
      )
  },
  update: {
    check: (quiet?: boolean) => unwrap(window.liro.api.updateCheck(quiet)),
    apply: () => unwrap(window.liro.api.updateApply())
  },
  changes: {
    read: () => unwrap<ChangeEntry[]>(window.liro.api.changesRead())
  },
  live: {
    hostCreate: (offer: string, code?: string) => unwrap<string>(window.liro.api.liveHostCreate(offer, code)),
    hostCode: () => unwrap<string>(window.liro.api.liveHostCode()),
    hostWait: (code: string) => unwrap<string | null>(window.liro.api.liveHostWait(code)),
    hostCleanup: (code: string) => unwrap<boolean>(window.liro.api.liveHostCleanup(code)),
    guestFetch: (code: string) => unwrap<string | null>(window.liro.api.liveGuestFetch(code)),
    guestAnswer: (code: string, answer: string) => unwrap<boolean>(window.liro.api.liveGuestAnswer(code, answer)),
    pendingCode: () => unwrap<string>(window.liro.api.livePendingCode())
  },
  shell: {
    open: (url: string) => unwrap(window.liro.api.openExternal(url)),
    showItem: (target: string) => unwrap(window.liro.api.shellShowItem(target)),
    pickDirectory: () => unwrap(window.liro.api.pickDirectory()),
    pickFiles: (filters?: { name: string; extensions: string[] }[]) => unwrap<FileRef[]>(window.liro.api.pickFiles(filters))
  }
}

export type { BoardDoc, BoardMeta, CaptureSnapshot, LibraryIndex, Project, Settings, ExportResult }