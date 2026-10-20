import type { BoardItem, ConnectorItem, RelativeOffset, TextPoint } from './types'

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

export function deriveConnectorPoints(connector: ConnectorItem, byId: Map<string, BoardItem>): TextPoint[] {
  const start = connector.startItemId ? byId.get(connector.startItemId) : undefined
  const end = connector.endItemId ? byId.get(connector.endItemId) : undefined
  const startMeta = (connector.raw as { startSnapTo?: string } | undefined)?.startSnapTo
  const endMeta = (connector.raw as { endSnapTo?: string } | undefined)?.endSnapTo
  let a: Point
  let b: Point
  if (start && end) {
    a = anchorPoint(start, connector.startOffset, startMeta)
    b = anchorPoint(end, connector.endOffset, endMeta)
  } else if (connector.points.length >= 2) {
    return connector.points.map((point) => ({ x: point.x + connector.x, y: point.y + connector.y }))
  } else {
    const rect = itemRect(connector)
    a = { x: rect.x, y: rect.y + rect.height / 2 }
    b = { x: rect.x + rect.width, y: rect.y + rect.height / 2 }
  }
  if (connector.shape === 'elbowed') {
    return [a, { x: b.x, y: a.y }, b]
  }
  return [a, b]
}

export function pathForPoints(points: TextPoint[], shape: ConnectorItem['shape']): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  if (shape === 'elbowed') {
    let d = `M ${points[0].x} ${points[0].y}`
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1]
      const cur = points[i]
      if (i === 1) {
        const midX = (prev.x + cur.x) / 2
        d += ` L ${midX} ${prev.y} L ${midX} ${cur.y}`
      } else {
        d += ` L ${cur.x} ${cur.y}`
      }
    }
    return d
  }
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 1; i < points.length - 1; i++) d += ` L ${points[i].x} ${points[i].y}`
  const last = points[points.length - 1]
  d += ` L ${last.x} ${last.y}`
  return d
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