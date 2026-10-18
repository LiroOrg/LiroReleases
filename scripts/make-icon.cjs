const { app, nativeImage } = require('electron')
const { existsSync, mkdirSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const SIZES = [256, 512, 1024]

app.whenReady().then(() => {
  const source = join(process.cwd(), 'brand', 'logo.png')
  if (!existsSync(source)) {
    process.stderr.write(`нет brand/logo.png — значок не перерисовать\n`)
    app.exit(1)
    return
  }
  const original = nativeImage.createFromPath(source)
  if (original.isEmpty()) {
    process.stderr.write('brand/logo.png не читается\n')
    app.exit(1)
    return
  }
  const target = join(process.cwd(), 'resources')
  mkdirSync(target, { recursive: true })
  const { width, height } = original.getSize()
  process.stdout.write(`источник ${width}x${height}\n`)
  for (const size of SIZES) {
    const scaled = original.resize({ width: size, height: size, quality: 'best' })
    const file = join(target, `icon-${size}.png`)
    writeFileSync(file, scaled.toPNG())
    process.stdout.write(`icon-${size}.png готов\n`)
  }
  app.exit(0)
})