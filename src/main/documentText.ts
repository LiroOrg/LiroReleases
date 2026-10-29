import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { readZip } from './util/zip'

export const DOCUMENT_LANGUAGE = 'document'

export type OfficeKind = 'word' | 'sheet' | 'slides'

const OFFICE_KIND: Record<string, OfficeKind> = {
  '.docx': 'word',
  '.docm': 'word',
  '.dotx': 'word',
  '.xlsx': 'sheet',
  '.xlsm': 'sheet',
  '.pptx': 'slides'
}

const READ_LIMIT = 48 * 1024 * 1024

export function isDocumentFile(file: string): boolean {
  return OFFICE_KIND[extname(file).toLowerCase()] !== undefined
}

export function readDocumentHtml(file: string): string | null {
  const kind = OFFICE_KIND[extname(file).toLowerCase()]
  if (!kind) return null
  let size = 0
  try {
    size = statSync(file).size
  } catch {
    return null
  }
  if (size <= 0 || size > READ_LIMIT) return null
  let zip: Map<string, Buffer> | null = null
  try {
    zip = readZip(readFileSync(file))
  } catch {
    return null
  }
  if (!zip) return null
  const html = documentFromZip(kind, zip)
  return html.trim() ? html : null
}

export function documentFromZip(kind: OfficeKind, zip: Map<string, Buffer>): string {
  const text = (name: string): string => zip.get(name)?.toString('utf8') ?? ''
  if (kind === 'word') return wordDocumentToHtml(text('word/document.xml'))
  if (kind === 'slides') return slidesToHtml(zip)
  return workbookToHtml(zip)
}

export function wordDocumentToHtml(xml: string): string {
  const body = /<w:body[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml
  const blocks = body.match(/<w:tbl(?:\s[^>]*)?>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? []
  const out: string[] = []
  let list: string[] = []
  const flush = () => {
    if (list.length) {
      out.push(`<ul class="doc-ul">${list.join('')}</ul>`)
      list = []
    }
  }
  for (const block of blocks) {
    if (block.startsWith('<w:tbl')) {
      flush()
      const table = tableHtml(block)
      if (table) out.push(table)
      continue
    }
    const part = paragraphPart(block)
    if (part.list) list.push(part.html)
    else {
      flush()
      out.push(part.html)
    }
  }
  flush()
  return out.join('')
}

function paragraphPart(p: string): { list: boolean; html: string } {
  const text = runsHtml(p)
  const style = (/<w:pStyle[^>]*w:val="([^"]*)"/i.exec(p)?.[1] ?? '').toLowerCase().replace(/[\s_-]/g, '')
  const align = /<w:jc[^>]*w:val="(center|right|both)"/i.exec(p)?.[1]?.toLowerCase()
  const extra = align ? ` class="doc-align-${align === 'both' ? 'justify' : align}"` : ''
  if (/<w:numPr[ >]/.test(p)) return { list: true, html: `<li${extra}>${text}</li>` }
  const heading = /^heading(\d)$/i.exec(style)?.[1] ?? (/^title$/i.test(style) ? '0' : '')
  if (heading) {
    const tag = `h${Math.min(6, Number(heading) + 1)}`
    return { list: false, html: `<${tag}${extra}>${text}</${tag}>` }
  }
  if (/^quote|^intensequote/.test(style)) return { list: false, html: `<blockquote${extra}>${text}</blockquote>` }
  if (/^code|^preformatted/.test(style)) return { list: false, html: `<pre class="doc-pre">${text}</pre>` }
  if (!text) return { list: false, html: '<p class="doc-p doc-p--empty"></p>' }
  return { list: false, html: `<p${extra}>${text}</p>` }
}

function runsHtml(p: string): string {
  let out = ''
  const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g
  let run = runRe.exec(p)
  while (run) {
    const inner = run[1]
    const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(inner)?.[1] ?? ''
    const text = runText(inner)
    if (text) {
      let piece = escapeMarkup(text)
      if (flagOn(props, 'strike')) piece = `<s>${piece}</s>`
      if (flagOn(props, 'i')) piece = `<em>${piece}</em>`
      if (flagOn(props, 'b')) piece = `<strong>${piece}</strong>`
      out += piece
    }
    run = runRe.exec(p)
  }
  return out
}

function runText(inner: string): string {
  let text = ''
  const tokenRe = /<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<w:noBreakHyphen\s*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let token = tokenRe.exec(inner)
  while (token) {
    if (token[1] === undefined) {
      if (token[0].includes('w:tab')) text += '\t'
      else if (token[0].includes('w:noBreakHyphen')) text += '-'
      else text += '\n'
    } else text += decodeEntities(token[1])
    token = tokenRe.exec(inner)
  }
  return text
}

function tableHtml(tbl: string): string {
  const rows = tbl.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) ?? []
  if (!rows.length) return ''
  const body = rows
    .map((row) => {
      const cells = (row.match(/<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g) ?? []).map(
        (cell) => `<td>${(cell.match(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) ?? []).map(runsHtml).join('<br>')}</td>`
      )
      return `<tr>${cells.join('')}</tr>`
    })
    .join('')
  return `<table class="doc-table"><tbody>${body}</tbody></table>`
}

