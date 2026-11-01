import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import updater from 'electron-updater'
import type { NotifyKind } from '@shared/api'

const { autoUpdater } = updater

export type UpdatePhase = 'checking' | 'downloading' | 'ready' | 'current' | 'error'

export interface UpdateStatus {
  phase: UpdatePhase
  version?: string
  percent?: number
  manual?: boolean
}

interface Paths {
  target: string
  staged: string
  backup: string
  lock: string
  report: string
  request: string
  started: string
  work: string
  bundled: string
  downloaded: string
  exe: string
}

const FIRST_DELAY = 9000
const PERIOD = 10 * 60 * 1000
const QUIET_PERIOD = 60000
const STALL = 30000
const RELEASES = 'LiroOrg/LiroReleases'
const MIN_ASAR = 1000000
const MIN_UPDATER = 10000

let win: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let startup: ReturnType<typeof setTimeout> | null = null
let asked = false
let lastPercent = -1
let downloading = false
let manual = false
let lastCheck = 0
let stagedVersion = ''
let stagedSize = 0

function send(status: UpdateStatus, terminal = false): void {
  const payload = manual ? { ...status, manual: true } : status
  if (terminal) manual = false
  if (win && !win.isDestroyed()) win.webContents.send('event:update:status', payload)
}

function notify(text: string, kind: NotifyKind): void {
  if (win && !win.isDestroyed()) win.webContents.send('event:toast', { text, kind })
}

function disabled(): boolean {
  if (!app.isPackaged) return true
  return ['--selftest', '--uitest', '--uitest-hash', '--shot', '--scene', '--scene-script', '--demo', '--tools'].some(
    (flag) => process.argv.includes(flag)
  )
}

function paths(): Paths | null {
  if (!app.isPackaged || !process.resourcesPath) return null
  const work = join(app.getPath('userData'), 'updater')
  return {
    target: join(process.resourcesPath, 'app.asar'),
    staged: join(work, 'app.next'),
    backup: join(process.resourcesPath, 'app.asar.bak'),
    lock: join(app.getPath('userData'), 'updating.json'),
    report: join(app.getPath('userData'), 'update-result.txt'),
    request: join(work, 'update-request.json'),
    started: join(work, 'started.json'),
    work,
    bundled: join(process.resourcesPath, 'updater', 'Liro-Updater.exe'),
    downloaded: join(work, 'Liro-Updater.exe'),
    exe: process.execPath
  }
}

function stagedReady(where: Paths): boolean {
  if (!stagedVersion || !stagedSize) return false
  try {
    return statSync(where.staged).size === stagedSize && stagedSize > MIN_ASAR
  } catch {
    return false
  }
}

function updaterFile(where: Paths): string | null {
  if (existsSync(where.bundled) && statSync(where.bundled).size > MIN_UPDATER) return where.bundled
  if (existsSync(where.downloaded) && statSync(where.downloaded).size > MIN_UPDATER) return where.downloaded
  return null
}

async function ensureUpdater(version: string): Promise<string | null> {
  const where = paths()
  if (!where) return null
  const ready = updaterFile(where)
  if (ready) return ready
  mkdirSync(where.work, { recursive: true })
  const link = `https://github.com/${RELEASES}/releases/download/v${version}/Liro-Updater.exe`
  try {
    await download(link, where.downloaded)
    if (statSync(where.downloaded).size < MIN_UPDATER) throw new Error('апдейтер слишком мал')
    return where.downloaded
  } catch (error) {
    rmSync(where.downloaded, { force: true })
    note(where, `апдейтер ${version}: ${reason(error)}`)
    return null
  }
}

function launchUpdater(where: Paths, file: string, version: string): void {
  const job = {
    version,
    staged: where.staged,
    target: where.target,
    backup: where.backup,
    exe: where.exe,
    pid: process.pid,
    report: where.report,
    lock: where.lock,
    started: where.started,
    at: Date.now()
  }
  rmSync(where.report, { force: true })
  writeFileSync(where.lock, JSON.stringify({ pid: process.pid, version, at: Date.now() }))
  mkdirSync(where.work, { recursive: true })
  writeFileSync(where.request, JSON.stringify(job))
  const child = spawn(file, [], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, LIRO_UPDATE_REQUEST: where.request }
  })
  child.on('error', () => {
    rmSync(where.lock, { force: true })
    rmSync(where.request, { force: true })
    asked = false
    send({ phase: 'error' }, true)
  })
  child.unref()
  setTimeout(() => app.exit(0), 400)
}

