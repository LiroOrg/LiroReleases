export interface Run {
  text: string
  b?: boolean
  i?: boolean
  u?: boolean
  s?: boolean
  href?: string
  color?: string
  bg?: string
  size?: number
}

export type BlockType = 'p' | 'li' | 'h' | 'pre'

export interface Block {
  type: BlockType
  ordered?: boolean
  level: number
  runs: Run[]
}

const STYLE_KEYS: Record<string, keyof Run> = {
  color: 'color',
  'background-color': 'bg',
  'font-size': 'size'
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, '\u00a0')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&amp;/gi, '&')
}

function parseSize(value: string): number | undefined {
  const m = /^(-?\d+(?:\.\d+)?)px$/i.exec(value.trim())
  if (m) return Number(m[1])
  const n = /^(-?\d+(?:\.\d+)?)$/.exec(value.trim())
  if (n) return Number(n[1])
  return undefined
}

export function toPlainText(html: string): string {
  if (!html) return ''
  const withBreaks = html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
  return decodeEntities(withBreaks.replace(/<[^>]*>/g, ''))
    .replace(/\u00a0/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function stripHtml(html: string): string {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ''))
}

function styleOfTag(tag: string): Partial<Run> {
  const out: Partial<Run> = {}
  const styleMatch = /style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i.exec(tag)
  const style = styleMatch ? (styleMatch[1] ?? styleMatch[2] ?? '') : ''
  if (style) {
    const decl = style.split(';')
    for (const part of decl) {
      const idx = part.indexOf(':')
      if (idx < 0) continue
      const key = part.slice(0, idx).trim().toLowerCase()
      const value = part.slice(idx + 1).trim()
      if (key === 'color') out.color = value
      else if (key === 'background-color' || key === 'background') out.bg = value
      else if (key === 'font-size') out.size = parseSize(value)
      else if (STYLE_KEYS[key] === 'color' && value) out.color = value
    }
  }
  const cls = /class\s*=\s*"([^"]*)"/i.exec(tag)
  if (cls) {
    const classes = cls[1].toLowerCase()
    if (/highlight|text-color-/.test(classes) && !out.color) out.color = '#000000'
  }
  return out
}

