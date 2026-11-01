import { contextBridge, ipcRenderer } from 'electron'
import type { ApiLiro, Events, PreviewPayload } from '@shared/api'

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> => ipcRenderer.invoke(channel, ...args) as Promise<T>

const api: ApiLiro = {
  settingsGet: () => invoke('settings:get'),
  settingsSet: (patch) => invoke('settings:set', patch),
  storageReveal: () => invoke('storage:reveal'),
  storageMove: () => invoke('storage:move'),

  libraryGet: () => invoke('library:get'),
  boardList: (archived) => invoke('board:list', archived),
  boardOpen: (docId) => invoke('board:open', docId),
  boardCreate: (title, projectId) => invoke('board:create', title, projectId),
  boardCreateSession: (title) => invoke('board:create-session', title),
  boardRename: (docId, title) => invoke('board:rename', docId, title),
  boardUpdate: (docId, patch) => invoke('board:update', docId, patch),
  boardDelete: (docId, deleteFiles) => invoke('board:delete', docId, deleteFiles),
  boardDuplicate: (docId) => invoke('board:duplicate', docId),
  boardReorder: (ids) => invoke('board:reorder', ids),
  boardReveal: (docId) => invoke('board:reveal', docId),
  boardExport: (options) => invoke('board:export', options),
  boardExportSaveAs: (options) => invoke('board:export-save-as', options),
  boardRefreshThumbnail: (docId) => invoke('board:thumbnail', docId),
  boardSaveViewport: (docId, viewport) => invoke('board:viewport', docId, viewport),
  boardSaveItems: (docId, items) => invoke('board:items', docId, items),
  boardAppendItems: (payload) => invoke('board:append', payload),
  boardPasteItems: (payload) => invoke('board:paste-items', payload),
  boardLinkToSource: (docId) => invoke('board:link-source', docId),
  boardWorkspaceGet: (docId) => invoke('board:workspace-get', docId),
  boardWorkspaceSet: (docId, patch) => invoke('board:workspace-set', docId, patch),
  assetUrl: (docId, file) => invoke('asset:url', docId, file),
  assetData: (docId, file) => invoke('asset:data', docId, file),
  assetMissing: (docId) => invoke('asset:missing', docId),

  projectCreate: (name) => invoke('project:create', name),
  projectRename: (id, name) => invoke('project:rename', id, name),
  projectUpdate: (id, patch) => invoke('project:update', id, patch),
  projectDelete: (id, mode) => invoke('project:delete', id, mode),
  projectReorder: (ids) => invoke('project:reorder', ids),
  projectIconImage: (projectId, dataUrl) => invoke('project:icon-image', { projectId, dataUrl }),

  importFromApi: (options) => invoke('import:api', options),
  importCancel: (jobId) => invoke('import:cancel', jobId),
  importFromFile: (path) => invoke('import:file', path),
  importRaw: (payload) => invoke('import:raw', payload),
  importWithImages: (payload) => invoke('import:images', payload),
  importHtml: (payload) => invoke('import:html', payload),
  captureOpen: (url, options) => invoke('capture:open', url, options),
  captureSweep: (sessionId, options) => invoke('capture:sweep', sessionId, options),
  captureSave: (sessionId, name, projectId) => invoke('capture:save', sessionId, name, projectId),
  captureAbort: (sessionId) => invoke('capture:abort', sessionId),
  captureSnapshot: (sessionId) => invoke('capture:snapshot', sessionId),
  captureLogout: () => invoke('capture:logout'),
  captureTools: () => invoke('capture:tools'),
  captureOpenTools: (which) => invoke('capture:open-tools', which),
  captureInfo: () => invoke('capture:info'),
  sourceBoards: (token, teamId) => invoke('source:boards', { token, teamId }),
  clipboardReadHtml: () => invoke('clipboard:read-html'),
  clipboardWriteHtml: (html, text) => invoke('clipboard:write-html', { html, text }),
  clipboardWriteText: (text) => invoke('clipboard:write-text', text),
  clipboardWriteImage: (dataUrl) => invoke('clipboard:write-image', { dataUrl }),
  clipboardReadImage: () => invoke('clipboard:read-image'),
  pickImage: () => invoke('dialog:pick-image'),
  pickImages: () => invoke('dialog:pick-images'),
  shellShowItem: (target) => invoke('shell:show-item', target),
  libraryExport: () => invoke('library:export'),

  windowMinimize: () => invoke('window:minimize'),
  previewOpen: (payload: PreviewPayload) => invoke('preview:open', payload),
  previewGet: () => invoke('preview:get'),
  previewText: (file) => invoke('preview:text', file),
  imageFetch: (url) => invoke('image:fetch', url),
  windowMaximize: () => invoke('window:maximize'),
  windowClose: () => invoke('window:close'),
  appInfo: () => invoke('app:info'),
  openExternal: (url) => invoke('shell:open-external', url),
  pickDirectory: () => invoke('dialog:pick-directory'),
  pickFiles: (filters) => invoke('dialog:pick-files', filters),
  updateCheck: (quiet?: boolean) => invoke('update:check', quiet),
  updateApply: () => invoke('update:apply'),
  changesRead: () => invoke('changes:read'),
  liveHostCreate: (offer, code) => invoke('live:host-create', offer, code),
  liveHostCode: () => invoke('live:host-code'),
  liveHostWait: (code) => invoke('live:host-wait', code),
  liveHostCleanup: (code) => invoke('live:host-cleanup', code),
  liveGuestFetch: (code) => invoke('live:guest-fetch', code),
  liveGuestAnswer: (code, answer) => invoke('live:guest-answer', code, answer),
  livePendingCode: () => invoke('live:pending-code')
}

const CHANNELS: Array<keyof Events> = [
  'import:progress',
  'capture:update',
  'settings:changed',
  'library:changed',
  'board:opened',
  'window:state',
  'nav:go',
  'board:command',
  'toast',
  'update:status',
  'live:join'
]

contextBridge.exposeInMainWorld('liro', {
  api,
  subscribe: <K extends keyof Events>(channel: K, handler: (payload: Events[K]) => void): (() => void) => {
    if (!CHANNELS.includes(channel)) return () => undefined
    const listener = (_event: unknown, payload: Events[K]): void => handler(payload)
    ipcRenderer.on(`event:${String(channel)}`, listener)
    return () => {
      ipcRenderer.removeListener(`event:${String(channel)}`, listener)
    }
  }
})