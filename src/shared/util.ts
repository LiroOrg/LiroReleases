import type { BoardItem, Rect, TextPoint } from './types'

export function uid(prefix = ''): string {
  const time = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}${time}${rand}`
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export function slugify(value: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '',
    э: 'e', ю: 'yu', я: 'ya'
  }
  return (
    String(value ?? '')
      .toLowerCase()
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'board'
  )
}

export function parseBoardRef(input: string): { boardId: string; teamId?: string } {
  const raw = String(input ?? '').trim()
  if (!raw) return { boardId: '' }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw)
      const parts = url.pathname.split('/').filter(Boolean)
      const idx = parts.indexOf('board')
      const segment = idx >= 0 && parts[idx + 1] ? parts[idx + 1] : parts[parts.length - 1] ?? ''
      const boardId = decodeURIComponent(segment).split('?')[0]
      const teamId = url.searchParams.get('team_id') ?? url.searchParams.get('team') ?? undefined
      return { boardId, teamId }
    } catch {
      return { boardId: raw }
    }
  }
  const direct = raw.split('?')[0].replace(/\/+$/, '')
  return { boardId: direct }
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б'
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(Math.round(value))
}

export function countNumber(value: number, forms: [string, string, string]): string {
  const amount = Math.abs(Math.trunc(value))
  const hundred = amount % 100
  const tail = amount % 10
  const form = hundred >= 11 && hundred <= 14 ? forms[2] : tail === 1 ? forms[0] : tail >= 2 && tail <= 4 ? forms[1] : forms[2]
  return `${formatNumber(amount)} ${form}`
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function rotatedBox(box: Rect, rotation: number): Rect {
  if (!rotation) return box
  const halfWidth = box.width / 2
  const halfHeight = box.height / 2
  const centerX = box.x + halfWidth
  const centerY = box.y + halfHeight
  const radians = (rotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const expandedX = cos * halfWidth + sin * halfHeight
  const expandedY = sin * halfWidth + cos * halfHeight
  return {
    x: centerX - expandedX,
    y: centerY - expandedY,
    width: expandedX * 2,
    height: expandedY * 2
  }
}

export function boundsOfItems(items: BoardItem[], padding = 120): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const item of items) {
    if (item.kind === 'connector') continue
    const box = rotatedBox({ x: item.x, y: item.y, width: item.w || 1, height: item.h || 1 }, item.rotation)
    if (box.x < minX) minX = box.x
    if (box.y < minY) minY = box.y
    if (box.x + box.width > maxX) maxX = box.x + box.width
    if (box.y + box.height > maxY) maxY = box.y + box.height
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 2400, height: 1600 }
  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(1, maxX - minX + padding * 2),
    height: Math.max(1, maxY - minY + padding * 2)
  }
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y)
}

export function withoutDanglingConnectors(items: BoardItem[], removed: Set<string>): BoardItem[] {
  if (!removed.size) return items
  return items.filter((item) => {
    if (item.kind !== 'connector') return true
    return !(item.startItemId && removed.has(item.startItemId)) && !(item.endItemId && removed.has(item.endItemId))
  })
}

export function roundRect(rect: Rect): Rect {
  return { x: round2(rect.x), y: round2(rect.y), width: round2(rect.width), height: round2(rect.height) }
}

export function sanitizeFileName(value: string): string {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'export'
}

export function mimeToExtension(mime: string, sourceUrl?: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/avif': 'avif',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/x-icon': 'ico',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm'
  }
  const clean = String(mime ?? '').toLowerCase().split(';')[0].trim()
  if (map[clean]) return map[clean]
  if (sourceUrl) {
    try {
      const ext = new URL(sourceUrl).pathname.split('.').pop()?.toLowerCase()
      if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext === 'jpeg' ? 'jpg' : ext
    } catch {
      const ext = sourceUrl.split('?')[0].split('.').pop()?.toLowerCase()
      if (ext && /^[a-z0-9]{2,5}$/.test(ext)) return ext === 'jpeg' ? 'jpg' : ext
    }
  }
  return 'bin'
}

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  apng: 'image/apng',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  xml: 'text/xml',
  log: 'text/plain'
}

export function extensionToMime(ext: string): string {
  return MIME_BY_EXT[String(ext ?? '').toLowerCase()] ?? 'application/octet-stream'
}

export function isImageMime(mime: string): boolean {
  return String(mime ?? '').toLowerCase().startsWith('image/')
}

export function measureTextBox(plain: string, fontSize: number, maxWidth: number): { width: number; height: number } {
  const charWidth = fontSize * 0.52
  const lineHeight = fontSize * 1.25
  const limit = Math.max(8, maxWidth)
  let width = 0
  let height = 0
  for (const line of String(plain ?? '').split('\n')) {
    const needed = line.length * charWidth
    const rows = Math.max(1, Math.ceil(needed / limit))
    width = Math.max(width, Math.min(needed, limit))
    height += rows * lineHeight
  }
  return { width: Math.max(1, Math.round(width)), height: Math.max(lineHeight, Math.round(height)) }
}

export interface FitBoxOptions {
  width: number
  minHeight: number
  fontSize: number
  maxFontSize?: number
  minFontSize?: number
  padX?: number
  padY?: number
}

export function fitTextBox(plain: string, options: FitBoxOptions): { fontSize: number; width: number; height: number } {
  const padX = options.padX ?? 8
  const padY = options.padY ?? 6
  const minFontSize = options.minFontSize ?? 8
  let size = options.maxFontSize ?? options.fontSize
  for (let pass = 0; pass < 14; pass += 1) {
    const inner = measureTextBox(plain, size, options.width - padX * 2)
    if (inner.height + padY * 2 <= options.minHeight || size <= minFontSize) break
    size = Math.max(minFontSize, Math.round(size * 0.92))
  }
  const inner = measureTextBox(plain, size, options.width - padX * 2)
  return {
    fontSize: size,
    width: Math.round(options.width),
    height: Math.max(options.minHeight, inner.height + padY * 2)
  }
}

export function smoothPoints(points: TextPoint[], iterations = 1): TextPoint[] {
  if (points.length < 4 || iterations < 1) return points
  const keepTip = 3
  let current = points
  for (let pass = 0; pass < iterations; pass += 1) {
    const last = current.length - 1
    const next: TextPoint[] = [current[0]]
    for (let index = 1; index < last; index += 1) {
      if (index > last - keepTip) {
        next.push({ x: current[index].x, y: current[index].y })
        continue
      }
      const previous = current[index - 1]
      const following = current[index + 1]
      const gapBefore = Math.hypot(previous.x - current[index].x, previous.y - current[index].y)
      const gapAfter = Math.hypot(following.x - current[index].x, following.y - current[index].y)
      const total = gapBefore + gapAfter
      const share = total > 0.001 ? gapBefore / total : 0.5
      next.push({
        x: previous.x + (following.x - previous.x) * share,
        y: previous.y + (following.y - previous.y) * share
      })
    }
    next.push(current[last])
    current = next
  }
  return current
}