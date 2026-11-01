export interface ChangeEntry {
  version: string
  notes: string[]
}

export function parseChanges(source: string): ChangeEntry[] {
  const entries: ChangeEntry[] = []
  let current: ChangeEntry | null = null
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    if (line.startsWith('- version:')) {
      current = { version: line.slice('- version:'.length).trim(), notes: [] }
      entries.push(current)
      continue
    }
    if (line === 'notes:') continue
    if (line.startsWith('- ') && current) {
      const note = line.slice(2).trim()
      if (note) current.notes.push(note)
    }
  }
  return entries.filter((entry) => entry.notes.length)
}