function flagOn(props: string, tag: string): boolean {
  const match = new RegExp(`<w:${tag}\\b[^>]*>`).exec(props)
  if (!match) return false
  const value = /w:val="([^"]*)"/.exec(match[0])?.[1]
  return value === undefined || !/^(0|false|none)$/i.test(value)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => fromCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, digits: string) => fromCode(Number.parseInt(digits, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function fromCode(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ''
  if (code >= 0xd800 && code <= 0xdfff) return ''
  return String.fromCodePoint(code)
}

function escapeMarkup(value: string): string {
  return value.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'))
}

const SHEET_ROW_LIMIT = 2000
const SHEET_COLUMN_LIMIT = 60

function workbookToHtml(zip: Map<string, Buffer>): string {
  const shared = sharedStrings(zip.get('xl/sharedStrings.xml')?.toString('utf8') ?? '')
  const workbook = zip.get('xl/workbook.xml')?.toString('utf8') ?? ''
  const targets = relationshipTargets(zip.get('xl/_rels/workbook.xml.rels')?.toString('utf8') ?? '')
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((tag) => ({
    name: decodeEntities(/name="([^"]*)"/.exec(tag[0])?.[1] ?? ''),
    id: /r:id="([^"]*)"/.exec(tag[0])?.[1] ?? /RelationshipId="([^"]*)"/.exec(tag[0])?.[1] ?? ''
  }))
  const files = [...zip.keys()]
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0))
  const out: string[] = []
  sheets.forEach((sheet, index) => {
    const target = targets.get(sheet.id)
    const path = target ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\.?\//, '')}` : files[index]
    const xml = zip.get(path ?? '')?.toString('utf8') ?? ''
    const table = sheetToHtml(xml, shared)
    if (!table) return
    out.push(`<h2>${escapeMarkup(sheet.name || `Лист ${index + 1}`)}</h2>${table}`)
  })
  if (!out.length) {
    const table = sheetToHtml(zip.get(files[0] ?? '')?.toString('utf8') ?? '', shared)
    if (table) out.push(table)
  }
  return out.join('')
}

function relationshipTargets(rels: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const tag of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(tag[0])?.[1]
    const target = /\bTarget="([^"]*)"/.exec(tag[0])?.[1]
    if (id && target) map.set(id, decodeEntities(target))
  }
  return map
}

function sharedStrings(xml: string): string[] {
  return (xml.match(/<si\b[^>]*>[\s\S]*?<\/si>/g) ?? []).map((item) =>
    (item.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? [])
      .map((node) => decodeEntities(/<t\b[^>]*>([\s\S]*?)<\/t>/.exec(node)?.[1] ?? ''))
      .join('')
  )
}

