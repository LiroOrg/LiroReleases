import { app, BrowserWindow } from 'electron'
import updater from 'electron-updater'

const { autoUpdater } = updater

export type UpdatePhase = 'checking' | 'downloading' | 'ready' | 'current' | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  version?: string
  percent?: number
  manual?: boolean
}

const FIRST_DELAY = 9000
const PERIOD = 6 * 60 * 60 * 1000

let win: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let startup: ReturnType<typeof setTimeout> | null = null
let asked = false
let lastPercent = -1
let downloading = false
let manual = false

function send(status: UpdateStatus, terminal = false): void {
  const payload = manual ? { ...status, manual: true } : status
  if (terminal) manual = false
  if (win && !win.isDestroyed()) win.webContents.send('event:update:status', payload)
}

function disabled(): boolean {
  if (!app.isPackaged) return true
  return ['--selftest', '--uitest', '--uitest-hash', '--shot', '--scene', '--scene-script', '--demo', '--tools'].some(
    (flag) => process.argv.includes(flag)
  )
}

function check(): void {
  if (disabled() || asked) return
  try {
    send({ phase: 'checking' })
    void autoUpdater.checkForUpdates().catch(() => undefined)
  } catch {
    send({ phase: 'error' })
  }
}

function wire(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    send({ phase: 'checking' })
  })

  autoUpdater.on('update-available', (info: { version?: string }) => {
    downloading = true
    send({ phase: 'downloading', version: info.version, percent: 0 })
  })

  autoUpdater.on('update-not-available', () => {
    downloading = false
    send({ phase: 'current' }, true)
  })

  autoUpdater.on('download-progress', (progress: { percent?: number }) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)))
    if (percent === lastPercent) return
    lastPercent = percent
    send({ phase: 'downloading', percent })
  })

  autoUpdater.on('update-downloaded', (info: { version?: string }) => {
    downloading = false
    lastPercent = -1
    send({ phase: 'ready', version: info.version }, true)
  })

  autoUpdater.on('error', () => {
    downloading = false
    lastPercent = -1
    send({ phase: 'error' }, true)
  })
}

export function startUpdater(getWindow: () => BrowserWindow | null): void {
  if (disabled()) return
  win = getWindow()
  try {
    wire()
  } catch {
    return
  }
  startup = setTimeout(() => {
    check()
    timer = setInterval(() => {
      if (!downloading && !asked) check()
    }, PERIOD)
  }, FIRST_DELAY)
}

export function askToRestart(): void {
  asked = true
  if (startup) clearTimeout(startup)
  if (timer) clearInterval(timer)
  autoUpdater.quitAndInstall(false, true)
}

export function checkForUpdate(byHand = false): void {
  if (byHand) manual = true
  check()
}

export function stopUpdater(): void {
  if (startup) clearTimeout(startup)
  if (timer) clearInterval(timer)
  startup = null
  timer = null
  win = null
}