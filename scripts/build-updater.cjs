const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

function findMakeNsis() {
  const root = path.join(process.env.LOCALAPPDATA || '', 'electron-builder', 'Cache')
  const found = []
  const walk = (dir, depth) => {
    if (depth > 3 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const target = path.join(dir, entry.name)
      if (entry.isFile() && entry.name === 'makensis.exe') {
        found.push(target)
        continue
      }
      if (entry.isDirectory()) walk(target, depth + 1)
    }
  }
  walk(root, 0)
  if (!found.length) throw new Error('makensis не найден')
  return found.sort().reverse()[0]
}

function main() {
  const project = path.resolve(__dirname, '..')
  const source = path.join(project, 'scripts', 'updater')
  const target = path.join(project, 'resources', 'updater')
  const version = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8')).version
  const standalone = process.argv.indexOf('--standalone')
  const onlyVersion = standalone >= 0 ? process.argv[standalone + 1] : ''
  const makensis = findMakeNsis()
  if (onlyVersion) {
    execFileSync(
      makensis,
      ['-V2', `-DVER=${onlyVersion}`, `-DVER4=${onlyVersion}.0`, `-DSTANDALONE=${onlyVersion}`, path.join(source, 'Liro-Updater.nsi')],
      { cwd: source, stdio: 'inherit' }
    )
    const built = path.join(source, 'Liro-Updater.exe')
    const outDir = path.join(project, '.tmp', 'updater-standalone')
    fs.mkdirSync(outDir, { recursive: true })
    const out = path.join(outDir, `Liro-Update-${onlyVersion}.exe`)
    fs.copyFileSync(built, out)
    fs.rmSync(built)
    console.log(`Liro-Update-${onlyVersion}.exe:`, fs.statSync(out).size, 'байт ->', path.relative(project, out))
    console.log('makensis:', makensis)
    return
  }
  fs.mkdirSync(target, { recursive: true })
  execFileSync(makensis, ['-V2', `-DVER=${version}`, `-DVER4=${version}.0`, path.join(source, 'Liro-Updater.nsi')], {
    cwd: source,
    stdio: 'inherit'
  })
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
