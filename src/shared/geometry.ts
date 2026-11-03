import { isRoundShape } from './shapes'
import type { BoardItem, ConnectorBend, ConnectorItem, RelativeOffset, TextPoint } from './types'

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

function isEllipseLike(item: BoardItem): boolean {
  return item.kind === 'shape' && isRoundShape(item.shape)
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
  if (connector.bends?.length) return [a, b]
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

export interface ConnectorSegment {
  from: Point
  ctrl: Point
  to: Point
}

export interface BendGrip {
  role: 'apex' | 'joint'
  index: number
  x: number
  y: number
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function quadraticApex(a: Point, ctrl: Point, b: Point): Point {
  return { x: (a.x + 2 * ctrl.x + b.x) / 4, y: (a.y + 2 * ctrl.y + b.y) / 4 }
}

function controlUnderApex(a: Point, b: Point, apex: Point): Point {
  return { x: (4 * apex.x - a.x - b.x) / 2, y: (4 * apex.y - a.y - b.y) / 2 }
}

function connectorControls(connector: ConnectorItem, a: Point, b: Point): Point[] {
  const bends = connector.bends
  if (bends?.length)
    return bends
      .slice()
      .sort((left, right) => left.at - right.at)
      .map((bend) => ({ x: a.x + (b.x - a.x) * bend.at + bend.x, y: a.y + (b.y - a.y) * bend.at + bend.y }))
  if (connector.shape === 'curved') return [curveControl(a, b)]
  return [midpoint(a, b)]
}

function segmentsFrom(controls: Point[], a: Point, b: Point): ConnectorSegment[] {
  const joints: Point[] = []
  for (let index = 0; index + 1 < controls.length; index += 1)
    joints.push(midpoint(controls[index], controls[index + 1]))
  const starts = [a, ...joints]
  const ends = [...joints, b]
  return controls.map((ctrl, index) => ({ from: starts[index], ctrl, to: ends[index] }))
}

export function connectorSpine(connector: ConnectorItem, a: Point, b: Point): ConnectorSegment[] | null {
  if (connector.shape === 'elbowed') return null
  if (connector.shape === 'straight' && !connector.bends?.length) return null
  return segmentsFrom(connectorControls(connector, a, b), a, b)
}

export function connectorAnchor(connector: ConnectorItem, a: Point, b: Point): Point {
  const spine = connectorSpine(connector, a, b)
  if (!spine) return midpoint(a, b)
  const middle = spine[Math.floor((spine.length - 1) / 2)]
  return quadraticApex(middle.from, middle.ctrl, middle.to)
}

export function connectorGrips(connector: ConnectorItem, a: Point, b: Point): BendGrip[] {
  const segments = segmentsFrom(connectorControls(connector, a, b), a, b)
  const grips: BendGrip[] = []
  segments.forEach((segment, index) => {
    const apex = quadraticApex(segment.from, segment.ctrl, segment.to)
    grips.push({ role: 'apex', index, x: apex.x, y: apex.y })
    if (index + 1 < segments.length) {
      const joint = midpoint(segment.ctrl, segments[index + 1].ctrl)
      grips.push({ role: 'joint', index, x: joint.x, y: joint.y })
    }
  })
  return grips
}

export function bendByGrip(
  connector: ConnectorItem,
  grip: BendGrip,
  target: Point,
  a: Point,
  b: Point
): ConnectorBend[] {
  const controls = connectorControls(connector, a, b)
  if (grip.role === 'joint') {
    const joint = midpoint(controls[grip.index], controls[grip.index + 1])
    const dx = target.x - joint.x
    const dy = target.y - joint.y
    const next = controls.slice()
    next[grip.index] = { x: controls[grip.index].x + dx, y: controls[grip.index].y + dy }
    next[grip.index + 1] = { x: controls[grip.index + 1].x + dx, y: controls[grip.index + 1].y + dy }
    return bendsFromControls(next, a, b)
  }
  const segment = segmentsFrom(controls, a, b)[grip.index]
  const focus = controlUnderApex(segment.from, segment.to, target)
  return bendsFromControls(
    [...controls.slice(0, grip.index), midpoint(segment.from, focus), midpoint(focus, segment.to), ...controls.slice(grip.index + 1)],
    a,
    b
  )
}

export function straightenConnector(connector: ConnectorItem, grip: BendGrip, a: Point, b: Point): ConnectorBend[] {
  const controls = connectorControls(connector, a, b)
  const remove = grip.role === 'apex' ? grip.index : grip.index + 1
  const next = [...controls.slice(0, remove), ...controls.slice(remove + 1)]
  if (!next.length) return []
  return bendsFromControls(next, a, b)
}

function bendsFromControls(controls: Point[], a: Point, b: Point): ConnectorBend[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const span = dx * dx + dy * dy || 1
  return controls.map((ctrl) => {
    const at = ((ctrl.x - a.x) * dx + (ctrl.y - a.y) * dy) / span
    return { at, x: Math.round(ctrl.x - (a.x + dx * at)), y: Math.round(ctrl.y - (a.y + dy * at)) }
  })
}

export function sampleConnector(connector: ConnectorItem, points: TextPoint[]): Point[] {
  if (points.length !== 2) return points
  const spine = connectorSpine(connector, points[0], points[1])
  if (!spine) return points
  const out: Point[] = []
  for (const segment of spine)
    out.push(...quadraticSamples(segment.from, segment.ctrl, segment.to).slice(out.length ? 1 : 0))
  return out
}

export function connectorBounds(connector: ConnectorItem, byId: Map<string, BoardItem>): { x: number; y: number; width: number; height: number } {
  const points = deriveConnectorPoints(connector, byId)
  if (points.length < 2) return itemRect(connector)
  const outline = sampleConnector(connector, points).slice()
  const spine = points.length === 2 ? connectorSpine(connector, points[0], points[1]) : null
  const guideStart = spine ? spine[0].ctrl : points[1]
  const guideEnd = spine ? spine[spine.length - 1].ctrl : points[points.length - 2]
  if (isWedgedCap(connector.startStroke)) addHeadCorners(outline, points[0], guideStart, connector.lineWidth)
  if (isWedgedCap(connector.endStroke)) addHeadCorners(outline, points[points.length - 1], guideEnd, connector.lineWidth)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of outline) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  if (!Number.isFinite(minX)) return itemRect(connector)
  const pad = Math.max(2, connector.lineWidth)
  return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 }
}

