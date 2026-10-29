import { spawn } from 'node:child_process'
import { createWriteStream, existsSync } from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
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
const RELEASES = 'LiroOrg/LiroReleases'

let win: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let startup: ReturnType<typeof setTimeout> | null = null
let asked = false
let lastPercent = -1
let downloading = false
let manual = false
let stagedVersion = ''

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

function paths(): { target: string; staged: string } | null {
  if (!app.isPackaged || !process.resourcesPath) return null
  return { target: join(process.resourcesPath, 'app.asar'), staged: join(process.resourcesPath, 'app.asar.next') }
}

function quote(value: string): string {
  return value.replace(/'/g, "''")
}

function report(percent: number): void {
  if (percent === lastPercent) return
  lastPercent = percent
  send({ phase: 'downloading', percent })
}

function download(link: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (url: string, depth: number): void => {
      if (depth > 5) {
        reject(new Error('слишком много перенаправлений'))
        return
      }
      const request = https.get(url, { headers: { 'user-agent': 'Liro' } }, (response) => {
        const code = response.statusCode ?? 0
        const location = response.headers.location
        if ([301, 302, 303, 307, 308].includes(code) && location) {
          response.destroy()
          follow(new URL(location, url).toString(), depth + 1)
          return
        }
        if (code !== 200) {
          response.destroy()
          reject(new Error(`сервер ответил ${code}`))
          return
        }
        const total = Number(response.headers['content-length'] ?? 0)
        let got = 0
        const sink = createWriteStream(file)
        response.on('data', (chunk: Buffer) => {
          got += chunk.length
          if (total) report(Math.min(99, Math.round((got / total) * 100)))
        })
        response.pipe(sink)
        sink.on('finish', () => sink.close(() => resolve()))
        sink.on('error', (error) => reject(error))
      })
      request.on('error', (error) => reject(error))
    }
    follow(link, 0)
  })
}

async function patchAsar(version: string): Promise<void> {
  const where = paths()
  if (!where) {
    send({ phase: 'current' }, true)
    return
  }
  downloading = true
  lastPercent = -1
  send({ phase: 'downloading', version, percent: 0 })
  try {
    await download(`https://github.com/${RELEASES}/releases/download/v${version}/app.asar`, where.staged)
    stagedVersion = version
    downloading = false
    lastPercent = -1
    send({ phase: 'ready', version }, true)
  } catch {
    downloading = false
    lastPercent = -1
    stagedVersion = ''
    send({ phase: 'error' }, true)
  }
}

function swapAndRestart(where: { target: string; staged: string }): void {
  const script =
    `while (Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) { Start-Sleep -Milliseconds 200 }; ` +
    `Move-Item -Force -LiteralPath '${quote(where.staged)}' -Destination '${quote(where.target)}'; ` +
    `Start-Process -FilePath '${quote(process.execPath)}'`
  spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script], {
    detached: true,
    stdio: 'ignore'
  }).unref()
  app.exit(0)
}

function wire(): void {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = null

  autoUpdater.on('checking-for-update', () => {
    send({ phase: 'checking' })
  })

  autoUpdater.on('update-available', (info: { version?: string }) => {
    if (info.version) void patchAsar(info.version)
  })

  autoUpdater.on('update-not-available', () => {
    downloading = false
    send({ phase: 'current' }, true)
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
  const where = paths()
  if (stagedVersion && where && existsSync(where.staged)) {
    swapAndRestart(where)
    return
  }
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