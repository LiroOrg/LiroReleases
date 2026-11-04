const LETTER = /^Key([A-Z])$/

export function letterKey(event: { code?: string; key: string }): string {
  const physical = LETTER.exec(event.code || '')
  if (physical) return physical[1].toLowerCase()
  return event.key.toLowerCase()
}

export function bracketKey(event: { code?: string; key: string }): '[' | ']' | '' {
  if (event.code === 'BracketLeft') return '['
  if (event.code === 'BracketRight') return ']'
  return event.key === '[' || event.key === ']' ? event.key : ''
}
