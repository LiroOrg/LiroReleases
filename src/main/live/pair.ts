import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

function argValue(flag: string): string {
  const prefix = `${flag}=`
  for (const value of process.argv) {
    if (value.startsWith(prefix)) return value.slice(prefix.length)
  }
  const at = process.argv.indexOf(flag)
  if (at < 0) return ''
  return process.argv[at + 1] ?? ''
}

export function startPairInstance(): void {
  const profile = join(app.getPath('userData'), 'pair')
  mkdirSync(profile, { recursive: true })
  const name = argValue('--dev-pair-name') || 'Гость'
  const child = spawn(process.execPath, [`--user-data-dir=${profile}`, `--user-name=${name}`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  })
  child.unref()
  console.log(`Второе окно запущено: имя «${name}»`)
}
