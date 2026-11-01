import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ExportOptions, ExportResult } from '@shared/types'
import { store } from '../store'
import { docDir, thumbFile } from '../paths'
import { createZip } from '../util/zip'
import { exportFolder, renderHtml, renderPdf, renderPng, thumbnailPath, type RenderParams } from './render'
import { buildSvg } from './svg'
import { boundsOfItems, sanitizeFileName } from '@shared/util'

function baseName(title: string): string {
  return sanitizeFileName(title) || 'board'
}

function renderParams(options: Partial<ExportOptions> & { docId: string }): RenderParams {
  return {
    docId: options.docId,
    scope: options.scope ?? 'board',
    targetId: options.targetId,
    selectionIds: options.selectionIds,
    scale: options.scale ?? 2,
    background: options.background ?? 'white',
    paper: options.pdfPaper ?? 'a3',
    tileCols: options.pdfMode === 'tiles' ? options.pdfTileCols : 1,
    tileRows: options.pdfMode === 'tiles' ? options.pdfTileRows : 1
  }
}

async function archiveBytes(docId: string): Promise<Buffer> {
  await exportBoard({ docId, thumbnail: true }).catch(() => '')
  return buildArchive(docId)
}

export async function exportBoard(
  options: Partial<ExportOptions> & { docId: string; thumbnail?: boolean }
): Promise<string> {
  if (options.thumbnail) {
    const doc = store.readDoc(options.docId)
    const target = thumbnailPath(options.docId)
    if (!doc.items.length) {
      writeFileSync(target, whitePng())
      return target
    }
    const box = boundsOfItems(doc.items, 60)
    const result = await renderPng({
      docId: options.docId,
      scope: 'thumb',
      bbox: { x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height) },
      scale: 1,
      background: 'white'
    })
    writeFileSync(target, result.buffer)
    return target
  }
  const doc = store.readDoc(options.docId)
  const dir = exportFolder()
  const name = `${baseName(doc.title)}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`
  switch (options.format) {
    case 'pdf': {
      const target = join(dir, `${name}.pdf`)
      await renderPdf(renderParams(options), target)
      return target
    }
    case 'html': {
      const target = join(dir, `${name}.html`)
      const html = await renderHtml(renderParams(options))
      writeFileSync(target, html, 'utf8')
      return target
    }
    case 'json': {
      const target = join(dir, `${name}.json`)
      writeFileSync(target, JSON.stringify(doc, null, 2), 'utf8')
      return target
    }
    case 'liro': {
      const target = join(dir, `${name}.liro`)
      writeFileSync(target, await archiveBytes(options.docId))
      return target
    }
    case 'zip': {
      const target = join(dir, `${name}.zip`)
      writeFileSync(target, await archiveBytes(options.docId))
      return target
    }
    case 'svg': {
      const target = join(dir, `${name}.svg`)
      writeFileSync(target, buildSvg(doc, options.docId, options.background ?? 'white'), 'utf8')
      return target
    }
    default: {
      const target = join(dir, `${name}.png`)
      const result = await renderPng(renderParams(options))
      writeFileSync(target, result.buffer)
      return target
    }
  }
}

export async function exportToPath(options: ExportOptions, target: string): Promise<ExportResult> {
  const doc = store.readDoc(options.docId)
  switch (options.format) {
    case 'png': {
      const result = await renderPng(renderParams(options))
      writeFileSync(target, result.buffer)
      return { ok: true, path: target, bytes: result.buffer.byteLength, width: result.width, height: result.height }
    }
    case 'pdf': {
      const info = await renderPdf(renderParams(options), target)
      return { ok: true, path: target, bytes: info.bytes, width: info.width, height: info.height }
    }
    case 'html': {
      const html = await renderHtml(renderParams(options))
      writeFileSync(target, html, 'utf8')
      return { ok: true, path: target, bytes: Buffer.byteLength(html, 'utf8') }
    }
    case 'json': {
      const text = JSON.stringify(doc, null, 2)
      writeFileSync(target, text, 'utf8')
      return { ok: true, path: target, bytes: Buffer.byteLength(text, 'utf8') }
    }
    case 'liro': {
      const buffer = await archiveBytes(options.docId)
      writeFileSync(target, buffer)
      return { ok: true, path: target, bytes: buffer.byteLength }
    }
    case 'zip': {
      const buffer = await archiveBytes(options.docId)
      writeFileSync(target, buffer)
      return { ok: true, path: target, bytes: buffer.byteLength }
    }
    case 'svg': {
      const text = buildSvg(doc, options.docId, options.background)
      writeFileSync(target, text, 'utf8')
      return { ok: true, path: target, bytes: Buffer.byteLength(text, 'utf8') }
    }
    default:
      return { ok: false, message: 'Неизвестный формат экспорта' }
  }
}

export function buildArchive(docId: string): Buffer {
  const doc = store.readDoc(docId)
  const entries: { name: string; data: Buffer }[] = [
    { name: 'board.json', data: Buffer.from(JSON.stringify(doc), 'utf8') },
    { name: 'README.txt', data: Buffer.from(readme(doc.title), 'utf8') }
  ]
  const dir = docDir(docId)
  const assetsDirPath = join(dir, 'assets')
  if (existsSync(assetsDirPath)) {
    for (const entry of readdirSync(assetsDirPath)) {
      const file = join(assetsDirPath, entry)
      try {
        if (statSync(file).isFile()) entries.push({ name: `assets/${entry}`, data: readFileSync(file) })
      } catch {
        continue
      }
    }
  }
  if (existsSync(thumbFile(docId))) {
    entries.push({ name: 'thumb.png', data: readFileSync(thumbFile(docId)) })
  }
  return createZip(entries)
}

function readme(title: string): string {
  return [
    'Liro — файл доски',
    '',
    `Доска: ${title}`,
    `Сохранено: ${new Date().toISOString()}`,
    '',
    'Внутри:',
    '- board.json — полное описание доски (элементы, стили, связи)',
    '- assets/ — изображения доски',
    '- thumb.png — миниатюра',
    '',
    'Открыть в Liro: перетащите файл в окно приложения или выберите его в «Импорт из файла».'
  ].join('\n')
}

function whitePng(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAD0lEQVR4nGP4jwMwDC0JALoev0Ewkwr8AAAAAElFTkSuQmCC',
    'base64'
  )
}