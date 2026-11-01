import { create } from 'zustand'
import type { CaptureSnapshot } from '@shared/api'
import type { LibraryIndex, Settings } from '@shared/types'
import { api } from './api'

export type ToastKind =
  | 'info'
  | 'error'
  | 'success'
  | 'paste'
  | 'image'
  | 'board'
  | 'folder'
  | 'copy'
  | 'delete'
  | 'undo'
  | 'redo'
  | 'lock'
  | 'unlock'
  | 'align'
  | 'layer'
  | 'export'
  | 'save'
  | 'graph'
  | 'solid'
  | 'text'
  | 'link'
  | 'zoom'
  | 'preview'
  | 'shape'
  | 'check'
  | 'file'
  | 'select'
  | 'update'
  | 'update-check'
  | 'update-ready'
  | 'update-applied'
  | 'clipboard'
  | 'live'
  | 'live-out'
  | 'lead'
  | 'follow'
  | 'locate'
  | 'editable'
  | 'readonly'
  | 'capture'
  | 'archive'

export interface ToastAction {
  id: string
  label: string
  primary?: boolean
  run: () => void
}

export interface Toast {
  id: string
  text: string
  kind: ToastKind
  sticky?: boolean
  progress?: number
  actions?: ToastAction[]
}

export interface ToastOptions {
  sticky?: boolean
  progress?: number
  actions?: ToastAction[]
}

export interface ProgressState {
  id: string
  kind: string
  message: string
  percent: number
  items?: number
  detail?: string
  warnings: string[]
  canCancel: boolean
}

interface AppState {
  ready: boolean
  library: LibraryIndex
  settings: Settings | null
  toasts: Toast[]
  capture: CaptureSnapshot | null
  progress: ProgressState | null
  appInfo: { version: string; electron: string; storage: string; platform: string; packaged: boolean } | null
  init: () => Promise<void>
  setLibrary: (library: LibraryIndex) => void
  setSettings: (settings: Settings) => void
  setCapture: (capture: CaptureSnapshot | null) => void
  setProgress: (progress: ProgressState | null) => void
  toast: (text: string, kind?: Toast['kind'], options?: ToastOptions) => string
  fail: (text: string) => void
  dismiss: (id: string) => void
  patchToast: (id: string, text: string, progress?: number) => void
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  library: { schemaVersion: 1, boards: [], projects: [] },
  settings: null,
  toasts: [],
  capture: null,
  progress: null,
  appInfo: null,

  init: async () => {
    try {
      const [library, settings, appInfo] = await Promise.all([
        api.library.get(),
        api.settings.get(),
        api.app.info().catch(() => null)
      ])
      set({ library, settings, appInfo, ready: true })
      applyTheme(settings.theme)
    } catch (error) {
      set({ ready: true })
      get().fail(error instanceof Error ? error.message : String(error))
    }
  },

  setLibrary: (library) => set({ library }),
  setSettings: (settings) => {
    set({ settings })
    applyTheme(settings.theme)
    if (settings.uiScale !== get().settings?.uiScale) {
      document.documentElement.style.setProperty('--ui-scale', String(settings.uiScale))
    }
  },
  setCapture: (capture) => set({ capture }),
  setProgress: (progress) => set({ progress }),

  toast: (text, kind = 'info', options) => {
    if (options?.sticky) {
      const same = get().toasts.find((item) => item.sticky && item.text === text)
      if (same) return same.id
    }
    const id = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`
    const kept = get().toasts.filter((toast) => toast.sticky)
    const rest = get().toasts.filter((toast) => !toast.sticky).slice(-2)
    set({
      toasts: [
        ...kept,
        ...rest,
        { id, text, kind, sticky: options?.sticky, progress: options?.progress, actions: options?.actions }
      ]
    })
    if (!options?.sticky) {
      window.setTimeout(() => get().dismiss(id), kind === 'error' ? 8000 : 4000)
    }
    return id
  },
  fail: (text) => {
    get().toast(text, 'error')
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
  patchToast: (id, text, progress) =>
    set({
      toasts: get().toasts.map((toast) =>
        toast.id === id ? { ...toast, text, progress: progress ?? toast.progress } : toast
      )
    })
}))

export function applyTheme(theme: Settings['theme']): void {
  const root = document.documentElement
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const dark = theme === 'dark' || (theme === 'system' && prefersDark)
  root.dataset.theme = dark ? 'dark' : 'light'
}

export function themeName(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}