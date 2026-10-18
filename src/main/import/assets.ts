import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { net, type Session } from 'electron'
import type { AssetRef } from '@shared/types'
import { extensionToMime, isImageMime, mimeToExtension, sanitizeFileName } from '@shared/util'
import { assetsDir } from '../paths'

export interface FetchContext {
  token?: string
  session?: Session
  maxBytes: number
  boardId?: string
  allowRemoteFallback?: boolean
}

export interface DownloadedAsset {
  ref: AssetRef
  key: string
  duplicate?: boolean
}

async function cookieHeader(session: Session, url: string): Promise<string> {
  try {
    const cookies = await session.cookies.get({ url })
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  } catch {
    return ''
  }
}

export async function httpGet(url: string, ctx: FetchContext): Promise<Response | null> {
  const headers: Record<string, string> = { Accept: '*/*', 'User-Agent': 'Mozilla/5.0 Liro' }
  if (ctx.token) headers.Authorization = `Bearer ${ctx.token}`
  if (ctx.session) {
    const cookie = await cookieHeader(ctx.session, url)
    if (cookie) headers.Cookie = cookie
  }
  try {
    return await net.fetch(url, { headers, redirect: 'follow' })
  } catch {
    try {
      return await fetch(url, { headers, redirect: 'follow' })
    } catch {
      return null
    }
  }
}

export async function httpJson<T>(url: string, ctx: FetchContext): Promise<T | null> {
  const response = await httpGet(url, ctx)
  if (!response || !response.ok) return null
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

export class AssetStore {
  private cache = new Map<string, AssetRef>()
  readonly refs: Record<string, AssetRef> = {}

  constructor(
    private docId: string,
    private ctx: FetchContext,
    private quality: 'original' | 'high' | 'medium' = 'original'
  ) {}

  keyFor(buffer: Buffer, mime: string): string {
    const ext = mimeToExtension(mime)
    const hash = createHash('sha1').update(buffer).digest('hex')
    return `${hash.slice(0, 20)}.${ext}`
  }

  async save(buffer: Buffer, mime: string, sourceUrl?: string): Promise<DownloadedAsset> {
    const key = this.keyFor(buffer, mime)
    const cached = this.cache.get(key) ?? this.refs[key]
    const dir = assetsDir(this.docId)
    const file = join(dir, key)
    if (cached) return { ref: cached, key, duplicate: true }
    if (!existsSync(file)) await writeFile(file, buffer)
    const ref: AssetRef = {
      file: key,
      mime: isImageMime(mime) ? mime : extensionToMime(mimeToExtension(mime)),
      bytes: buffer.byteLength,
      sourceUrl
    }
    this.cache.set(key, ref)
    this.refs[key] = ref
    return { ref, key }
  }

  totalBytes(): number {
    return Object.values(this.refs).reduce((sum, ref) => sum + (ref.bytes || 0), 0)
  }

  get needReencode(): boolean {
    return this.quality !== 'original'
  }

  limitFor(): number {
    return this.quality === 'medium' ? 1_400_000 : 2_600_000
  }

  async download(sourceUrl: string, sourceMime?: string): Promise<DownloadedAsset | null> {
    if (!sourceUrl) return null
    const direct = await this.tryDownload(sourceUrl)
    if (direct) return direct
    if (this.ctx.boardId && !/^https?:/i.test(sourceUrl)) {
      const apiUrl = `https://api.miro.com/v1/boards/${this.ctx.boardId}/images/${encodeURIComponent(sourceUrl)}`
      const viaApi = await this.tryDownload(apiUrl, 'image/png')
      if (viaApi) return viaApi
    }
    if (this.ctx.boardId && /^https?:/i.test(sourceUrl)) {
      const m = /\/images\/([A-Za-z0-9_-]{6,})/.exec(sourceUrl)
      if (m) {
        const viaApi = await this.tryDownload(
          `https://api.miro.com/v1/boards/${this.ctx.boardId}/images/${m[1]}`,
          'image/png'
        )
        if (viaApi) return viaApi
      }
    }
    return null
  }

  private async tryDownload(url: string, mimeHint?: string): Promise<DownloadedAsset | null> {
    const target = normalizeResourceUrl(url)
    const response = await httpGet(target, { ...this.ctx })
    if (!response || !response.ok) return null
    const type = (response.headers.get('content-type') ?? mimeHint ?? '').split(';')[0].trim()
    const declared = Number(response.headers.get('content-length') ?? '0')
    if (declared && declared > this.ctx.maxBytes) return null
    let buffer: Buffer
    try {
      buffer = Buffer.from(await response.arrayBuffer())
    } catch {
      return null
    }
    if (buffer.byteLength > this.ctx.maxBytes) return null
    if (buffer.byteLength < 64) return null
    const mime = type || sniffMime(buffer) || mimeHint || 'application/octet-stream'
    return this.save(buffer, mime, url)
  }
}

export function normalizeResourceUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (/\/\/(api\.)?miro\.com$/i.test(parsed.hostname)) {
      if (/\/(resources|images|documents)\//.test(parsed.pathname)) {
        parsed.searchParams.set('redirect', 'true')
      }
    }
    return parsed.toString()
  } catch {
    return url
  }
}

export function sniffMime(buffer: Buffer): string | undefined {
  if (buffer.length < 12) return undefined
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer.subarray(0, 3).toString('latin1') === 'GIF') return 'image/gif'
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP')
    return 'image/webp'
  if (buffer.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('latin1')
    if (brand.startsWith('avif') || brand.startsWith('avis')) return 'image/avif'
    if (brand.startsWith('heic')) return 'image/heic'
  }
  if (buffer[0] === 0x3c) return 'image/svg+xml'
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp'
  if (buffer.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf'
  return undefined
}

export function fileNameForAsset(asset: AssetRef, fallbackIndex: number): string {
  const ext = mimeToExtension(asset.mime, asset.sourceUrl)
  const base = sanitizeFileName((asset.sourceUrl ?? '').split('/').pop()?.split('?')[0] ?? '')
  return base ? `${base}.${ext}` : `asset_${fallbackIndex}.${ext}`
}