function addHeadCorners(outline: Point[], tip: Point, from: Point, lineWidth: number): void {
  const dx = tip.x - from.x
  const dy = tip.y - from.y
  const reach = Math.hypot(dx, dy) || 1
  const ux = dx / reach
  const uy = dy / reach
  const size = arrowHeadSize(lineWidth, reach)
  const back = { x: tip.x - ux * size, y: tip.y - uy * size }
  const spread = { x: -uy * size * HEAD_SPREAD, y: ux * size * HEAD_SPREAD }
  outline.push({ x: back.x + spread.x, y: back.y + spread.y }, { x: back.x - spread.x, y: back.y - spread.y })
}

export function arrowHeadSize(lineWidth: number, reach: number): number {
  return Math.max(8, Math.min(48, lineWidth * 7, reach * 0.7))
}

export function isWedgedCap(cap: string): boolean {
  const shape = cap.toLowerCase()
  if (shape === 'none' || shape === 'unknown') return false
  return !shape.includes('diamond') && !shape.includes('oval') && !shape.includes('circle')
}

export function capTrim(cap: string, tip: Point, from: Point, lineWidth: number): number {
  if (!isWedgedCap(cap)) return 0
  const reach = Math.hypot(tip.x - from.x, tip.y - from.y)
  const size = arrowHeadSize(lineWidth, reach)
  const halfAngle = Math.atan(HEAD_SPREAD)
  const needed = (lineWidth / 2 / Math.sin(halfAngle)) * 1.1
  return Math.min(size * 0.6, needed)
}

export function shortenToward(point: Point, toward: Point, distance: number): Point {
  if (distance <= 0) return point
  const dx = toward.x - point.x
  const dy = toward.y - point.y
  const len = Math.hypot(dx, dy) || 1
  const step = Math.min(distance, len / 2)
  return { x: point.x + (dx / len) * step, y: point.y + (dy / len) * step }
}

