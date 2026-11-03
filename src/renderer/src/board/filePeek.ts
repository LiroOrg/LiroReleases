import { api } from '../lib/api'

const cache = new Map<string, string>()
const listeners = new Map<string, Set<() => void>>()

const PEEK_BLOCK = /<ul class="doc-ul">[\s\S]*?<\/ul>|<table class="doc-table">[\s\S]*?<\/table>|<p(?:\s[^>]*)?>[\s\S]*?<\/p>/g
const PEEK_BLOCKS = 24
const PEEK_LIMIT = 40000

function peekHtml(html: string): string {
  if (html.length <= PEEK_LIMIT) return html
  const blocks = html.match(PEEK_BLOCK) ?? []
  const first = blocks[0]
  if (!first) return html.slice(0, PEEK_LIMIT)
  let out = ''
  for (const block of blocks.slice(0, PEEK_BLOCKS)) {
    if (out.length + block.length > PEEK_LIMIT) break
    out += block
  }
  return out || first.slice(0, PEEK_LIMIT)
}

export function fileHtml(file: string): string {
  return cache.get(file) ?? ''
}

export function subscribeFileHtml(file: string, notify: () => void): () => void {
  const set = listeners.get(file) ?? new Set<() => void>()
  listeners.set(file, set)
  set.add(notify)
  return () => set.delete(notify)
}

function notify(file: string): void {
  for (const listener of listeners.get(file) ?? []) listener()
}

export function loadFileHtml(file: string, url: string): void {
  if (cache.has(file)) return
  void api.preview
    .text(url)
    .then((text) => {
      if (!text || text.language !== 'document') return
      cache.set(file, peekHtml(text.content))
      notify(file)
    })
    .catch(() => undefined)
}

export function reloadFileHtml(file: string): void {
  cache.delete(file)
  notify(file)
}
