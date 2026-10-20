import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BoardDoc, BoardItem, ShapeName, SolidItem } from '@shared/types'
import { curvePath } from '@shared/curve'
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
  const points = (list: Array<[number, number]>): string => list.map(([x, y]) => `${x},${y}`).join(' ')
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

function itemSvg(item: BoardItem, docId: string, index: number): string {
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
      return `<path d="${curvePath(local)}" fill="none" stroke="${item.color}" stroke-width="${item.lineWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
    }
    case 'connector': {
      if (item.points.length < 2) return ''
      const local = item.points.map((point) => ({ x: point.x + x, y: point.y + y }))
      const dash = item.lineStyle === 'dashed' ? ' stroke-dasharray="8 6"' : item.lineStyle === 'dotted' ? ' stroke-dasharray="2 5"' : ''
      return `<path d="${curvePath(local)}" fill="none" stroke="${item.color}" stroke-width="${item.lineWidth}"${dash} stroke-linecap="round"/>`
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
  const parts: string[] = []
  for (const item of [...doc.items].sort((left, right) => left.z - right.z)) {
    const commentIndex = item.kind === 'comment' ? comments.findIndex((entry) => entry.id === item.id) : -1
    parts.push(itemSvg(item, docId, commentIndex))
  }
  const fill = background === 'transparent' ? 'none' : '#ffffff'
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX} ${minY} ${width} ${height}">\n<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${fill}"/>\n${parts.join('\n')}\n</svg>\n`
}