export function parseRichText(html: string): Block[] {
  const source = String(html ?? '')
  if (!source.trim()) return []
  const blocks: Block[] = []
  const tagRe = /<\s*(\/?)\s*([a-zA-Z0-9]+)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)\s*>|([^<]+)/g
  const stack: Block[] = []
  const runStack: Array<Partial<Run>> = [{}]
  let buffer = ''
  let match: RegExpExecArray | null

  const flushRun = (): void => {
    if (!buffer) return
    const style = runStack[runStack.length - 1]
    const target = stack[stack.length - 1]
    const text = decodeEntities(buffer).replace(/\u00a0/g, ' ')
    if (text) {
      if (target) {
        const prev = target.runs[target.runs.length - 1]
        const same = prev && sameStyle(prev, style)
        if (same) prev.text += text
        else target.runs.push({ text, ...style })
      }
    }
    buffer = ''
  }

  const flushBlock = (block: Block): void => {
    const idx = blocks.indexOf(block)
    if (idx >= 0) blocks.splice(idx, 1)
    blocks.push(block)
  }

  while ((match = tagRe.exec(source)) !== null) {
    if (match[5] !== undefined) {
      buffer += match[5]
      continue
    }
    const closing = match[1] === '/'
    const tag = (match[2] || '').toLowerCase()
    const attrs = match[3] || ''
    const selfClosing = match[4] === '/'
    if (tag === 'br') {
      buffer += '\n'
      continue
    }
    const style = styleOfTag(`<${tag} ${attrs}>`)
    const href = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/i.exec(attrs)
    if (closing) {
      flushRun()
      if (tag === 'b' || tag === 'strong') delete runStack[runStack.length - 1].b
      else if (tag === 'i' || tag === 'em') delete runStack[runStack.length - 1].i
      else if (tag === 'u') delete runStack[runStack.length - 1].u
      else if (tag === 's' || tag === 'strike' || tag === 'del') delete runStack[runStack.length - 1].s
      else if (tag === 'span' && runStack.length > 1) runStack.pop()
      else if (tag === 'a' && runStack.length > 1) runStack.pop()
      else if (tag === 'li' && stack.length && stack[stack.length - 1].type === 'li') {
        const done = stack.pop()!
        flushBlock(done)
      } else if ((tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag)) && stack.length) {
        const done = stack.pop()!
        flushBlock(done)
      }
      continue
    }
    if (tag === 'b' || tag === 'strong') {
      flushRun()
      runStack[runStack.length - 1].b = true
      continue
    }
    if (tag === 'i' || tag === 'em') {
      flushRun()
      runStack[runStack.length - 1].i = true
      continue
    }
    if (tag === 'u') {
      flushRun()
      runStack[runStack.length - 1].u = true
      continue
    }
    if (tag === 's' || tag === 'strike' || tag === 'del') {
      flushRun()
      runStack[runStack.length - 1].s = true
      continue
    }
    if (tag === 'span' || tag === 'a') {
      flushRun()
      const next = { ...runStack[runStack.length - 1] }
      if (tag === 'a') next.href = href ? decodeEntities(href[1] ?? href[2] ?? '') : undefined
      else Object.assign(next, style)
      runStack.push(next)
      continue
    }
    if (tag === 'li') {
      flushRun()
      const parent = stack[stack.length - 1]
      const level = parent && parent.type === 'li' ? Math.min(parent.level + 1, 5) : 1
      if (parent && parent.type === 'li') {
        const done = stack.pop()!
        flushBlock(done)
      }
      stack.push({ type: 'li', level, ordered: /value\s*=\s*"?\d+/i.test(attrs) ? undefined : false, runs: [] })
      if (!selfClosing) continue
      continue
    }
    if (tag === 'ul' || tag === 'ol') {
      flushRun()
      continue
    }
    if (tag === 'p' || tag === 'div' || /^h[1-6]$/.test(tag)) {
      flushRun()
      if (stack.length && stack[stack.length - 1].type !== 'li') {
        const done = stack.pop()!
        flushBlock(done)
      } else if (stack.length) {
        flushRun()
      }
      if (!selfClosing) stack.push({ type: /^h[1-6]$/.test(tag) ? 'h' : 'p', level: 1, runs: [] })
      continue
    }
    if (tag === 'img') {
      const src = /src\s*=\s*"([^"]*)"|src\s*=\s*'([^']*)'/i.exec(attrs)
      const alt = /alt\s*=\s*"([^"]*)"|alt\s*=\s*'([^']*)'/i.exec(attrs)
      const value = alt ? decodeEntities(alt[1] ?? alt[2] ?? '') : src ? decodeEntities(src[1] ?? src[2] ?? '') : ''
      if (value) buffer += value
      continue
    }
    if (tag === 'hr') {
      buffer += '\u2014'
      continue
    }
  }
  flushRun()
  while (stack.length) {
    const done = stack.pop()!
    flushBlock(done)
  }
  const cleaned = blocks
    .map((b) => ({ ...b, runs: b.runs.filter((r) => r.text.length > 0) }))
    .filter((b) => b.runs.length > 0)
  return cleaned
}

function sameStyle(a: Run, b: Partial<Run>): boolean {
  return (
    !!a.b === !!b.b &&
    !!a.i === !!b.i &&
    !!a.u === !!b.u &&
    !!a.s === !!b.s &&
    (a.href ?? '') === (b.href ?? '') &&
    (a.color ?? '') === (b.color ?? '') &&
    (a.bg ?? '') === (b.bg ?? '') &&
    (a.size ?? 0) === (b.size ?? 0)
  )
}

export function extractUrls(html: string): string[] {
  const out: string[] = []
  const re = /href\s*=\s*"([^"]*)"|href\s*=\s*'([^']*)'/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const value = decodeEntities(m[1] ?? m[2] ?? '').trim()
    if (/^https?:\/\//i.test(value) && !out.includes(value)) out.push(value)
  }
  return out
}