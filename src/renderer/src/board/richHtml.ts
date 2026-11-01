const BLOCK_TAGS = new Set(['p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const KEEP_TAGS = new Set([...BLOCK_TAGS, 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'ul', 'ol', 'span'])
const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'img', 'video', 'audio', 'source', 'form', 'input', 'button'])
const COLOR_STYLE_TAGS = new Set(['span', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'a', 'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

function safeHref(href: string): string {
  const value = String(href ?? '').trim()
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value
  return ''
}

function styleColor(style: string): string {
  const match = /(^|;)\s*color\s*:\s*([^;]+)/i.exec(String(style ?? ''))
  if (!match) return ''
  const value = match[2].trim().replace(/["']/g, '')
  if (!/^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|[a-z]+)$/i.test(value)) return ''
  return value
}

function cleanNode(node: Element): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 3) continue
    if (child.nodeType !== 1) {
      child.remove()
      continue
    }
    const element = child as Element
    const tag = element.tagName.toLowerCase()
    if (DROP_TAGS.has(tag)) {
      element.remove()
      continue
    }
    if (!KEEP_TAGS.has(tag)) {
      cleanNode(element)
      while (element.firstChild) element.parentNode?.insertBefore(element.firstChild, element)
      element.remove()
      continue
    }
    const href = tag === 'a' ? safeHref(element.getAttribute('href') ?? '') : ''
    const color = COLOR_STYLE_TAGS.has(tag) ? styleColor(element.getAttribute('style') ?? '') : ''
    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name)
    if (tag === 'a') {
      if (!href) {
        cleanNode(element)
        while (element.firstChild) element.parentNode?.insertBefore(element.firstChild, element)
        element.remove()
        continue
      }
      element.setAttribute('href', href)
      element.setAttribute('rel', 'noopener')
      element.setAttribute('target', '_blank')
    }
    if (color) element.setAttribute('style', `color:${color}`)
    cleanNode(element)
  }
}

function rootOf(html: string): HTMLElement | null {
  if (typeof DOMParser === 'undefined') return null
  const parsed = new DOMParser().parseFromString(`<div id="rich-root">${String(html ?? '')}</div>`, 'text/html')
  return parsed.getElementById('rich-root')
}

export function sanitizeRichHtml(html: string): string {
  const root = rootOf(html)
  if (!root) return String(html ?? '').replace(/<[^>]*>/g, '')
  cleanNode(root)
  if (!root.textContent?.trim() && !root.querySelector('br')) return ''
  return root.innerHTML
}

function collectText(node: Node, out: string[]): void {
  if (node.nodeType === 3) {
    out.push(String(node.nodeValue ?? '').replace(/\u00a0/g, ' '))
    return
  }
  if (node.nodeType !== 1) return
  const element = node as Element
  const tag = element.tagName.toLowerCase()
  if (tag === 'br') {
    out.push('\n')
    return
  }
  const isBlock = BLOCK_TAGS.has(tag) || tag === 'li'
  if (isBlock && out.length && out[out.length - 1] !== '\n') out.push('\n')
  for (const child of Array.from(element.childNodes)) collectText(child, out)
  if (isBlock && out.length && out[out.length - 1] !== '\n') out.push('\n')
}

export function plainFromRichHtml(html: string): string {
  const root = rootOf(html)
  if (!root) return String(html ?? '').replace(/<[^>]*>/g, '')
  const out: string[] = []
  for (const child of Array.from(root.childNodes)) collectText(child, out)
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+$/g, '')
}

export function richHtmlFromPlain(plain: string): string {
  const escaped = String(plain ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  if (!escaped.trim()) return ''
  return escaped
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function escapeRichHtml(plain: string): string {
  return String(plain ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
