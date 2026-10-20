import type { BoardItem } from '@shared/types'

export interface ObjectClipboard {
  docId: string
  items: BoardItem[]
}

let clipboard: ObjectClipboard | null = null

export function writeObjectClipboard(docId: string, items: BoardItem[]): void {
  if (!items.length) {
    clipboard = null
    return
  }
  clipboard = { docId, items: items.map((item) => structuredClone(item)) }
}

export function readObjectClipboard(): ObjectClipboard | null {
  return clipboard
}

export function clearObjectClipboard(): void {
  clipboard = null
}