function check(): void {
  if (disabled() || asked) return
  if (!manual && Date.now() - lastCheck < QUIET_PERIOD) return
  lastCheck = Date.now()
  const where = paths()
  if (where && stagedReady(where)) {
    send({ phase: 'ready', version: stagedVersion })
    return
  }
  try {
    send({ phase: 'checking' })
    void autoUpdater.checkForUpdates().catch(() => undefined)
  } catch {
    send({ phase: 'error' })
  }
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
        sink.on('error', (error) => {
          response.destroy()
          reject(error)
        })
        response.on('data', (chunk: Buffer) => {
          request.setTimeout(STALL)
          got += chunk.length
          if (total) report(Math.min(99, Math.round((got / total) * 100)))
        })
        response.on('error', (error) => reject(error))
        response.pipe(sink)
        sink.on('finish', () => sink.close(() => resolve()))
      })
      request.setTimeout(STALL, () => {
        request.destroy(new Error('скачивание встало'))
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
  if (stagedVersion === version && stagedReady(where)) {
    send({ phase: 'ready', version }, true)
    return
  }
  downloading = true
  lastPercent = -1
  stagedVersion = ''
  stagedSize = 0
  send({ phase: 'downloading', version, percent: 0 })
  try {
    mkdirSync(where.work, { recursive: true })
    await download(`https://github.com/${RELEASES}/releases/download/v${version}/app.asar`, where.staged)
    stagedSize = statSync(where.staged).size
    if (stagedSize < MIN_ASAR) throw new Error('файл слишком мал')
    stagedVersion = version
    send({ phase: 'ready', version }, true)
  } catch (error) {
    rmSync(where.staged, { force: true })
    stagedSize = 0
    note(where, `скачивание ${version}: ${reason(error)}`)
    send({ phase: 'error' }, true)
  } finally {
    downloading = false
    lastPercent = -1
  }
}

function reason(error: unknown): string {
  return error instanceof Error ? `${error.message}` : String(error)
}

function note(where: Paths, text: string): void {
  try {
    writeFileSync(join(where.work, 'error.txt'), `${new Date().toISOString()} ${text}`)
  } catch {}
}

function stopTimers(): void {
  if (startup) clearTimeout(startup)
  if (timer) clearInterval(timer)
  startup = null
  timer = null
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

  autoUpdater.on('error', (error: unknown) => {
    downloading = false
    lastPercent = -1
    const where = paths()
    if (where) note(where, `проверка: ${reason(error)}`)
    send({ phase: 'error' }, true)
  })
}

export function takeSwapReport(): { ok: boolean; version: string } | null {
  if (!app.isPackaged) return null
  const where = paths()
  if (!where || !existsSync(where.report)) return null
  let text = ''
  try {
    text = readFileSync(where.report, 'utf8').trim()
    rmSync(where.report, { force: true })
  } catch {
    return null
  }
  const [state, version] = text.split(' ')
  if (state !== 'ok' && state !== 'fail') return null
  return { ok: state === 'ok', version: version ?? '' }
}

export function startUpdater(getWindow: () => BrowserWindow | null): void {
  if (disabled()) return
  win = getWindow()
  setTimeout(() => {
    const result = takeSwapReport()
    if (!result) return
    if (result.ok) notify(`Liro обновлён до ${result.version}`, 'update-applied')
    else notify(`Обновление ${result.version} не применилось: файлы были заняты. Попробуйте ещё раз.`, 'error')
  }, 1600)
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
  stopTimers()
  const where = paths()
  if (!where || !stagedReady(where)) {
    asked = false
    send({ phase: 'error' }, true)
    return
  }
  const version = stagedVersion
  void (async () => {
    const file = await ensureUpdater(version)
    if (!file) {
      asked = false
      send({ phase: 'error' }, true)
      return
    }
    launchUpdater(where, file, version)
  })()
}

export function markAppStarted(): void {
  if (disabled()) return
  const where = paths()
  if (!where) return
  try {
    mkdirSync(where.work, { recursive: true })
    writeFileSync(where.started, JSON.stringify({ pid: process.pid, at: Date.now() }))
  } catch {
    return
  }
}

export function checkForUpdate(byHand = false): void {
  if (byHand) manual = true
  check()
}

export function stopUpdater(): void {
  stopTimers()
  win = null
}
