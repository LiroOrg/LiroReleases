import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const EXT = '.liro'
const TYPE = 'Liro.Board'
const IN_ASAR_ICON = join(process.resourcesPath || '', 'app.asar', 'resources', 'liro-file.ico')

export function iconSource(): string {
  const loose = process.resourcesPath ? join(process.resourcesPath, 'liro-file.ico') : ''
  if (loose && existsSync(loose)) return loose
  return existsSync(IN_ASAR_ICON) ? IN_ASAR_ICON : ''
}

function syncIcon(): string {
  const source = iconSource()
  if (!source) return ''
  const target = join(app.getPath('userData'), 'liro-file.ico')
  try {
    if (!existsSync(target) || statSync(target).size !== statSync(source).size) copyFileSync(source, target)
  } catch {
    return existsSync(target) ? target : ''
  }
  return existsSync(target) ? target : ''
}

export function regEntries(executable: string, icon: string): Array<{ key: string; name: string; value: string }> {
  const open = `"${executable}" "%1"`
  return [
    { key: `HKCU\\Software\\Classes\\${EXT}`, name: '', value: TYPE },
    { key: `HKCU\\Software\\Classes\\${EXT}`, name: 'Content Type', value: 'application/x-liro' },
    { key: `HKCU\\Software\\Classes\\${TYPE}`, name: '', value: 'Liro Board File' },
    { key: `HKCU\\Software\\Classes\\${TYPE}`, name: 'FriendlyTypeName', value: 'Доска Liro' },
    { key: `HKCU\\Software\\Classes\\${TYPE}`, name: 'Extension', value: EXT },
    { key: `HKCU\\Software\\Classes\\${TYPE}\\DefaultIcon`, name: '', value: `"${icon}"` },
    { key: `HKCU\\Software\\Classes\\${TYPE}\\shell`, name: 'FriendlyAppName', value: 'Liro' },
    { key: `HKCU\\Software\\Classes\\${TYPE}\\shell\\open`, name: 'FriendlyAppName', value: 'Liro' },
    { key: `HKCU\\Software\\Classes\\${TYPE}\\shell\\open\\command`, name: '', value: open },
    { key: `HKCU\\Software\\Classes\\.liro`, name: '', value: TYPE },
    { key: 'HKCU\\Software\\Classes\\AppUserModelId\\com.liro.desktop', name: 'IconUri', value: `"${icon}"` },
    { key: 'HKCU\\Software\\Classes\\AppUserModelId\\com.liro.desktop', name: 'DisplayName', value: 'Liro' }
  ]
}

function runReg(args: string[]): Promise<void> {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, () => resolve())
  })
}

export async function ensureLiroFormat(): Promise<void> {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const icon = syncIcon()
  if (!icon) return
  for (const entry of regEntries(process.execPath, icon)) {
    await runReg(['add', entry.key, '/v', entry.name, '/t', 'REG_SZ', '/d', entry.value, '/f'])
  }
  await notifyShell()
}

function notifyShell(): Promise<void> {
  return new Promise((resolve) => {
    execFile('Rundll32.exe', ['shell32.dll,SHChangeNotify', '0x08000000', '0', '0', '0'], { windowsHide: true }, () => resolve())
  })
}
