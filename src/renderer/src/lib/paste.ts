import {
  clipboardObjectsToRawItems,
  decodeBoardClipboard,
  isBoardClipboardHtml
} from './boardClipboard'
import { linkHtml } from '@shared/richtext'
import { api } from './api'

export interface PasteImage {
  itemId: string
  dataUrl: string
}

export interface PastePayload {
  label: string
  title: string
  items: unknown[]
  images: PasteImage[]
}

export interface RawTextItem {
  id: string
  type: 'text' | 'image'
  x: number
  y: number
  width: number
  height: number
  position: { x: number; y: number; origin: string; relativeTo: string }
  geometry: { width: number; height: number; rotation: number }
  data: { content?: string; imageUrl?: string; title?: string }
}

function px(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseHtmlToItems(html: string): { items: RawTextItem[]; images: PasteImage[] } {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const items: RawTextItem[] = []
  const images: PasteImage[] = []
  const nodes = Array.from(parsed.body.querySelectorAll<HTMLElement>('*'))
  for (const node of nodes) {
    const style = window.getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    const width = rect.width || px(style.width)
    const height = rect.height || px(style.height)
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? ''
      if (!src.startsWith('data:')) continue
      const id = `paste_img_${items.length}`
      images.push({ itemId: id, dataUrl: src })
      const w = width || 320
      const h = height || 240
      items.push({
        id,
        type: 'image',
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        width: w,
        height: h,
        position: { x: rect.left + w / 2, y: rect.top + h / 2, origin: 'center', relativeTo: 'canvas_center' },
        geometry: { width: w, height: h, rotation: 0 },
        data: { imageUrl: src, title: node.getAttribute('alt') ?? '' }
      })
      continue
    }
    if (style.position !== 'absolute' && style.position !== 'fixed') continue
    const content = (node.textContent ?? '').trim()
    if (!content) continue
    const w = width || 260
    const h = height || 90
    const x = rect.left + window.scrollX
    const y = rect.top + window.scrollY
    items.push({
      id: `paste_txt_${items.length}`,
      type: 'text',
      x,
      y,
      width: w,
      height: h,
      position: { x: x + w / 2, y: y + h / 2, origin: 'center', relativeTo: 'canvas_center' },
      geometry: { width: w, height: h, rotation: 0 },
      data: { content }
    })
  }
  return { items, images }
}

export function parseClipboardHtml(html: string): PastePayload | null {
  if (!html || !html.trim()) return null
  if (isBoardClipboardHtml(html)) {
    const payload = decodeBoardClipboard(html)
    const items = clipboardObjectsToRawItems(payload.data.objects, payload.data.shift)
    return {
      label: 'Формат доски',
      title: 'Вставка объектов',
      items,
      images: []
    }
  }
  const parsed = parseHtmlToItems(html)
  if (!parsed.items.length) return null
  return {
    label: 'Обычный HTML',
    title: 'Вставка из буфера',
    items: parsed.items,
    images: parsed.images
  }
}

export function parseClipboardText(text: string): PastePayload | null {
  if (!text || !text.trim()) return null
  const content = linkHtml(text) || text
  return {
    label: 'Обычный текст',
    title: 'Вставка из буфера',
    items: [
      {
        id: 'paste_text_0',
        type: 'text',
        x: 0,
        y: 0,
        width: 480,
        height: 140,
        position: { x: 240, y: 70, origin: 'center', relativeTo: 'canvas_center' },
        geometry: { width: 480, height: 140, rotation: 0 },
        data: { content }
      }
    ],
    images: []
  }
}

export function readClipboardPayload(): Promise<PastePayload | null> {
  return new Promise((resolve) => {
    const read = async (): Promise<void> => {
      const win = window as Window & {
        navigator: Navigator & { clipboard?: { readText?: () => Promise<string> } }
      }
      try {
        const text = await win.navigator.clipboard?.readText?.()
        if (text) {
          const parsed = parseClipboardText(text)
          if (parsed) return resolve(parsed)
        }
      } catch {}
      resolve(null)
    }
    void read()
  })
}

export function payloadFromEvent(event: ClipboardEvent): PastePayload | null {
  const html = event.clipboardData?.getData('text/html')
  if (html) {
    const parsed = parseClipboardHtml(html)
    if (parsed) return parsed
  }
  const text = event.clipboardData?.getData('text/plain')
  return text ? parseClipboardText(text) : null
}

export function isEditableTarget(target: EventTarget | null): boolean {
  const node = target as HTMLElement | null
  if (!node || typeof node.tagName !== 'string') return false
  const tag = node.tagName.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return node.isContentEditable === true
}

export async function createBoardFromClipboard(
  html: string,
  text: string,
  projectId?: string
): Promise<{ id: string; items: number; images: number } | null> {
  const payload = html ? parseClipboardHtml(html) : text ? parseClipboardText(text) : null
  if (!payload || !payload.items.length) return null
  const meta = await api.importer.withImages({
    items: payload.items,
    images: payload.images,
    title: payload.title,
    projectId
  })
  return { id: meta.id, items: payload.items.length, images: payload.images.length }
}