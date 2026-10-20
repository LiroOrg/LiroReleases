import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BoardDoc, BoardItem, ShapeName, SolidItem } from '@shared/types'
import { curvePath } from '@shared/curve'
import { deriveConnectorPoints, pathForPoints } from '@shared/geometry'
import { compileFormula, curveSegments } from '@shared/graph'
import { solidProjection, faceLocalToWorld, projectPoint } from '@shared/three'
import { assetsDir } from '../paths'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shapePath(shape: ShapeName, w: number, h: number): string {
  switch (shape) {
    case 'circle':
      return `M ${w / 2},0 A ${w / 2},${h / 2} 0 1 1 ${w / 2 - 0.01},0 Z`
    case 'triangle':
      return `M ${w / 2},0 L ${w},${h} L 0,${h} Z`
    case 'right_triangle':
      return `M 0,0 L ${w},0 L 0,${h} Z`
    case 'diamond':
      return `M ${w / 2},0 L ${w},${h / 2} L ${w / 2},${h} L 0,${h / 2} Z`
    case 'pentagon':
      return `M ${w * 0.5},0 L ${w},${h * 0.38} L ${w * 0.81},${h} L ${w * 0.19},${h} L 0,${h * 0.38} Z`
    case 'hexagon':
      return `M ${w * 0.25},0 L ${w * 0.75},0 L ${w},${h / 2} L ${w * 0.75},${h} L ${w * 0.25},${h} L 0,${h / 2} Z`
    case 'octagon':
      return `M ${w * 0.3},0 L ${w * 0.7},0 L ${w},${h * 0.3} L ${w},${h * 0.7} L ${w * 0.7},${h} L ${w * 0.3},${h} L 0,${h * 0.7} L 0,${h * 0.3} Z`
    case 'trapezoid':
      return `M ${w * 0.2},0 L ${w * 0.8},0 L ${w},${h} L 0,${h} Z`
    case 'parallelogram':
      return `M ${w * 0.2},0 L ${w},0 L ${w * 0.8},${h} L 0,${h} Z`
    case 'arrow_right':
      return `M 0,${h * 0.3} L ${w * 0.6},${h * 0.3} L ${w * 0.6},0 L ${w},${h / 2} L ${w * 0.6},${h} L ${w * 0.6},${h * 0.7} L 0,${h * 0.7} Z`
    case 'arrow_left':
      return `M ${w},${h * 0.3} L ${w * 0.4},${h * 0.3} L ${w * 0.4},0 L 0,${h / 2} L ${w * 0.4},${h} L ${w * 0.4},${h * 0.7} L ${w},${h * 0.7} Z`
    case 'arrow_up':
      return `M ${w * 0.3},${h} L ${w * 0.3},${h * 0.4} L 0,${h * 0.4} L ${w / 2},0 L ${w},${h * 0.4} L ${w * 0.7},${h * 0.4} L ${w * 0.7},${h} Z`
    case 'arrow_down':
      return `M ${w * 0.3},0 L ${w * 0.3},${h * 0.6} L 0,${h * 0.6} L ${w / 2},${h} L ${w},${h * 0.6} L ${w * 0.7},${h * 0.6} L ${w * 0.7},0 Z`
    case 'cross':
      return `M ${w * 0.35},0 L ${w * 0.65},0 L ${w * 0.65},${h * 0.35} L ${w},${h * 0.35} L ${w},${h * 0.65} L ${w * 0.65},${h * 0.65} L ${w * 0.65},${h} L ${w * 0.35},${h} L ${w * 0.35},${h * 0.65} L 0,${h * 0.65} L 0,${h * 0.35} L ${w * 0.35},${h * 0.35} Z`
    case 'star': {
      const starPoints: Array<[number, number]> = []
      for (let index = 0; index < 10; index += 1) {
        const radius = index % 2 === 0 ? 0.5 : 0.2
        const angle = (Math.PI / 5) * index - Math.PI / 2
        starPoints.push([w / 2 + Math.cos(angle) * w * radius, h / 2 + Math.sin(angle) * h * radius])
      }
      return `M ${starPoints.map(([px, py]) => `${px},${py}`).join(' ')} Z`
    }
    default:
      return `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`
  }
}

