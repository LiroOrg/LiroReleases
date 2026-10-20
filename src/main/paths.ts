import { app } from 'electron'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

let cachedRoot: string | null = null

const LEGACY_DIRS = ['miroapp']

function defaultRoot(): string {
  return join(app.getPath('userData'), 'library')
}

export function migrateLegacyData(): void {
  const current = app.getPath('userData')
  const base = dirname(current)
  const here = basename(current).toLowerCase()
  for (const name of LEGACY_DIRS) {
    if (name.toLowerCase() === here) continue
    const legacy = join(base, name)
    if (!existsSync(legacy)) continue
    const legacyLibrary = join(legacy, 'library')
    if (!existsSync(legacyLibrary)) continue
    if (!existsSync(current)) {
      try {
        renameSync(legacy, current)
        continue
      } catch {
        mkdirSync(current, { recursive: true })
      }
    }
    const currentLibrary = join(current, 'library')
    const legacyFilled = readdirSync(legacyLibrary).length > 0
    const currentFilled = existsSync(currentLibrary) && readdirSync(currentLibrary).length > 0
    if (legacyFilled && !currentFilled) {
      try {
        cpSync(legacyLibrary, currentLibrary, { recursive: true })
      } catch {
        continue
      }
    }
    const legacyPointer = join(legacy, 'storage.json')
    const currentPointer = join(current, 'storage.json')
    if (existsSync(legacyPointer) && !existsSync(currentPointer)) {
      try {
        cpSync(legacyPointer, currentPointer)
      } catch {
        continue
      }
    }
    rmSync(legacyLibrary, { recursive: true, force: true })
    rmSync(legacyPointer, { force: true })
    try {
      rmSync(legacy, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 })
    } catch {
      continue
    }
  }
}

export function getRoot(): string {
  if (cachedRoot && existsSync(cachedRoot)) return cachedRoot
  const pointer = join(app.getPath('userData'), 'storage.json')
  let custom: string | null = null
  try {
    if (existsSync(pointer)) {
      const parsed = JSON.parse(readFileSync(pointer, 'utf8')) as { root?: string }
      if (parsed.root) custom = resolve(parsed.root)
    }
  } catch {
    custom = null
  }
  if (custom && existsSync(custom)) cachedRoot = custom
  else cachedRoot = defaultRoot()
  mkdirSync(cachedRoot, { recursive: true })
  return cachedRoot
}

export function setRoot(dir: string | null): string {
  const pointer = join(app.getPath('userData'), 'storage.json')
  if (dir) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(pointer, JSON.stringify({ root: resolve(dir) }, null, 2), 'utf8')
    cachedRoot = resolve(dir)
  } else {
    rmSync(pointer, { force: true })
    cachedRoot = defaultRoot()
    mkdirSync(cachedRoot, { recursive: true })
  }
  mkdirSync(cachedRoot, { recursive: true })
  return cachedRoot
}

export function boardsDir(): string {
  return join(getRoot(), 'boards')
}

export function docDir(docId: string): string {
  return join(boardsDir(), docId)
}

export function docFile(docId: string): string {
  return join(docDir(docId), 'board.json')
}

export function assetsDir(docId: string): string {
  return join(docDir(docId), 'assets')
}

export function thumbFile(docId: string): string {
  return join(docDir(docId), 'thumb.png')
}

export function workspaceFile(docId: string): string {
  return join(docDir(docId), 'workspace.json')
}

export function indexFile(): string {
  return join(getRoot(), 'index.json')
}

export function settingsFile(): string {
  return join(getRoot(), 'settings.json')
}

export function foldersDir(): string {
  return join(getRoot(), 'folders')
}

export function folderIconFile(projectId: string): string {
  return join(foldersDir(), `${projectId}.png`)
}

export function tempDir(): string {
  const dir = join(app.getPath('temp'), 'liro')
  mkdirSync(dir, { recursive: true })
  return dir
}

export function writeAtomic(file: string, data: string | Buffer): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  writeFileSync(tmp, data)
  renameSync(tmp, file)
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    if (!existsSync(file)) return fallback
    const text = readFileSync(file, 'utf8')
    if (!text.trim()) return fallback
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}