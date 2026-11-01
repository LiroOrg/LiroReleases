import type {
  ApiImportOptions,
  BoardDoc,
  BoardItem,
  BoardMeta,
  BoardWorkspace,
  CaptureOptions,
  ExportOptions,
  ExportResult,
  ImportProgress,
  LibraryIndex,
  Project,
  Settings
} from './types'

export interface IpcResult<T> {
  ok: boolean
  data?: T
  error?: string
  code?: string
}

export type PreviewKind = 'image' | 'pdf' | 'media' | 'web' | 'text' | 'file'

export type NotifyKind =
  | 'info'
  | 'error'
  | 'success'
  | 'capture'
  | 'update'
  | 'update-check'
  | 'update-ready'
  | 'update-applied'
  | 'live'
  | 'live-out'
  | 'lead'
  | 'follow'
  | 'locate'
  | 'editable'
  | 'readonly'
  | 'clipboard'
  | 'copy'
  | 'board'
  | 'archive'

export interface PreviewPayload {
  kind: PreviewKind
  title: string
  src: string
  detail?: string
  online?: boolean
}

export interface PreviewText {
  content: string
  language: string
  truncated: boolean
}

export interface FileRef {
  name: string
  path: string
  size: number
}

export interface SourceBoardSummary {
  id: string
  name: string
  description?: string
  viewLink: string
  teamId?: string
  modifiedAt?: string
}

export interface StartCaptureResult {
  sessionId: string
  opened: boolean
}

export interface SweepOptions {
  cols: number
  rows: number
  dwellMs: number
  zoomOutSteps: number
}

export interface CaptureSnapshot {
  sessionId: string
  status: 'idle' | 'loading' | 'ready' | 'sweeping' | 'collecting' | 'finishing' | 'done' | 'error'
  boardTitle?: string
  url?: string
  items: number
  assets: number
  bounds?: { x: number; y: number; width: number; height: number }
  warnings: string[]
  needsLogin: boolean
  message?: string
}

export interface ApiLiro {
  settingsGet: () => Promise<IpcResult<Settings>>
  settingsSet: (patch: Partial<Settings>) => Promise<IpcResult<Settings>>
  storageReveal: () => Promise<IpcResult<string>>
  storageMove: () => Promise<IpcResult<string>>

  libraryGet: () => Promise<IpcResult<LibraryIndex>>
  boardList: (archived?: boolean) => Promise<IpcResult<BoardMeta[]>>
  boardOpen: (docId: string) => Promise<IpcResult<BoardDoc>>
  boardCreate: (title: string, projectId?: string) => Promise<IpcResult<BoardDoc>>
  boardCreateSession: (title: string) => Promise<IpcResult<BoardDoc>>
  boardRename: (docId: string, title: string) => Promise<IpcResult<BoardMeta>>
  boardUpdate: (
    docId: string,
    patch: Partial<Pick<BoardMeta, 'projectId' | 'tags' | 'favorite' | 'archived' | 'color' | 'description'>>
  ) => Promise<IpcResult<BoardMeta>>
  boardDelete: (docId: string, deleteFiles: boolean) => Promise<IpcResult<boolean>>
  boardDuplicate: (docId: string) => Promise<IpcResult<BoardMeta>>
  boardReorder: (ids: string[]) => Promise<IpcResult<boolean>>
  boardReveal: (docId: string) => Promise<IpcResult<string>>
  boardExport: (options: ExportOptions) => Promise<IpcResult<ExportResult>>
  boardExportSaveAs: (options: ExportOptions) => Promise<IpcResult<ExportResult>>
  boardRefreshThumbnail: (docId: string) => Promise<IpcResult<string>>
  boardSaveViewport: (docId: string, viewport: { x: number; y: number; zoom: number }) => Promise<IpcResult<boolean>>
  boardSaveItems: (docId: string, items: unknown[]) => Promise<IpcResult<boolean>>
  boardAppendItems: (payload: {
    docId: string
    items: unknown[]
    images?: Array<{ itemId: string; dataUrl: string }>
    offsetX?: number
    offsetY?: number
  }) => Promise<IpcResult<{ added: number; images: number }>>
  boardPasteItems: (payload: { docId: string; sourceDocId: string; items: BoardItem[] }) => Promise<IpcResult<{ added: number }>>
  boardLinkToSource: (docId: string) => Promise<IpcResult<string>>
  boardWorkspaceGet: (docId: string) => Promise<IpcResult<BoardWorkspace>>
  boardWorkspaceSet: (docId: string, patch: BoardWorkspace) => Promise<IpcResult<boolean>>
  assetUrl: (docId: string, file: string) => Promise<IpcResult<string>>
  assetData: (docId: string, file: string) => Promise<IpcResult<string | null>>
  assetMissing: (docId: string) => Promise<IpcResult<boolean>>