function textLines(plain: string, limit: number): string[] {
  return plain
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

function tickLabel(value: number): string {
  if (Math.abs(value) < 1e-9) return '0'
  return String(Math.round(value * 1000) / 1000)
}

function cellLines(text: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const perLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)))
  const out: string[] = []
  for (const raw of text.split('\n')) {
    let line = ''
    for (let word of raw.split(/\s+/).filter(Boolean)) {
      while (word.length > perLine) {
        if (line.length) {
          out.push(line)
          line = ''
        }
        out.push(word.slice(0, perLine))
        word = word.slice(perLine)
      }
      if (!line.length) line = word
      else if (`${line} ${word}`.length <= perLine) line += ` ${word}`
      else {
        out.push(line)
        line = word
      }
    }
    if (line.length) out.push(line)
  }
  if (out.length <= maxLines) return out
  const shown = out.slice(0, maxLines)
  shown[maxLines - 1] = `${shown[maxLines - 1].slice(0, Math.max(1, perLine - 1))}…`
  return shown
}

function itemSvg(item: BoardItem, docId: string, index: number, byId: Map<string, BoardItem>): string {
  const x = Math.round(item.x)
  const y = Math.round(item.y)
  const w = Math.max(1, Math.round(item.w))
  const h = Math.max(1, Math.round(item.h))
  const rotate = item.rotation ? ` transform="rotate(${item.rotation} ${x + w / 2} ${y + h / 2})"` : ''
  switch (item.kind) {
    case 'frame': {
      const fill = item.fillColor && item.fillColor !== 'transparent' ? item.fillColor : 'none'
      return `<g${rotate}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${item.color}" stroke-width="1.5"/>${
        item.title ? `<text x="${x + 10}" y="${y + 20}" font-size="14" font-family="Inter, sans-serif" fill="${item.titleColor}">${esc(item.title)}</text>` : ''
      }</g>`
    }
    case 'sticky': {
      const radius = item.shape === 'round' ? 10 : 0
      return `<g${rotate}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${item.color}" stroke="#1a1a1a" stroke-opacity="0.15"/>${textLines(
        item.plain,
        8
      )
        .map(
          (line, lineIndex) =>
            `<text x="${x + 10}" y="${y + 22 + lineIndex * (item.fontSize + 4)}" font-size="${item.fontSize}" font-family="Inter, sans-serif" fill="#1a1a1a">${esc(line)}</text>`
        )
        .join('')}</g>`
    }
    case 'text': {
      const anchor = item.align === 'center' ? 'middle' : item.align === 'right' ? 'end' : 'start'
      const tx = item.align === 'center' ? x + w / 2 : item.align === 'right' ? x + w : x
      return `<g${rotate}>${textLines(item.plain, 12)
        .map(
          (line, lineIndex) =>
            `<text x="${tx}" y="${y + item.fontSize + lineIndex * (item.fontSize + 4)}" text-anchor="${anchor}" font-size="${item.fontSize}" font-family="${
              item.fontFamily || 'Inter, sans-serif'
            }" fill="${item.color}">${esc(line)}</text>`
        )
        .join('')}</g>`
    }
    case 'shape': {
      const dash = item.borderStyle === 'dashed' ? ' stroke-dasharray="8 6"' : item.borderStyle === 'dotted' ? ' stroke-dasharray="2 5"' : ''
      return `<g${rotate}><path d="${shapePath(item.shape, w, h)}" fill="${item.fillColor}" stroke="${item.borderColor}" stroke-width="${item.borderWidth}"${dash} opacity="${item.opacity}"/>${textLines(
        item.plain,
        4
      )
        .map(
          (line, lineIndex) =>
            `<text x="${x + w / 2}" y="${y + h / 2 + lineIndex * (item.fontSize + 4)}" text-anchor="middle" font-size="${item.fontSize}" font-family="Inter, sans-serif" fill="${
              item.textColor || '#1a1a1a'
            }">${esc(line)}</text>`
        )
        .join('')}</g>`
    }
    case 'path': {
      if (item.points.length < 2) return ''
      const local = item.points.map((point) => ({ x: point.x + x, y: point.y + y }))
      return `<path d="${curvePath(local)}" fill="none" stroke="${item.color}" stroke-width="${item.lineWidth}" stroke-linecap="round" stroke-linejoin="round"${item.opacity !== undefined ? ` stroke-opacity="${item.opacity}"` : ''}/>`
    }
    case 'connector': {
      const points = deriveConnectorPoints(item, byId)
      if (points.length < 2) return ''
      const dash = item.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : item.lineStyle === 'dotted' ? ' stroke-dasharray="2 5"' : ''
      const attributes = `fill="none" stroke="${item.color}" stroke-width="${item.lineWidth}"${dash} stroke-linecap="round"`
      if (item.shape === 'curved' && points.length === 2) {
        const [a, b] = points
        const span = Math.hypot(b.x - a.x, b.y - a.y)
        return `<path d="M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${(a.y + b.y) / 2 - Math.min(span * 0.18, 60)} ${b.x} ${b.y}" ${attributes}/>`
      }
      return `<path d="${pathForPoints(points, item.shape)}" ${attributes}/>`
    }
    case 'table': {
      const columns = Math.max(1, item.columns)
      const rows = Math.max(1, item.rows)
      const widths = Array.from({ length: columns }, (_, index) => Math.max(60, item.columnWidths[index] ?? 180))
      const heights = Array.from({ length: rows }, (_, index) => Math.max(28, item.rowHeights[index] ?? 44))
      const left: number[] = []
      let cursorX = 0
      for (const value of widths) {
        left.push(cursorX)
        cursorX += value
      }
      const top: number[] = []
      let cursorY = 0
      for (const value of heights) {
        top.push(cursorY)
        cursorY += value
      }
      const fontSize = Math.max(8, item.fontSize || 14)
      const parts: string[] = [
        `<g${rotate}><g transform="translate(${x} ${y})">`,
        `<rect x="0" y="0" width="${cursorX}" height="${cursorY}" fill="#ffffff" stroke="#d4d4d8"/>`
      ]
      for (let index = 1; index < columns; index += 1) {
        parts.push(`<line x1="${left[index]}" y1="0" x2="${left[index]}" y2="${cursorY}" stroke="#e4e4e7"/>`)
      }
      for (let index = 1; index < rows; index += 1) {
        parts.push(`<line x1="0" y1="${top[index]}" x2="${cursorX}" y2="${top[index]}" stroke="#e4e4e7"/>`)
      }
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const lines = cellLines(
            item.cells[row * columns + column] ?? '',
            widths[column] - 16,
            fontSize,
            Math.max(1, Math.floor((heights[row] - 12) / (fontSize * 1.35)))
          )
          for (let index = 0; index < lines.length; index += 1) {
            parts.push(
              `<text x="${left[column] + 8}" y="${
                top[row] + 6 + fontSize + index * fontSize * 1.35
              }" font-size="${fontSize}" font-family="Inter, sans-serif" fill="#1a1a1a">${esc(lines[index])}</text>`
            )
          }
        }
      }
      parts.push('</g></g>')
      return parts.join('')
    }
    case 'graph': {
      const graphWidth = Math.max(1, w)
      const graphHeight = Math.max(1, h)
      const originX = clamp01(item.originX)
      const originY = clamp01(item.originY)
      const step = item.gridStep > 0 ? item.gridStep : 1
      const toX = (value: number): number => originX * graphWidth + value * item.scale
      const toY = (value: number): number => (1 - originY) * graphHeight - value * item.scale
      const stepPx = Math.max(1, step * item.scale)
      const drawEvery = Math.max(1, Math.ceil(8 / stepPx))
      const radius = Math.max(0, Math.min(20, Math.round(Math.min(graphWidth, graphHeight) * 0.03)))
      const tick = Math.max(9, Math.min(15, Math.round(Math.min(graphWidth, graphHeight) / 44)))
      const axisX = toX(0)
      const axisY = toY(0)
      const clip = `graph-${item.id.replace(/[^A-Za-z0-9_-]/g, '_')}`
      const parts: string[] = [
        `<g${rotate}><defs><clipPath id="${clip}"><rect x="0" y="0" width="${graphWidth}" height="${graphHeight}" rx="${radius}" ry="${radius}"/></clipPath></defs>`,
        `<g clip-path="url(#${clip})" transform="translate(${x} ${y})">`,
        `<rect x="0" y="0" width="${graphWidth}" height="${graphHeight}" rx="${radius}" ry="${radius}" fill="#ffffff"/>`
      ]
      if (item.showGrid) {
        const limit = Math.ceil(Math.max(graphWidth, graphHeight) / stepPx) + 2
        for (let index = drawEvery; index <= limit; index += drawEvery) {
          const offset = index * stepPx
          const lines: string[] = []
          if (offset <= graphWidth)
            lines.push(`<line x1="${originX * graphWidth + offset}" y1="0" x2="${originX * graphWidth + offset}" y2="${graphHeight}"`)
          if (originX * graphWidth - offset >= 0)
            lines.push(`<line x1="${originX * graphWidth - offset}" y1="0" x2="${originX * graphWidth - offset}" y2="${graphHeight}"`)
          if (offset <= graphHeight)
            lines.push(
              `<line x1="0" y1="${(1 - originY) * graphHeight + offset}" x2="${graphWidth}" y2="${(1 - originY) * graphHeight + offset}"`
            )
          if ((1 - originY) * graphHeight - offset >= 0)
            lines.push(
              `<line x1="0" y1="${(1 - originY) * graphHeight - offset}" x2="${graphWidth}" y2="${(1 - originY) * graphHeight - offset}"`
            )
          for (const line of lines) parts.push(`${line} stroke="${item.axisColor}" stroke-width="0.5" opacity="0.16"/>`)
        }
      }
      parts.push(`<line x1="0" y1="${axisY}" x2="${graphWidth}" y2="${axisY}" stroke="${item.axisColor}" stroke-width="${item.lineWidth}"/>`)
      parts.push(`<line x1="${axisX}" y1="0" x2="${axisX}" y2="${graphHeight}" stroke="${item.axisColor}" stroke-width="${item.lineWidth}"/>`)
      if (item.showLabels) {
        const count = Math.ceil(Math.max(graphWidth, graphHeight) / stepPx) + 2
        for (let index = drawEvery; index <= count; index += drawEvery) {
          const value = index * step
          const labels: Array<{ px: number; py: number; text: string; anchor: string }> = []
          const right = toX(value)
          if (right > tick * 2 && right < graphWidth - tick)
            labels.push({ px: right, py: axisY + tick + 3, text: tickLabel(value), anchor: 'middle' })
          const leftEdge = toX(-value)
          if (leftEdge > tick * 2 && leftEdge < graphWidth - tick)
            labels.push({ px: leftEdge, py: axisY + tick + 3, text: tickLabel(-value), anchor: 'middle' })
          const up = toY(value)
          if (up > tick && up < graphHeight - 4) labels.push({ px: axisX - 6, py: up + tick * 0.35, text: tickLabel(value), anchor: 'end' })
          const down = toY(-value)
          if (down > tick && down < graphHeight - 4) labels.push({ px: axisX - 6, py: down + tick * 0.35, text: tickLabel(-value), anchor: 'end' })
          for (const label of labels)
            parts.push(
              `<text x="${label.px}" y="${label.py}" font-size="${tick}" font-family="Inter, sans-serif" fill="${item.axisColor}" opacity="0.55" text-anchor="${label.anchor}">${esc(label.text)}</text>`
            )
        }
      }
      for (const expression of item.expressions) {
        if (!expression.visible || !expression.formula.trim()) continue
        const fn = compileFormula(expression.formula)
        if (!fn) continue
        const segments = curveSegments(
          fn,
          (-originX * graphWidth) / item.scale,
          ((1 - originX) * graphWidth) / item.scale,
          toX,
          toY,
          graphWidth,
          graphHeight
        )
        for (const points of segments)
          parts.push(
            `<polyline points="${points.join(' ')}" fill="none" stroke="${expression.color}" stroke-width="${expression.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
          )
      }
      parts.push('</g></g>')
      return parts.join('')
    }
    case 'image': {
      const file = item.asset?.local ? join(assetsDir(docId), item.asset.file) : ''
      if (!file || !existsSync(file)) {
        return `<g${rotate}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f2f2f2" stroke="#d4d4d4"/></g>`
      }
      const data = readFileSync(file).toString('base64')
      const mime = item.asset?.mime || 'image/png'
      return `<g${rotate}><image x="${x}" y="${y}" width="${w}" height="${h}" href="data:${mime};base64,${data}" preserveAspectRatio="none"/></g>`
    }
    case 'solid': {
      const solid = item as SolidItem
      const projection = solidProjection(solid)
      const parts: string[] = [`<g${rotate}>`]
      for (const polygon of projection.polygons) {
        if (!polygon.front) continue
        const points = polygon.points
          .map((point) => `${Math.round(point.x + x)},${Math.round(point.y + y)}`)
          .join(' ')
        const fill = polygon.shade > 0.5 ? '#ffffff' : '#e4e4e4'
        parts.push(`<polygon points="${points}" fill="${fill}" stroke="${solid.color}" stroke-width="${solid.lineWidth}"/>`)
      }
      for (const sketch of solid.sketch) {
        const polygon = projection.polygons.find((entry) => entry.id === sketch.face)
        if (!polygon) continue
        const local = sketch.points.map((point) => {
          const screen = projectPoint(faceLocalToWorld(polygon, point), projection.camera)
          return { x: screen.x + x, y: screen.y + y }
        })
        parts.push(
          `<path d="${curvePath(local)}" fill="none" stroke="${sketch.color}" stroke-width="${sketch.lineWidth}" stroke-linecap="round"/>`
        )
      }
      for (const label of solid.labels ?? []) {
        const polygon = projection.polygons.find((entry) => entry.id === label.face)
        if (!polygon || !polygon.front || !label.text) continue
        const unit = Math.max(20, label.size * 3)
        const at = projectPoint(faceLocalToWorld(polygon, label.point), projection.camera)
        const along = projectPoint(faceLocalToWorld(polygon, { x: label.point.x + unit, y: label.point.y }), projection.camera)
        const stretch = Math.max(0.15, Math.hypot(along.x - at.x, along.y - at.y) / unit)
        const angle = (Math.atan2(along.y - at.y, along.x - at.x) * 180) / Math.PI
        const lines = label.text.split('\n')
        const spans = lines
          .map(
            (line, index) =>
              `<tspan x="0" dy="${index === 0 ? 0 : Math.round(label.size * 1.2)}">${esc(line)}</tspan>`
          )
          .join('')
        parts.push(
          `<text transform="translate(${Math.round(at.x + x)} ${Math.round(at.y + y)}) rotate(${Math.round(angle * 100) / 100}) scale(${Math.round(stretch * 1000) / 1000})" font-size="${label.size}" font-family="Inter, sans-serif" fill="${solid.color}" text-anchor="middle" dominant-baseline="middle">${spans}</text>`
        )
      }
      parts.push('</g>')
      return parts.join('')
    }
    case 'comment': {
      return `<g${rotate}><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${w / 2}" fill="#1a1a1a"/><text x="${x + w / 2}" y="${
        y + h / 2 + 4
      }" text-anchor="middle" font-size="12" font-family="Inter, sans-serif" fill="#ffffff">${index + 1}</text></g>`
    }
    default: {
      return `<g${rotate}><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#c4c4c4" stroke-dasharray="4 4"/></g>`
    }
  }
}

export function buildSvg(doc: BoardDoc, docId: string, background: string): string {
  const pad = 40
  const minX = Math.round(doc.bounds.x - pad)
  const minY = Math.round(doc.bounds.y - pad)
  const width = Math.max(1, Math.round(doc.bounds.width + pad * 2))
  const height = Math.max(1, Math.round(doc.bounds.height + pad * 2))
  const comments = doc.items.filter((item) => item.kind === 'comment')
  const byId = new Map(doc.items.map((item) => [item.id, item]))
  const parts: string[] = []
  for (const item of [...doc.items].sort((left, right) => left.z - right.z)) {
    const commentIndex = item.kind === 'comment' ? comments.findIndex((entry) => entry.id === item.id) : -1
    parts.push(itemSvg(item, docId, commentIndex, byId))
  }
  const fill = background === 'transparent' ? 'none' : '#ffffff'
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">\n<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${fill}"/>\n${parts.join('\n')}\n</svg>\n`
}
