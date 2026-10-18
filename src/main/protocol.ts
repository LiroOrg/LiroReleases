import { app, protocol as electronProtocol, shell } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extensionToMime } from '@shared/util'
import { assetsDir, docDir, foldersDir, getRoot, setRoot } from './paths'

const MIME_MAP: Record<string, string> = {
  html: 'text/html',
  htm: 'text/html',
  js: 'text/javascript',
  json: 'application/json',
  css: 'text/css',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
  xml: 'application/xml',
  mp4: 'video/mp4',
  webm: 'video/webm'
}

export function registerAssetProtocol(): void {
  const scheme = 'lirofile'
  if (!app.isDefaultProtocolClient(scheme)) {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
    app.setAsDefaultProtocolClient(scheme, exe)
  }

  void electronProtocol.handle(scheme, async (request) => {
    let docId = ''
    let file = ''
    try {
      const url = new URL(request.url)
      const segments = url.pathname.split('/').filter(Boolean)
      docId = decodeURIComponent(url.hostname || segments.shift() || '')
      file = decodeURIComponent(segments.join('/'))
    } catch {
      return new Response('Некорректный адрес ресурса', { status: 400 })
    }
    if (!docId || !file) return new Response('Некорректный адрес ресурса', { status: 400 })
    const safeName = file.split('/').pop() ?? file
    if (safeName.includes('..')) return new Response(null, { status: 400 })
    if (docId === 'folder') {
      const iconFile = join(foldersDir(), safeName)
      if (!existsSync(iconFile)) return new Response(null, { status: 404 })
      try {
        const data = await readFile(iconFile)
        const ext = safeName.split('.').pop()?.toLowerCase() ?? ''
        return new Response(new Uint8Array(data), {
          status: 200,
          headers: {
            'content-type': MIME_MAP[ext] ?? extensionToMime(ext),
            'cache-control': 'no-store'
          }
        })
      } catch (error) {
        return new Response(String(error), { status: 500 })
      }
    }
    const assetFile = join(assetsDir(docId), safeName)
    const docFile = join(docDir(docId), safeName)
    const target = existsSync(assetFile) ? assetFile : existsSync(docFile) ? docFile : null
    if (!target) return new Response(null, { status: 404 })
    try {
      const data = await readFile(target)
      const ext = safeName.split('.').pop()?.toLowerCase() ?? ''
      return new Response(new Uint8Array(data), {
        status: 200,
        headers: {
          'content-type': MIME_MAP[ext] ?? extensionToMime(ext),
          'cache-control': 'no-store'
        }
      })
    } catch (error) {
      return new Response(String(error), { status: 500 })
    }
  })
}

export function assetUrl(docId: string, file: string): string {
  return `lirofile://${encodeURIComponent(docId)}/${encodeURIComponent(file)}`
}

export function revealPath(target: string): void {
  if (!existsSync(target)) return
  shell.showItemInFolder(target)
}

export function revealRoot(): void {
  shell.openPath(getRoot())
}

export function storageLabel(): string {
  return getRoot()
}

export function moveStorage(dir: string): string {
  return setRoot(dir)
}

export function toFileUrl(file: string): string {
  return pathToFileURL(file).toString()
}