function sheetToHtml(xml: string, shared: string[]): string {
  const rows = xml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []
  if (!rows.length) return ''
  const shown = rows.slice(0, SHEET_ROW_LIMIT)
  const body = shown
    .map((row) => {
      const cells = new Map<number, string>()
      let last = -1
      for (const cell of row.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1] ?? ''
        const inner = cell[2] ?? ''
        const type = /t="([^"]*)"/.exec(attrs)?.[1] ?? ''
        const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? /<t\b[^>]*>([\s\S]*?)<\/t>/.exec(inner)?.[1] ?? ''
        const value = type === 's' ? shared[Number(raw)] ?? '' : decodeEntities(raw)
        const column = columnIndex(/r="([A-Z]+)\d*"/.exec(attrs)?.[1] ?? '')
        cells.set(column, value)
        last = Math.max(last, column)
      }
      if (last < 0) return ''
      const width = Math.min(last + 1, SHEET_COLUMN_LIMIT)
      const tds = Array.from({ length: width }, (_, index) => `<td>${escapeMarkup(cells.get(index) ?? '')}</td>`).join('')
      return `<tr>${tds}</tr>`
    })
    .filter(Boolean)
    .join('')
  if (!body) return ''
  const more = rows.length > shown.length ? `<p class="doc-p">… ещё ${rows.length - shown.length} строк</p>` : ''
  return `<table class="doc-table"><tbody>${body}</tbody></table>${more}`
}

function columnIndex(letters: string): number {
  let index = 0
  for (let i = 0; i < letters.length; i++) index = index * 26 + (letters.charCodeAt(i) - 64)
  return Math.max(0, index - 1)
}

function slidesToHtml(zip: Map<string, Buffer>): string {
  const names = [...zip.keys()]
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1] ?? 0) - Number(/(\d+)\.xml$/.exec(b)?.[1] ?? 0))
  const out: string[] = []
  names.forEach((name, index) => {
    const xml = zip.get(name)?.toString('utf8') ?? ''
    const paragraphs = (xml.match(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/g) ?? [])
      .map((paragraph) =>
        (paragraph.match(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g) ?? [])
          .map((node) => decodeEntities(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/.exec(node)?.[1] ?? ''))
          .join('')
      )
      .filter((text) => text.trim())
    if (!paragraphs.length) return
    const body = paragraphs.map((text) => `<p>${escapeMarkup(text)}</p>`).join('')
    out.push(`<h2>Слайд ${index + 1}</h2>${body}`)
  })
  return out.join('')
}

const TABLE_ROW_LIMIT = 4000

export function csvToHtml(source: string, preferred: string): { html: string; truncated: boolean } {
  const text = source.replace(/\r\n?/g, '\n')
  const firstLine = text.split('\n', 1)[0] ?? ''
  const delimiter = pickDelimiter(firstLine, preferred)
  const rows = parseDelimited(text, delimiter)
  if (!rows.length) return { html: '', truncated: false }
  const truncated = rows.length > TABLE_ROW_LIMIT
  const shown = truncated ? rows.slice(0, TABLE_ROW_LIMIT) : rows
  const width = shown.reduce((max, row) => Math.max(max, row.length), 0)
  const pad = (row: string[]): string[] => Array.from({ length: width }, (_, columnIndex) => row[columnIndex] ?? '')
  const head = pad(shown[0]).map((cell) => `<th>${escapeMarkup(cell)}</th>`).join('')
  const body = shown
    .slice(1)
    .map((row) => `<tr>${pad(row).map((cell) => `<td>${escapeMarkup(cell)}</td>`).join('')}</tr>`)
    .join('')
  return { html: `<table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`, truncated }
}

function pickDelimiter(firstLine: string, preferred: string): string {
  const candidates = [preferred, ',', ';', '\t', '|'].filter((value, position, all) => value && all.indexOf(value) === position)
  let best = preferred
  let bestCount = -1
  for (const candidate of candidates) {
    const count = firstLine.split(candidate).length - 1
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char !== '"') {
        cell += char
        continue
      }
      if (text[i + 1] === '"') {
        cell += '"'
        i++
        continue
      }
      quoted = false
      continue
    }
    if (char === '"') quoted = true
    else if (char === delimiter) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((item) => item.length > 1 || item[0].trim() !== '')
}

