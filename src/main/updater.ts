import { spawn } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
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

interface Paths {
  target: string
  staged: string
  backup: string
  lock: string
  report: string
  script: string
  exe: string
}

const FIRST_DELAY = 9000
const PERIOD = 10 * 60 * 1000
const RELEASES = 'LiroOrg/LiroReleases'
const MIN_ASAR = 1000000
const WAIT_LIMIT = 45000
const STALE_LOCK = 120000

let win: BrowserWindow | null = null
let timer: ReturnType<typeof setInterval> | null = null
let startup: ReturnType<typeof setTimeout> | null = null
let asked = false
let lastPercent = -1
let downloading = false
let manual = false
let stagedVersion = ''
let stagedSize = 0

function send(status: UpdateStatus, terminal = false): void {
  const payload = manual ? { ...status, manual: true } : status
  if (terminal) manual = false
  if (win && !win.isDestroyed()) win.webContents.send('event:update:status', payload)
}

function notify(text: string, kind: 'info' | 'error' | 'success'): void {
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
  const work = app.getPath('userData')
  return {
    target: join(process.resourcesPath, 'app.asar'),
    staged: join(process.resourcesPath, 'app.asar.next'),
    backup: join(process.resourcesPath, 'app.asar.bak'),
    lock: join(work, 'updating.json'),
    report: join(work, 'update-result.txt'),
    script: join(work, 'update-swap.ps1'),
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

function quote(value: string): string {
  return value.replace(/'/g, "''")
}

function swapScript(where: Paths, size: number, version: string): string {
  const target = quote(where.target)
  return [
    '$ErrorActionPreference = \'SilentlyContinue\'',
    `$deadline = (Get-Date).AddSeconds(${Math.round(WAIT_LIMIT / 1000)})`,
    `while ((Get-Process -Id ${process.pid} -ErrorAction SilentlyContinue) -and ((Get-Date) -lt $deadline)) { Start-Sleep -Milliseconds 200 }`,
    '$done = $false',
    'for ($i = 0; $i -lt 200; $i++) {',
    '  try {',
    `    Copy-Item -LiteralPath '${target}' -Destination '${quote(where.backup)}' -Force -ErrorAction Stop`,
    `    Copy-Item -LiteralPath '${quote(where.staged)}' -Destination '${target}' -Force -ErrorAction Stop`,
    `    if ((Get-Item -LiteralPath '${target}').Length -eq ${size}) { $done = $true; break }`,
    '  } catch {',
    '    Start-Sleep -Milliseconds 250',
    '  }',
    '}',
    `if (-not $done) { Copy-Item -LiteralPath '${quote(where.backup)}' -Destination '${target}' -Force }`,
    `Remove-Item -LiteralPath '${quote(where.staged)}' -Force`,
    `Set-Content -LiteralPath '${quote(where.report)}' -Value "$(if ($done) { 'ok' } else { 'fail' }) ${version}" -Encoding ascii`,
    `Remove-Item -LiteralPath '${quote(where.lock)}' -Force`,
    `Start-Process -FilePath '${quote(where.exe)}'`,
    ''
  ].join('\n')
}

function check(): void {
  if (disabled() || asked) return
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
    await download(`https://github.com/${RELEASES}/releases/download/v${version}/app.asar`, where.staged)
    stagedSize = statSync(where.staged).size
    if (stagedSize < MIN_ASAR) throw new Error('файл слишком мал')
    stagedVersion = version
    send({ phase: 'ready', version }, true)
  } catch {
    rmSync(where.staged, { force: true })
    stagedSize = 0
    send({ phase: 'error' }, true)
  } finally {
    downloading = false
    lastPercent = -1
  }
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

  autoUpdater.on('error', () => {
    downloading = false
    lastPercent = -1
    send({ phase: 'error' }, true)
  })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitingPage(): string {
  return [
    '<!doctype html><meta charset="utf-8">',
    '<style>',
    'html,body{height:100%;margin:0}',
    'body{display:grid;place-items:center;background:#ffffff;color:#111114;',
    "font:13px/1.5 'Segoe UI',system-ui,sans-serif;-webkit-user-select:none;user-select:none}",
    '.c{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center}',
    '.t{font-weight:600}',
    '.p{font-size:11.5px;color:#5f5f66}',
    '.s{width:22px;height:22px;border-radius:50%;border:2px solid #d8d8dd;border-top-color:#111114;',
    'animation:r .8s linear infinite}',
    '@keyframes r{to{transform:rotate(360deg)}}',
    '</style>',
    '<div class="c"><div class="s"></div><div class="t">Liro обновляется</div>',
    '<div class="p">Приложение откроется через несколько секунд</div></div>'
  ].join('')
}

export async function waitForUpdate(): Promise<void> {
  if (disabled()) return
  const where = paths()
  if (!where || !existsSync(where.lock)) return
  try {
    const info = JSON.parse(readFileSync(where.lock, 'utf8')) as { at?: number }
    if (Date.now() - Number(info.at ?? 0) > STALE_LOCK) {
      rmSync(where.lock, { force: true })
      return
    }
  } catch {
    rmSync(where.lock, { force: true })
    return
  }
  const box = new BrowserWindow({
    width: 340,
    height: 132,
    show: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    center: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  await box.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(waitingPage())}`)
  const limit = Date.now() + WAIT_LIMIT
  while (existsSync(where.lock) && Date.now() < limit && !box.isDestroyed()) await wait(400)
  if (!box.isDestroyed()) box.close()
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
    if (result.ok) notify(`Liro обновлён до ${result.version}`, 'success')
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
  const size = stagedSize
  const version = stagedVersion
  try {
    rmSync(where.report, { force: true })
    writeFileSync(where.lock, JSON.stringify({ pid: process.pid, version, size, at: Date.now() }))
    writeFileSync(where.script, swapScript(where, size, version))
  } catch {
    rmSync(where.lock, { force: true })
    asked = false
    send({ phase: 'error' }, true)
    return
  }
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', where.script],
    { detached: true, stdio: 'ignore' }
  )
  child.on('error', () => {
    rmSync(where.lock, { force: true })
    asked = false
    send({ phase: 'error' }, true)
  })
  child.unref()
  setTimeout(() => app.exit(0), 400)
}

export function checkForUpdate(byHand = false): void {
  if (byHand) manual = true
  check()
}

export function stopUpdater(): void {
  stopTimers()
  win = null
}
