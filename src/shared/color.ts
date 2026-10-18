const NAMED: Record<string, string> = {
  yellow: '#fff9b1',
  light_yellow: '#fff9b1',
  orange: '#ffd8b1',
  light_orange: '#ffe8cc',
  magenta: '#ffc0cb',
  light_magenta: '#ffd7e0',
  green: '#d1f0c0',
  light_green: '#e3f7dd',
  dark_green: '#a0d9c0',
  light_blue: '#cfe8fb',
  blue: '#b5defb',
  dark_blue: '#a9c9f0',
  purple: '#e2d4f7',
  light_purple: '#efe4ff',
  black: '#1a1a1a',
  dark_gray: '#8c8c8c',
  gray: '#c8c8c8',
  light_gray: '#ededed',
  white: '#ffffff',
  red: '#ffd6d6',
  transparent: 'transparent',
  none: 'transparent'
}

export function normalizeColor(value: unknown, fallback = '#ffffff'): string {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'number') return rgbToHex(value)
  const raw = String(value).trim()
  if (!raw) return fallback
  const lower = raw.toLowerCase()
  if (NAMED[lower]) return NAMED[lower]
  if (lower.startsWith('#')) {
    const hex = lower.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const expanded = hex
        .slice(0, 3)
        .split('')
        .map((ch) => ch + ch)
        .join('')
      return '#' + expanded
    }
    if (hex.length === 6 || hex.length === 8) return '#' + hex.slice(0, 6)
    return fallback
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(raw)
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p.trim()))
    const [r, g, b] = parts
    if ([r, g, b].every((n) => Number.isFinite(n))) return rgbToHex(r, g, b)
  }
  if (lower === 'transparent' || lower === 'none') return 'transparent'
  return fallback
}

function rgbToHex(r: number, g?: number, b?: number): string {
  if (g === undefined && b === undefined) {
    const value = Math.max(0, Math.min(0xffffff, Math.round(r)))
    return '#' + value.toString(16).padStart(6, '0')
  }
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n || 0)))
  return '#' + [clamp(r), clamp(g ?? 0), clamp(b ?? 0)].map((n) => n.toString(16).padStart(2, '0')).join('')
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeColor(hex, '#000000').slice(1)
  return {
    r: parseInt(clean.slice(0, 2), 16) || 0,
    g: parseInt(clean.slice(2, 4), 16) || 0,
    b: parseInt(clean.slice(4, 6), 16) || 0
  }
}

export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex)
  const f = (c: number): number => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

export function contrastColor(background: string, light = '#ffffff', dark = '#0b0b0c'): string {
  if (background === 'transparent') return dark
  return luminance(background) > 0.42 ? dark : light
}

export function withAlpha(hex: string, alpha: number): string {
  if (hex === 'transparent') return 'transparent'
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function mix(a: string, b: string, ratio: number): string {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  const t = Math.max(0, Math.min(1, ratio))
  return rgbToHex(ca.r + (cb.r - ca.r) * t, ca.g + (cb.g - ca.g) * t, ca.b + (cb.b - ca.b) * t)
}

export function shade(hex: string, amount: number): string {
  return amount >= 0 ? mix(hex, '#ffffff', amount) : mix(hex, '#000000', -amount)
}

export function shadesOf(base: string, count: number, from = 0.58, to = -0.52): string[] {
  const total = Math.max(1, Math.round(count))
  const out: string[] = []
  for (let index = 0; index < total; index += 1) {
    const t = total === 1 ? 0 : index / (total - 1)
    out.push(shade(base, from + (to - from) * t))
  }
  return out
}