function quadraticSamples(a: Point, ctrl: Point, b: Point): Point[] {
  const steps = 10
  const out: Point[] = []
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const before = (1 - t) * (1 - t)
    const middle = 2 * (1 - t) * t
    const after = t * t
    out.push({
      x: before * a.x + middle * ctrl.x + after * b.x,
      y: before * a.y + middle * ctrl.y + after * b.y
    })
  }
  return out
}

export function spinePath(spine: ConnectorSegment[], start: Point, end: Point): string {
  let d = `M ${start.x} ${start.y}`
  spine.forEach((segment, index) => {
    const to = index === spine.length - 1 ? end : segment.to
    d += ` Q ${segment.ctrl.x} ${segment.ctrl.y} ${to.x} ${to.y}`
  })
  return d
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

const HEAD_SPREAD = 0.66
const HEAD_NOTCH = 0.765
const HEAD_BOW = 0.04
const HEAD_BOW_X = 0.495
const HEAD_BOW_Y = 0.87
const HEAD_ROUND_TIP = 0.03
const HEAD_ROUND_BACK = 0.255
const HEAD_ROUND_NOTCH = 0.01

export interface HeadSegment {
  ctrl: Point | null
  end: Point
}

export interface HeadShape {
  start: Point
  segments: HeadSegment[]
}

function pointOnQuad(a: Point, ctrl: Point, b: Point, t: number): Point {
  const before = (1 - t) * (1 - t)
  const middle = 2 * (1 - t) * t
  const after = t * t
  return {
    x: before * a.x + middle * ctrl.x + after * b.x,
    y: before * a.y + middle * ctrl.y + after * b.y
  }
}

export function arrowHeadShape(size: number): HeadShape {
  const tip: Point = { x: 0, y: 0 }
  const top: Point = { x: -size, y: -size * HEAD_SPREAD }
  const notch: Point = { x: -size * HEAD_NOTCH, y: 0 }
  const bottom: Point = { x: -size, y: size * HEAD_SPREAD }
  const bow = size * HEAD_BOW
  const roundTip = size * HEAD_ROUND_TIP
  const roundBack = size * HEAD_ROUND_BACK
  const roundNotch = size * HEAD_ROUND_NOTCH
  const edges = [
    {
      from: tip,
      to: bottom,
      ctrl: { x: (tip.x + bottom.x) / 2 + bow * HEAD_BOW_X, y: (tip.y + bottom.y) / 2 + bow * HEAD_BOW_Y },
      lead: roundTip,
      tail: roundBack
    },
    { from: bottom, to: notch, ctrl: null, lead: roundBack, tail: roundNotch },
    { from: notch, to: top, ctrl: null, lead: roundNotch, tail: roundBack },
    {
      from: top,
      to: tip,
      ctrl: { x: (tip.x + top.x) / 2 + bow * HEAD_BOW_X, y: (tip.y + top.y) / 2 - bow * HEAD_BOW_Y },
      lead: roundBack,
      tail: roundTip
    }
  ]
  const cuts = edges.map((edge) => {
    const span = Math.hypot(edge.to.x - edge.from.x, edge.to.y - edge.from.y) || 1
    const at = (t: number): Point =>
      edge.ctrl ? pointOnQuad(edge.from, edge.ctrl, edge.to, t) : {
        x: edge.from.x + (edge.to.x - edge.from.x) * t,
        y: edge.from.y + (edge.to.y - edge.from.y) * t
      }
    return { start: at(Math.min(0.45, edge.lead / span)), end: at(1 - Math.min(0.45, edge.tail / span)) }
  })
  const segments: HeadSegment[] = []
  edges.forEach((edge, index) => {
    segments.push({ ctrl: edge.ctrl, end: cuts[index].end })
    segments.push({ ctrl: edge.to, end: cuts[(index + 1) % edges.length].start })
  })
  return { start: cuts[0].start, segments }
}

export function arrowHeadPath(size: number): string {
  const shape = arrowHeadShape(size)
  let d = `M ${shape.start.x.toFixed(2)} ${shape.start.y.toFixed(2)}`
  for (const segment of shape.segments)
    d += segment.ctrl
      ? ` Q ${segment.ctrl.x.toFixed(2)} ${segment.ctrl.y.toFixed(2)} ${segment.end.x.toFixed(2)} ${segment.end.y.toFixed(2)}`
      : ` L ${segment.end.x.toFixed(2)} ${segment.end.y.toFixed(2)}`
  return `${d} Z`
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