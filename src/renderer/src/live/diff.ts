import type { BoardItem } from '@shared/types'

export interface BoardDiff {
  changed: BoardItem[]
  removed: string[]
}

export function diffItems(previous: BoardItem[], next: BoardItem[]): BoardDiff {
  const before = new Map(previous.map((item) => [item.id, item]))
  const after = new Map(next.map((item) => [item.id, item]))
  const changed: BoardItem[] = []
  for (const item of next) {
    const old = before.get(item.id)
    if (!old || old !== item) changed.push(item)
  }
  const removed: string[] = []
  for (const item of previous) {
    if (!after.has(item.id)) removed.push(item.id)
  }
  return { changed, removed }
}

export interface RestorePatch {
  restore: BoardItem[]
  remove: string[]
}

export function invertDiff(previous: BoardItem[], next: BoardItem[]): RestorePatch {
  const before = new Map(previous.map((item) => [item.id, item]))
  const diff = diffItems(previous, next)
  const restore: BoardItem[] = []
  const remove: string[] = []
  for (const item of diff.changed) {
    const old = before.get(item.id)
    if (old) restore.push(old)
    else remove.push(item.id)
  }
  for (const id of diff.removed) {
    const old = before.get(id)
    if (old) restore.push(old)
  }
  return { restore, remove }
}

export function applyPatch(items: BoardItem[], patch: RestorePatch): BoardItem[] {
  const map = new Map(items.map((item) => [item.id, item]))
  for (const item of patch.restore) map.set(item.id, item)
  for (const id of patch.remove) map.delete(id)
  return [...map.values()]
}

export function applyDiff(items: BoardItem[], diff: BoardDiff): BoardItem[] {
  const map = new Map(items.map((item) => [item.id, item]))
  for (const id of diff.removed) map.delete(id)
  for (const item of diff.changed) map.set(item.id, item)
  return [...map.values()]
}

export function encodeDiff(diff: BoardDiff): string {
  return JSON.stringify({ items: JSON.stringify(diff.changed), removed: JSON.stringify(diff.removed) })
}

export function decodeDiff(payload: string): BoardDiff {
  const outer = JSON.parse(payload) as { items: string; removed: string }
  return {
    changed: JSON.parse(outer.items) as BoardItem[],
    removed: JSON.parse(outer.removed) as string[]
  }
}

const CHUNK_LIMIT = 24000

export function chunkPayload(payload: string): string[] {
  const chunks: string[] = []
  for (let index = 0; index < payload.length; index += CHUNK_LIMIT) {
    chunks.push(payload.slice(index, index + CHUNK_LIMIT))
  }
  return chunks.length ? chunks : ['']
}

export function encodeChunked(payload: string): string {
  return JSON.stringify(chunkPayload(payload))
}

export function decodeChunked(payload: string): string {
  const chunks = JSON.parse(payload) as string[]
  return chunks.join('')
}
