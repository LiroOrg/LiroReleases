import type { BoardItem } from '@shared/types'

const TAG = 'liro-objects-v1'

export interface LiroClipboardPayload {
  version: 1
  docId: string
  items: BoardItem[]
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function decodeBase64(value: string): string {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new TextDecoder('utf-8').decode(bytes)
}

export function encodeLiroClipboard(payload: LiroClipboardPayload): string {
  const data = encodeBase64(JSON.stringify(payload))
  return `<span data-liro-objects="${TAG}" data-payload="${data}"></span>`
}

export function isLiroClipboardHtml(html: string): boolean {
  return typeof html === 'string' && html.indexOf(TAG) !== -1
}

export function decodeLiroClipboard(html: string): LiroClipboardPayload | null {
  if (!isLiroClipboardHtml(html)) return null
  const match = /data-liro-objects="[^"]*"\s+data-payload="([^"]*)"/.exec(html)
  if (!match) return null
  try {
    const parsed = JSON.parse(decodeBase64(match[1])) as LiroClipboardPayload
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items) || !parsed.items.length) return null
    return parsed
  } catch {
    return null
  }
}
