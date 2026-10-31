const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function findMakeNsis() {
  const roots = [
    path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache', 'nsis'),
    path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache')
  ]
  const found = []
  for (const root of roots) {
    if (!root || !fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root)) {
      const candidate = path.join(root, entry, 'makensis.exe')
      if (fs.existsSync(candidate)) found.push(candidate)
    }
  }
  if (!found.length) throw new Error('makensis не найден')
  return found.sort().reverse()[0]
}

function main() {
  const project = path.resolve(__dirname, '..')
  const source = path.join(project, 'scripts', 'updater')
  const target = path.join(project, 'resources', 'updater')
  fs.mkdirSync(target, { recursive: true })
  const makensis = findMakeNsis()
  execFileSync(makensis, ['-V2', path.join(source, 'Liro-Updater.nsi')], { cwd: source, stdio: 'inherit' })
  const built = path.join(source, 'Liro-Updater.exe')
  if (!fs.existsSync(built)) throw new Error('Liro-Updater.exe не собран')
  fs.mkdirSync(target, { recursive: true })
  fs.copyFileSync(built, path.join(target, 'Liro-Updater.exe'))
  fs.rmSync(built)
  const size = fs.statSync(path.join(target, 'Liro-Updater.exe')).size
  console.log('Liro-Updater.exe:', size, 'байт ->', path.relative(project, path.join(target, 'Liro-Updater.exe')))
  console.log('makensis:', makensis)
}

main()