  projectCreate: (name: string) => Promise<IpcResult<Project>>
  projectRename: (id: string, name: string) => Promise<IpcResult<Project>>
  projectUpdate: (id: string, patch: Partial<Project>) => Promise<IpcResult<Project>>
  projectDelete: (id: string, mode: 'unassign' | 'deleteBoards') => Promise<IpcResult<boolean>>
  projectReorder: (ids: string[]) => Promise<IpcResult<boolean>>
  projectIconImage: (projectId: string, dataUrl?: string) => Promise<IpcResult<boolean>>

  importFromApi: (options: ApiImportOptions) => Promise<IpcResult<BoardMeta>>
  importCancel: (jobId: string) => Promise<IpcResult<boolean>>
  importFromFile: (path?: string) => Promise<IpcResult<BoardMeta>>
  importRaw: (payload: { items: unknown[]; title?: string; projectId?: string }) => Promise<IpcResult<BoardMeta>>
  importWithImages: (payload: {
    items: unknown[]
    images: Array<{ itemId: string; dataUrl: string }>
    title?: string
    projectId?: string
  }) => Promise<IpcResult<BoardMeta>>
  importHtml: (payload: { html: string; title?: string; projectId?: string }) => Promise<IpcResult<BoardMeta>>
  captureOpen: (url: string, options: CaptureOptions) => Promise<IpcResult<StartCaptureResult>>
  captureSweep: (sessionId: string, options: SweepOptions) => Promise<IpcResult<boolean>>
  captureSave: (sessionId: string, name?: string, projectId?: string) => Promise<IpcResult<BoardMeta>>
  captureAbort: (sessionId: string) => Promise<IpcResult<boolean>>
  captureSnapshot: (sessionId: string) => Promise<IpcResult<CaptureSnapshot>>
  captureLogout: () => Promise<IpcResult<boolean>>
  captureTools: () => Promise<IpcResult<{ xpi: string; bookmarklet: string; toolsDir: string }>>
  captureOpenTools: (which: 'folder' | 'xpi' | 'bookmarklet') => Promise<IpcResult<boolean>>
  captureInfo: () => Promise<IpcResult<{ port: number; token: string }>>
  sourceBoards: (token: string, teamId: string) => Promise<IpcResult<SourceBoardSummary[]>>
  clipboardReadHtml: () => Promise<IpcResult<string>>
  clipboardWriteHtml: (html: string, text: string) => Promise<IpcResult<boolean>>
  clipboardWriteText: (text: string) => Promise<IpcResult<boolean>>
  clipboardWriteImage: (dataUrl: string) => Promise<IpcResult<boolean>>
  clipboardReadImage: () => Promise<IpcResult<string>>
  pickImage: () => Promise<IpcResult<string>>
  pickImages: () => Promise<IpcResult<string[]>>
  shellShowItem: (target: string) => Promise<IpcResult<boolean>>
  libraryExport: () => Promise<IpcResult<string>>

  windowMinimize: () => Promise<IpcResult<boolean>>
  previewOpen: (payload: PreviewPayload) => Promise<IpcResult<boolean>>
  previewGet: () => Promise<IpcResult<PreviewPayload | null>>
  previewText: (file: string) => Promise<IpcResult<PreviewText | null>>
  imageFetch: (url: string) => Promise<IpcResult<{ dataUrl: string; mime: string; name: string }>>
  windowMaximize: () => Promise<IpcResult<boolean>>
  windowClose: () => Promise<IpcResult<boolean>>
  appInfo: () => Promise<IpcResult<{ version: string; electron: string; storage: string; platform: string; packaged: boolean }>>
  openExternal: (url: string) => Promise<IpcResult<boolean>>
  pickDirectory: () => Promise<IpcResult<string>>
  pickFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<IpcResult<FileRef[]>>
  updateCheck: (quiet?: boolean) => Promise<IpcResult<boolean>>
  updateApply: () => Promise<IpcResult<boolean>>

  liveHostCreate: (offer: string, code?: string) => Promise<IpcResult<string>>
  liveHostCode: () => Promise<IpcResult<string>>
  liveHostWait: (code: string) => Promise<IpcResult<string | null>>
  liveHostCleanup: (code: string) => Promise<IpcResult<boolean>>
  liveGuestFetch: (code: string) => Promise<IpcResult<string | null>>
  liveGuestAnswer: (code: string, answer: string) => Promise<IpcResult<boolean>>
  livePendingCode: () => Promise<IpcResult<string>>
}

export type BoardCommand = 'undo' | 'redo' | 'duplicate' | 'delete' | 'select-all'

export interface LiveOfferResult {
  ok: boolean
  code: string
  error?: string
}

export interface LiveJoinResult {
  ok: boolean
  offer?: string
  error?: string
}

export type UpdatePhase = 'checking' | 'downloading' | 'ready' | 'current' | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  version?: string
  percent?: number
  manual?: boolean
}

export interface Events {
  'import:progress': ImportProgress
  'capture:update': CaptureSnapshot
  'settings:changed': Settings
  'library:changed': LibraryIndex
  'board:opened': string
  'window:state': { maximized: boolean; minimized?: boolean }
  'nav:go': string
  'board:command': BoardCommand
  'toast': { text: string; kind: NotifyKind }
  'update:status': UpdateStatus
  'live:join': string
}