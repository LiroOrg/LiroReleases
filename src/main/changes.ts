import { app, net } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseChanges, type ChangeEntry } from '@shared/changes'

const FEED = 'https://github.com/LiroOrg/LiroReleases/releases/latest/download/changes.yml'

export async function readChanges(): Promise<ChangeEntry[]> {
  try {
    const response = await net.fetch(`${FEED}?t=${Date.now()}`, {
      headers: { 'user-agent': 'Liro', 'cache-control': 'no-cache' },
      redirect: 'follow'
    })
    if (!response.ok) throw new Error(`код ${response.status}`)
    const remote = parseChanges(await response.text())
    if (remote.length) return remote
  } catch {
    return bundled()
  }
  return bundled()
}

function bundled(): ChangeEntry[] {
  for (const file of [join(app.getAppPath(), 'changes.yml'), join(__dirname, '../../changes.yml')]) {
    try {
      const entries = parseChanges(readFileSync(file, 'utf8'))
      if (entries.length) return entries
    } catch {
      continue
    }
  }
  return []
}
