import type { BoardItem, ConnectorItem, RelativeOffset, ShapeName, TextPoint } from './types'

export interface Point {
  x: number
  y: number
}

export function itemCenter(item: BoardItem): Point {
  return { x: item.x + (item.w || 0) / 2, y: item.y + (item.h || 0) / 2 }
}

export function itemRect(item: BoardItem): { x: number; y: number; width: number; height: number } {
  return { x: item.x, y: item.y, width: item.w || 0, height: item.h || 0 }
}

export type SnapSide = 'top' | 'bottom' | 'left' | 'right' | 'center'

export function snapPoint(item: BoardItem, snapTo?: string): Point {
  const rect = itemRect(item)
  switch (snapTo) {
    case 'top':
      return { x: rect.x + rect.width / 2, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height }
    case 'left':
      return { x: rect.x, y: rect.y + rect.height / 2 }
    case 'right':
      return { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
    default:
      return itemCenter(item)
  }
}

export function anchorPoint(item: BoardItem, offset?: RelativeOffset, snapTo?: string): Point {
  if (offset) {
    const rect = itemRect(item)
    return { x: rect.x + offset.x * Math.max(1, rect.width), y: rect.y + offset.y * Math.max(1, rect.height) }
  }
  return snapPoint(item, snapTo)
}

const ELLIPSE_LIKE: ShapeName[] = [
  'circle',
  'semicircle',
  'quarter_circle',
  'cloud',
  'blob',
  'ring',
  'seal',
  'lens',
  'speech_round',
  'speech_oval',
  'flowchart_start',
  'flowchart_end',
  'flowchart_document'
]

function isEllipseLike(item: BoardItem): boolean {
  return item.kind === 'shape' && ELLIPSE_LIKE.includes(item.shape)
}

export function boundaryPoint(item: BoardItem, towards: Point): Point {
  const rect = itemRect(item)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const dx = towards.x - cx
  const dy = towards.y - cy
  const dist = Math.hypot(dx, dy)
  if (dist < 0.01) return { x: cx, y: cy }
  const radians = ((item.rotation || 0) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const lx = dx * cos + dy * sin
  const ly = -dx * sin + dy * cos
  const halfW = Math.max(1, rect.width) / 2
  const halfH = Math.max(1, rect.height) / 2
  let reach: number
  if (isEllipseLike(item)) {
    reach = dist / Math.hypot(lx / halfW, ly / halfH)
  } else {
    const alongX = Math.abs(lx) > 0.001 ? (halfW / Math.abs(lx)) * dist : Infinity
    const alongY = Math.abs(ly) > 0.001 ? (halfH / Math.abs(ly)) * dist : Infinity
    reach = Math.min(alongX, alongY)
  }
  const distance = Math.min(reach, dist)
  return { x: cx + (dx / dist) * distance, y: cy + (dy / dist) * distance }
}

export function deriveConnectorPoints(connector: ConnectorItem, byId: Map<string, BoardItem>): TextPoint[] {
  const start = connector.startItemId ? byId.get(connector.startItemId) : undefined
  const end = connector.endItemId ? byId.get(connector.endItemId) : undefined
  const startMeta = (connector.raw as { startSnapTo?: string } | undefined)?.startSnapTo
  const endMeta = (connector.raw as { endSnapTo?: string } | undefined)?.endSnapTo
  let a: Point
  let b: Point
  if (start && end && start.id !== end.id) {
    a = attachPoint(start, connector.startOffset, startMeta, itemCenter(end))
    b = attachPoint(end, connector.endOffset, endMeta, a)
  } else if (connector.points.length >= 2) {
    return connector.points.map((point) => ({ x: point.x + connector.x, y: point.y + connector.y }))
  } else {
    const rect = itemRect(connector)
    a = { x: rect.x, y: rect.y + rect.height / 2 }
    b = { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
  if (connector.shape === 'elbowed') return elbowPoints(a, b)
  return [a, b]
}

function elbowPoints(a: Point, b: Point): TextPoint[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (Math.abs(dx) >= Math.abs(dy)) {
    const midX = a.x + dx / 2
    return [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]
  }
  const midY = a.y + dy / 2
  return [a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]
}

export function curveControl(a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const span = Math.hypot(dx, dy) || 1
  const offset = Math.min(span * 0.18, 60)
  return { x: (a.x + b.x) / 2 + (dy / span) * offset, y: (a.y + b.y) / 2 - (dx / span) * offset }
}

function attachPoint(item: BoardItem, offset?: RelativeOffset, snapTo?: string, other?: Point): Point {
  if (offset || snapTo) return anchorPoint(item, offset, snapTo)
  return other ? boundaryPoint(item, other) : itemCenter(item)
}

export function pathForPoints(points: TextPoint[], shape: ConnectorItem['shape']): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (shape === 'elbowed') return roundedPolyline(points)
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`
  return d
}

function roundedPolyline(points: TextPoint[]): string {
  const radius = 14
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]
    const corner = points[i]
    const next = points[i + 1]
    const inX = corner.x - previous.x
    const inY = corner.y - previous.y
    const outX = next.x - corner.x
    const outY = next.y - corner.y
    const inLen = Math.hypot(inX, inY)
    const outLen = Math.hypot(outX, outY)
    if (inLen < 0.01 || outLen < 0.01) {
      d += ` L ${corner.x} ${corner.y}`
      continue
    }
    const cut = Math.min(radius, inLen / 2, outLen / 2)
    d += ` L ${corner.x - (inX / inLen) * cut} ${corner.y - (inY / inLen) * cut}`
    d += ` Q ${corner.x} ${corner.y} ${corner.x + (outX / outLen) * cut} ${corner.y + (outY / outLen) * cut}`
  }
  const last = points[points.length - 1]
  return `${d} L ${last.x} ${last.y}`
}

export function quadraticPath(a: Point, ctrl: Point, b: Point): string {
  return `M ${a.x} ${a.y} Q ${ctrl.x} ${ctrl.y} ${b.x} ${b.y}`
}

export function smoothPath(points: Point[]): string {
  if (points.length < 2) return ''
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i]
    const next = points[i + 1]
    d += ` Q ${cur.x} ${cur.y} ${(cur.x + next.x) / 2} ${(cur.y + next.y) / 2}`
  }
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
}

export function angleAt(p: Point, towards: Point): number {
  return (Math.atan2(towards.y - p.y, towards.x - p.x) * 180) / Math.PI
}

export function normalizeRectPoints(points: TextPoint[]): TextPoint[] {
  return points.map((p) => ({ x: Number.isFinite(p.x) ? p.x : 0, y: Number.isFinite(p.y) ? p.y : 0 }))
}