export function markdownToHtml(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`)
      list = null
    }
  }
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      closeList()
      index++
      continue
    }
    const fence = /^\s{0,3}(`{3,}|~{3,})\s*[\w+-]*\s*$/.exec(line)
    if (fence) {
      closeList()
      const marker = fence[1][0] === '`' ? '`' : '~'
      const code: string[] = []
      index++
      while (index < lines.length && !new RegExp(`^\\s{0,3}${marker}{3,}\\s*$`).test(lines[index])) {
        code.push(lines[index])
        index++
      }
      index++
      out.push(`<pre class="doc-pre"><code>${escapeMarkup(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      closeList()
      const tag = `h${heading[1].length}`
      out.push(`<${tag}>${markdownInline(heading[2])}</${tag}>`)
      index++
      continue
    }
    if (/^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeList()
      out.push('<hr class="doc-hr" />')
      index++
      continue
    }
    if (/^ {0,3}>/.test(line)) {
      closeList()
      const quote: string[] = []
      while (index < lines.length && /^ {0,3}>/.test(lines[index])) {
        quote.push(lines[index].replace(/^ {0,3}>\s?/, ''))
        index++
      }
      out.push(`<blockquote>${markdownInline(quote.join('\n'))}</blockquote>`)
      continue
    }
    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    const numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const kind: 'ul' | 'ol' = bullet ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind} class="doc-ul">`)
        list = kind
      }
      out.push(`<li>${markdownInline((bullet ?? numbered)![2])}</li>`)
      index++
      continue
    }
    const next = lines[index + 1] ?? ''
    if (isTableStart(line, next)) {
      closeList()
      const rows: string[][] = []
      let cursor = index
      while (cursor < lines.length && lines[cursor].includes('|')) {
        rows.push(lines[cursor].trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
        cursor++
      }
      const head = (rows[0] ?? []).map((cell) => `<th>${markdownInline(cell)}</th>`).join('')
      const body = rows
        .slice(2)
        .map((row) => `<tr>${row.map((cell) => `<td>${markdownInline(cell)}</td>`).join('')}</tr>`)
        .join('')
      out.push(`<table class="doc-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`)
      index = cursor
      continue
    }
    const paragraph: string[] = []
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index], lines[index + 1] ?? '')) {
      paragraph.push(lines[index])
      index++
    }
    if (paragraph.length) out.push(`<p>${markdownInline(paragraph.join('\n'))}</p>`)
    else index++
  }
  closeList()
  return out.join('')
}

function isTableStart(line: string, next: string): boolean {
  return line.includes('|') && /^[\s|:-]+$/.test(next) && next.includes('-') && next.includes('|')
}

function isBlockStart(line: string, next: string): boolean {
  return (
    /^ {0,3}#{1,6}\s+/.test(line) ||
    /^\s{0,3}(`{3,}|~{3,})/.test(line) ||
    /^ {0,3}>/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+[.)]\s+/.test(line) ||
    /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
    isTableStart(line, next)
  )
}

function markdownInline(text: string): string {
  let html = escapeMarkup(text)
  html = html.replace(/`([^`\n]+)`/g, (_all, code: string) => `<code>${code}</code>`)
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_all, label: string, href: string) => linkHtml(label, href))
  html = html.replace(/\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^)]*&quot;)?\)/g, (_all, label: string, href: string) => linkHtml(label, href))
  html = html.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>')
  html = html.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  html = html.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>')
  html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
  return html
}

function linkHtml(label: string, href: string): string {
  const url = href.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const text = label || escapeMarkup(url)
  if (!/^(https?:|mailto:)/i.test(url) || /["'<>\\\s]/.test(url)) return text
  return `<a href="${escapeMarkup(url)}">${text}</a>`
}
