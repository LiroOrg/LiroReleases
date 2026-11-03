import type { ShapeName } from '@shared/types'

export interface ShapeParams {
  adjust?: number
  adjust2?: number
  tail?: { x: number; y: number }
  vertices?: Array<{ x: number; y: number }>
}

export interface ShapeHandle {
  id: string
  x: number
  y: number
  axis: 'x' | 'y' | 'xy'
}

const round = (value: number): number => Math.round(value * 100) / 100

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

type Pt = [number, number]

const polygon = (points: Array<[number, number]>): string => {
  if (!points.length) return ''
  const [first, ...rest] = points
  return `M ${round(first[0])} ${round(first[1])} ` + rest.map(([x, y]) => `L ${round(x)} ${round(y)}`).join(' ') + ' Z'
}

const box = (w: number, h: number): string => `M 0 0 H ${round(w)} V ${round(h)} H 0 Z`

const stroke = (points: Array<[number, number]>): string =>
  points.map(([x, y], index) => `${index ? ' L' : ' M'} ${round(x)} ${round(y)}`).join('')

const arcTo = (cx: number, cy: number, rx: number, ry: number, from: number, to: number): string => {
  const sweep = to > from ? 1 : 0
  const large = Math.abs(to - from) > Math.PI ? 1 : 0
  return ` A ${round(rx)} ${round(ry)} 0 ${large} ${sweep} ${round(cx + rx * Math.cos(to))} ${round(
    cy + ry * Math.sin(to)
  )}`
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, dir: 1 | -1 = 1): string => {
  const start: Pt = [cx + rx, cy]
  return (
    `M ${round(start[0])} ${round(start[1])}` +
    arcTo(cx, cy, rx, ry, 0, dir * Math.PI) +
    arcTo(cx, cy, rx, ry, dir * Math.PI, dir * Math.PI * 2)
  )
}

const regular = (sides: number, w: number, h: number, rotation: number): Array<[number, number]> => {
  const points: Array<[number, number]> = []
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * 2 * Math.PI) / sides
    points.push([w / 2 + (w / 2) * Math.cos(angle), h / 2 + (h / 2) * Math.sin(angle)])
  }
  return points
}

const starPoints = (w: number, h: number, points = 5, innerRatio = 0.45): Array<[number, number]> => {
  const result: Array<[number, number]> = []
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    const ratio = i % 2 === 0 ? 1 : innerRatio
    result.push([w / 2 + (w / 2) * ratio * Math.cos(angle), h / 2 + (h / 2) * ratio * Math.sin(angle)])
  }
  return result
}

const roundedRect = (w: number, h: number, radius: number): string => {
  const r = clamp(radius, 0, Math.min(w, h) / 2)
  if (r < 0.5) return box(w, h)
  return (
    `M ${round(r)} 0 H ${round(w - r)}` +
    ` A ${round(r)} ${round(r)} 0 0 1 ${round(w)} ${round(r)} V ${round(h - r)}` +
    ` A ${round(r)} ${round(r)} 0 0 1 ${round(w - r)} ${round(h)} H ${round(r)}` +
    ` A ${round(r)} ${round(r)} 0 0 1 0 ${round(h - r)} V ${round(r)}` +
    ` A ${round(r)} ${round(r)} 0 0 1 ${round(r)} 0 Z`
  )
}

const ARROW_DIR: Partial<Record<ShapeName, 'right' | 'left' | 'up' | 'down' | 'lr' | 'ud' | 'four'>> = {
  arrow_right: 'right',
  arrow_left: 'left',
  arrow_up: 'up',
  arrow_down: 'down',
  arrow_double: 'lr',
  arrow_up_down: 'ud',
  arrow_four_way: 'four'
}

const toBox = (dir: 'right' | 'left' | 'up' | 'down', point: Pt, w: number, h: number): Pt => {
  const vertical = dir === 'up' || dir === 'down'
  const base: Pt = vertical ? [point[1], point[0]] : point
  if (dir === 'left') return [w - base[0], base[1]]
  if (dir === 'up') return [base[0], h - base[1]]
  return base
}

const fromBox = (dir: 'right' | 'left' | 'up' | 'down', point: Pt, w: number, h: number): Pt => {
  const base: Pt = dir === 'left' ? [w - point[0], point[1]] : dir === 'up' ? [point[0], h - point[1]] : point
  return dir === 'up' || dir === 'down' ? [base[1], base[0]] : base
}

function blockArrow(dir: 'right' | 'left' | 'up' | 'down', w: number, h: number, head: number, shaft: number): string {
  const vertical = dir === 'up' || dir === 'down'
  const length = vertical ? h : w
  const cross = vertical ? w : h
  const hx = length - head * length
  const half = (cross * shaft) / 2
  const points: Array<[number, number]> = [
    [0, cross / 2 - half],
    [hx, cross / 2 - half],
    [hx, 0],
    [length, cross / 2],
    [hx, cross],
    [hx, cross / 2 + half],
    [0, cross / 2 + half]
  ]
  return polygon(points.map((point) => toBox(dir, point, w, h)))
}

function doubleArrow(dir: 'lr' | 'ud', w: number, h: number, head: number, shaft: number): string {
  const length = dir === 'lr' ? w : h
  const cross = dir === 'lr' ? h : w
  const inset = head * length
  const half = (cross * shaft) / 2
  const points: Array<[number, number]> = [
    [0, cross / 2],
    [inset, 0],
    [inset, cross / 2 - half],
    [length - inset, cross / 2 - half],
    [length - inset, 0],
    [length, cross / 2],
    [length - inset, cross],
    [length - inset, cross / 2 + half],
    [inset, cross / 2 + half],
    [inset, cross]
  ]
  return dir === 'lr' ? polygon(points) : polygon(points.map(([x, y]) => [y, x]))
}

function fourArrow(w: number, h: number, head: number, shaft: number): string {
  const half = (Math.min(w, h) * shaft) / 4
  const hx = head * w
  const hy = head * h
  return polygon([
    [w / 2, 0],
    [w / 2 + half, hy],
    [w - hx, hy],
    [w - hx, h / 2 - half],
    [w, h / 2],
    [w - hx, h / 2 + half],
    [w - hx, h - hy],
    [w / 2 + half, h - hy],
    [w / 2, h],
    [w / 2 - half, h - hy],
    [hx, h - hy],
    [hx, h / 2 + half],
    [0, h / 2],
    [hx, h / 2 - half],
    [hx, hy],
    [w / 2 - half, hy]
  ])
}

function bendArrow(w: number, h: number, head: number, shaft: number, flip: boolean): string {
  const half = Math.min(w, h) * shaft * 0.16
  const hw = half * 1.9
  const headBase = head * h
  const cx = w - hw
  const raw: Array<[number, number]> = [
    [0, h],
    [0, h - half * 2],
    [cx - half, h - half * 2],
    [cx - half, headBase],
    [cx - hw, headBase],
    [cx, 0],
    [cx + hw, headBase],
    [cx + half, headBase],
    [cx + half, h - half * 2],
    [w, h - half * 2],
    [w, h]
  ]
  const points = raw.map(([x, y]): Pt => (flip ? [w - x, y] : [x, y]))
  return polygon(points)
}

function circularArrow(w: number, h: number, head: number, shaft: number): string {
  const cx = w / 2
  const cy = h / 2
  const outer = head * 0.9
  const bandIn = 1 - shaft * 0.8
  const start = -Math.PI * 0.78
  const end = Math.PI * 0.42
  const polar = (angle: number, ratio: number): Pt => [cx + (w / 2) * ratio * Math.cos(angle), cy + (h / 2) * ratio * Math.sin(angle)]
  const tip = polar(end + outer * 0.55, (bandIn + 1) / 2)
  const headWide = polar(end, 1)
  const headWideIn = polar(end, bandIn - 0.18)
  return (
    `M ${round(polar(start, 1)[0])} ${round(polar(start, 1)[1])}` +
    arcTo(cx, cy, w / 2, h / 2, start, end) +
    ` L ${round(headWide[0])} ${round(headWide[1])}` +
    ` L ${round(tip[0])} ${round(tip[1])}` +
    ` L ${round(headWideIn[0])} ${round(headWideIn[1])}` +
    arcTo(cx, cy, (w / 2) * bandIn, (h / 2) * bandIn, end + outer * 0.1, start) +
    ' Z'
  )
}

const cloudPath = (w: number, h: number, bottom = 1): string => {
  const outline: Array<[number, number]> = [
    [0.12, 0.9 * bottom],
    [0.14, 0.55 * bottom],
    [0.33, 0.33 * bottom],
    [0.5, 0.45 * bottom],
    [0.66, 0.16 * bottom],
    [0.85, 0.42 * bottom],
    [0.88, 0.9 * bottom]
  ]
  let d = `M ${round(outline[0][0] * w)} ${round(outline[0][1] * h)}`
  for (let i = 1; i < outline.length; i++) {
    const chord = Math.hypot((outline[i][0] - outline[i - 1][0]) * w, (outline[i][1] - outline[i - 1][1]) * h)
    d += ` A ${round(chord * 0.62)} ${round(chord * 0.62)} 0 0 1 ${round(outline[i][0] * w)} ${round(outline[i][1] * h)}`
  }
  return d + ' Z'
}

const blobPath = (w: number, h: number): string => {
  const ratios = [0.98, 0.72, 0.94, 0.76, 1, 0.84]
  const points = ratios.map((ratio, index): [number, number] => {
    const angle = (index * 2 * Math.PI) / ratios.length
    return [w / 2 + (w / 2) * ratio * Math.cos(angle), h / 2 + (h / 2) * ratio * Math.sin(angle)]
  })
  const segments = points.map((point, index) => {
    const before = points[(index - 1 + points.length) % points.length]
    const after = points[(index + 1) % points.length]
    const far = points[(index + 2) % points.length]
    const first: [number, number] = [point[0] + (after[0] - before[0]) / 6, point[1] + (after[1] - before[1]) / 6]
    const second: [number, number] = [after[0] - (far[0] - point[0]) / 6, after[1] - (far[1] - point[1]) / 6]
    return `C ${round(first[0])} ${round(first[1])} ${round(second[0])} ${round(second[1])} ${round(after[0])} ${round(after[1])}`
  })
  return `M ${round(points[0][0])} ${round(points[0][1])} ` + segments.join(' ') + ' Z'
}

const heartPath = (w: number, h: number): string =>
  `M ${round(w / 2)} ${round(h)}` +
  ` C ${round(w * 0.16)} ${round(h * 0.7)} 0 ${round(h * 0.5)} 0 ${round(h * 0.3)}` +
  ` C 0 ${round(h * 0.1)} ${round(w * 0.11)} 0 ${round(w * 0.23)} 0` +
  ` C ${round(w * 0.36)} 0 ${round(w * 0.45)} ${round(h * 0.09)} ${round(w / 2)} ${round(h * 0.19)}` +
  ` C ${round(w * 0.55)} ${round(h * 0.09)} ${round(w * 0.64)} 0 ${round(w * 0.77)} 0` +
  ` C ${round(w * 0.89)} 0 ${round(w)} ${round(h * 0.1)} ${round(w)} ${round(h * 0.3)}` +
  ` C ${round(w)} ${round(h * 0.5)} ${round(w * 0.84)} ${round(h * 0.7)} ${round(w / 2)} ${round(h)} Z`

const TAIL_DEFAULT = { x: 0.16, y: 1 }

const clampTail = (tail: { x: number; y: number }): { x: number; y: number } => ({
  x: clamp(tail.x, -0.15, 1.15),
  y: clamp(tail.y, 0.62, 1)
})

function calloutTail(w: number, h: number, tail: { x: number; y: number }): { tip: Pt; leftX: number; rightX: number } {
  const point = clampTail(tail)
  const spread = Math.min(w * 0.1, 24)
  return { tip: [point.x * w, point.y * h], leftX: point.x * w - spread, rightX: point.x * w + spread }
}

function bodyHeight(h: number, tail: { x: number; y: number }): number {
  return clamp(clampTail(tail).y * h - h * 0.14, h * 0.45, h * 0.86)
}

function wedgeOnEllipse(
  w: number,
  h: number,
  body: number,
  tail: { x: number; y: number }
): { tip: Pt; start: Pt; from: number; to: number } {
  const cx = w / 2
  const cy = body / 2
  const point = clampTail(tail)
  const tip: Pt = [point.x * w, point.y * h]
  const angle = clamp(Math.atan2(tip[1] - cy, tip[0] - cx), 0.5, Math.PI - 0.5)
  const from = angle + 0.26
  return {
    tip,
    start: [cx + cx * Math.cos(from), cy + (body / 2) * Math.sin(from)],
    from,
    to: angle - 0.26 + Math.PI * 2
  }
}

const tagPath = (w: number, h: number): string =>
  `M ${round(w * 0.26)} 0 H ${round(w)} V ${round(h)} H ${round(w * 0.26)} L 0 ${round(h / 2)} Z ` +
  ellipse(w * 0.3, h / 2, Math.min(w, h) * 0.07, Math.min(w, h) * 0.07, -1)

const crossXPath = (w: number, h: number): string => {
  const t = 0.17
  return polygon([
    [0, h * t],
    [w * t, 0],
    [w * 0.5, h * (0.5 - t)],
    [w * (1 - t), 0],
    [w, h * t],
    [w * (0.5 + t), h * 0.5],
    [w, h * (1 - t)],
    [w * (1 - t), h],
    [w * 0.5, h * (0.5 + t)],
    [w * t, h],
    [0, h * (1 - t)],
    [w * (0.5 - t), h * 0.5]
  ])
}

const sparklePath = (w: number, h: number): string => {
  const cx = w / 2
  const cy = h / 2
  const arm = `${round(cx)} ${round(cy)}`
  return (
    `M ${round(cx)} 0 Q ${arm} ${round(w)} ${round(cy)} Q ${arm} ${round(cx)} ${round(h)} ` +
    `Q ${arm} 0 ${round(cy)} Q ${arm} ${round(cx)} 0 Z`
  )
}

const sealPath = (w: number, h: number): string => {
  const bumps = 12
  const cx = w / 2
  const cy = h / 2
  const radius = (Math.min(w, h) / 2) * 0.88
  let d = `M ${round(cx + radius)} ${round(cy)}`
  for (let i = 1; i <= bumps; i++) {
    const angle = (i * 2 * Math.PI) / bumps
    const chord = 2 * radius * Math.sin(Math.PI / bumps)
    d += ` A ${round(chord * 0.62)} ${round(chord * 0.62)} 0 0 1 ${round(cx + radius * Math.cos(angle))} ${round(
      cy + radius * Math.sin(angle)
    )}`
  }
  return d + ' Z'
}

const CYLINDER_BEND = 0.16

function cylinder(w: number, h: number, sideways: boolean): string {
  if (!sideways) {
    const rx = w / 2
    const ry = h * CYLINDER_BEND
    const cy = ry
    const by = h - ry
    return (
      `M 0 ${round(cy)}` +
      arcTo(rx, cy, rx, ry, Math.PI, Math.PI * 2) +
      ` L ${round(w)} ${round(by)}` +
      arcTo(rx, by, rx, ry, 0, Math.PI) +
      ` L 0 ${round(cy)} Z` +
      ` M ${round(w)} ${round(cy)}` +
      arcTo(rx, cy, rx, ry, 0, Math.PI)
    )
  }
  const rx = w * CYLINDER_BEND
  const ry = h / 2
  const left = rx
  const right = w - rx
  return (
    `M ${round(right)} 0` +
    arcTo(right, ry, rx, ry, -Math.PI / 2, Math.PI / 2) +
    ` L ${round(left)} ${round(h)}` +
    arcTo(left, ry, rx, ry, Math.PI / 2, (Math.PI * 3) / 2) +
    ` L ${round(right)} 0 Z` +
    ` M ${round(left)} 0` +
    arcTo(left, ry, rx, ry, -Math.PI / 2, Math.PI / 2)
  )
}

const unit = (from: Pt, to: Pt): Pt => {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const length = Math.hypot(dx, dy) || 1
  return [dx / length, dy / length]
}

function roundedPolygon(points: Pt[], radius: number): string {
  if (points.length < 3 || radius < 0.5) return polygon(points)
  const corners = points.map((curr, index) => {
    const before = points[(index - 1 + points.length) % points.length]
    const after = points[(index + 1) % points.length]
    const cut = Math.min(
      radius,
      Math.hypot(before[0] - curr[0], before[1] - curr[1]) / 2,
      Math.hypot(after[0] - curr[0], after[1] - curr[1]) / 2
    )
    const entry: Pt = [curr[0] + unit(curr, before)[0] * cut, curr[1] + unit(curr, before)[1] * cut]
    const exit: Pt = [curr[0] + unit(curr, after)[0] * cut, curr[1] + unit(curr, after)[1] * cut]
    return { curr, entry, exit }
  })
  const first = corners[corners.length - 1].exit
  return (
    `M ${round(first[0])} ${round(first[1])}` +
    corners
      .map(({ curr, entry, exit }) =>
        ` L ${round(entry[0])} ${round(entry[1])} Q ${round(curr[0])} ${round(curr[1])} ${round(exit[0])} ${round(exit[1])}`
      )
      .join('') +
    ' Z'
  )
}

const regularNorm = (sides: number, rotation: number): Array<{ x: number; y: number }> =>
  Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * 2 * Math.PI) / sides
    return { x: 0.5 + 0.5 * Math.cos(angle), y: 0.5 + 0.5 * Math.sin(angle) }
  })

const norm = (points: Array<[number, number]>): Array<{ x: number; y: number }> =>
  points.map(([x, y]) => ({ x, y }))

const VERTEX_DEFAULTS: Partial<Record<ShapeName, Array<{ x: number; y: number }>>> = {
  triangle: norm([
    [0.5, 0],
    [1, 1],
    [0, 1]
  ]),
  right_triangle: norm([
    [0, 0],
    [1, 1],
    [0, 1]
  ]),
  diamond: norm([
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5]
  ]),
  pentagon: regularNorm(5, -Math.PI / 2),
  hexagon: regularNorm(6, 0),
  octagon: regularNorm(8, Math.PI / 8),
  parallelogram: norm([
    [0.2, 0],
    [1, 0],
    [0.8, 1],
    [0, 1]
  ]),
  trapezoid: norm([
    [0.25, 0],
    [0.75, 0],
    [1, 1],
    [0, 1]
  ])
}

export function shapeVertices(shape: ShapeName, params: ShapeParams): Array<{ x: number; y: number }> {
  const base = VERTEX_DEFAULTS[shape]
  if (!base) return []
  const custom = params.vertices
  if (!custom || custom.length < 3) return base.map((point) => ({ ...point }))
  return custom.map((point) => ({ x: clamp(point.x, 0, 1), y: clamp(point.y, 0, 1) }))
}

export function isVertexShape(shape: ShapeName): boolean {
  return shape in VERTEX_DEFAULTS
}

export function hasCornerRadius(shape: ShapeName): boolean {
  return isVertexShape(shape) || shape === 'square' || shape === 'round_rectangle'
}

export function cornerRadius(shape: ShapeName, params: ShapeParams): number {
  if (!hasCornerRadius(shape)) return 0
  return clamp(params.adjust ?? ADJUST_DEFAULT[shape] ?? 0, 0, 0.5)
}

export function snapVertexPoint(
  shape: ShapeName,
  index: number,
  point: { x: number; y: number },
  w: number,
  h: number,
  params: ShapeParams,
  tolerance: number
): { x: number; y: number } {
  const others = shapeVertices(shape, params)
    .map((vertex, position) => ({ x: vertex.x * w, y: vertex.y * h }))
    .filter((_, position) => position !== index)
  const nearest = (value: number, list: Array<number>): number => {
    let best = value
    let gap = tolerance + 1
    for (const candidate of list) {
      const distance = Math.abs(value - candidate)
      if (distance < gap) {
        gap = distance
        best = candidate
      }
    }
    return gap <= tolerance ? best : value
  }
  return {
    x: nearest(point.x, [0, w / 2, w, ...others.map((vertex) => vertex.x)]),
    y: nearest(point.y, [0, h / 2, h, ...others.map((vertex) => vertex.y)])
  }
}

const ADJUST_DEFAULT: Partial<Record<ShapeName, number>> = {
  square: 0,
  round_rectangle: 0.16,
  ring: 0.55,
  pie: 0.66,
  star: 0.45,
  moon: 0.45,
  arrow_right: 0.35,
  arrow_left: 0.35,
  arrow_up: 0.35,
  arrow_down: 0.35,
  arrow_double: 0.22,
  arrow_up_down: 0.22,
  arrow_four_way: 0.22,
  arrow_bend: 0.35,
  arrow_bend_flip: 0.35,
  arrow_circular: 0.35
}

const ADJUST2_DEFAULT = 0.5

export function shapeParams(shape: ShapeName): ShapeParams {
  const params: ShapeParams = {}
  if (shape in ADJUST_DEFAULT) params.adjust = ADJUST_DEFAULT[shape]
  if (shape in ARROW_DIR || shape === 'arrow_bend' || shape === 'arrow_bend_flip' || shape === 'arrow_circular')
    params.adjust2 = ADJUST2_DEFAULT
  if (isTailed(shape)) params.tail = { ...TAIL_DEFAULT }
  return params
}

const TAIL_SHAPES: ShapeName[] = ['speech_round', 'speech_oval', 'speech_rect', 'speech_cloud']

function isTailed(shape: ShapeName): boolean {
  return TAIL_SHAPES.includes(shape)
}

export function shapePath(shape: ShapeName, w: number, h: number, params: ShapeParams = {}): string {
  const width = Math.max(1, w)
  const height = Math.max(1, h)
  const adjust = params.adjust ?? ADJUST_DEFAULT[shape]
  const adjust2 = params.adjust2 ?? ADJUST2_DEFAULT
  const tail = params.tail ?? TAIL_DEFAULT
  const vertexBase = VERTEX_DEFAULTS[shape]
  if (vertexBase) {
    const points = shapeVertices(shape, params).map((point): Pt => [point.x * width, point.y * height])
    return roundedPolygon(points, clamp(adjust ?? 0, 0, 0.5) * Math.min(width, height))
  }
  switch (shape) {
    case 'rectangle':
    case 'flowchart_process':
      return box(width, height)
    case 'square':
      return roundedRect(width, height, clamp(adjust ?? 0, 0, 0.5) * Math.min(width, height))
    case 'round_rectangle':
      return roundedRect(width, height, (adjust ?? 0.16) * Math.min(width, height))
    case 'circle':
      return ellipse(width / 2, height / 2, width / 2, height / 2)
    case 'diamond':
    case 'flowchart_decision':
      return polygon([
        [width / 2, 0],
        [width, height / 2],
        [width / 2, height],
        [0, height / 2]
      ])
    case 'hexagon':
    case 'flowchart_preparation':
      return polygon(regular(6, width, height, 0))
    case 'parallelogram':
    case 'flowchart_input_output':
      return polygon([
        [width * 0.2, 0],
        [width, 0],
        [width * 0.8, height],
        [0, height]
      ])
    case 'star':
      return polygon(starPoints(width, height, 5, clamp(adjust ?? 0.45, 0.2, 0.7)))
    case 'star_six':
      return polygon(starPoints(width, height, 6, 0.58))
    case 'star_burst':
      return polygon(starPoints(width, height, 12, 0.76))
    case 'sparkle':
      return sparklePath(width, height)
    case 'heart':
      return heartPath(width, height)
    case 'cloud':
      return cloudPath(width, height)
    case 'moon': {
      const rx = width / 2
      const ry = height / 2
      const shift = rx * clamp(adjust ?? 0.45, 0.1, 0.9) * 1.3
      const hornY = ry * Math.sqrt(Math.max(0, 1 - (shift / (2 * rx)) ** 2))
      const hornX = rx + shift / 2
      return (
        `M ${round(hornX)} ${round(ry - hornY)}` +
        ` A ${round(rx)} ${round(ry)} 0 1 0 ${round(hornX)} ${round(ry + hornY)}` +
        ` A ${round(rx * (0.5 + shift / rx))} ${round(ry)} 0 0 1 ${round(hornX)} ${round(ry - hornY)} Z`
      )
    }
    case 'ring': {
      const hole = clamp(adjust ?? 0.55, 0.1, 0.9)
      return (
        ellipse(width / 2, height / 2, width / 2, height / 2, 1) +
        ' ' +
        ellipse(width / 2, height / 2, (width / 2) * hole, (height / 2) * hole, -1) +
        ' Z'
      )
    }
    case 'pie': {
      const sweep = clamp(adjust ?? 0.66, 0.05, 0.95) * Math.PI * 2
      const from = -Math.PI / 2
      const start: Pt = [width / 2 + (width / 2) * Math.cos(from), height / 2 + (height / 2) * Math.sin(from)]
      return (
        `M ${round(width / 2)} ${round(height / 2)} L ${round(start[0])} ${round(start[1])}` +
        arcTo(width / 2, height / 2, width / 2, height / 2, from, from + sweep) +
        ' Z'
      )
    }
    case 'semicircle':
      return `M 0 ${round(height)} A ${round(width / 2)} ${round(height)} 0 0 1 ${round(width)} ${round(height)} Z`
    case 'quarter_circle':
      return `M 0 ${round(height)} L 0 0 A ${round(width)} ${round(height)} 0 0 1 ${round(width)} ${round(height)} Z`
    case 'arch':
      return `M 0 ${round(height)} V ${round(height / 2)} A ${round(width / 2)} ${round(height / 2)} 0 0 1 ${round(
        width
      )} ${round(height / 2)} V ${round(height)} Z`
    case 'pill': {
      const r = Math.min(width, height) / 2
      return roundedRect(width, height, r)
    }
    case 'drop':
      return (
        `M ${round(width / 2)} 0 ` +
        `C ${round(width * 0.78)} ${round(height * 0.34)} ${round(width)} ${round(height * 0.5)} ${round(width)} ${round(height * 0.62)} ` +
        `A ${round(width / 2)} ${round(height * 0.38)} 0 0 1 0 ${round(height * 0.62)} ` +
        `C 0 ${round(height * 0.5)} ${round(width * 0.22)} ${round(height * 0.34)} ${round(width / 2)} 0 Z`
      )
    case 'lens': {
      const sag = height * 0.3
      const reach = ((width / 2) ** 2 + sag ** 2) / (2 * sag)
      return (
        `M 0 ${round(height / 2)}` +
        ` A ${round(reach)} ${round(reach)} 0 0 1 ${round(width)} ${round(height / 2)}` +
        ` A ${round(reach)} ${round(reach)} 0 0 1 0 ${round(height / 2)} Z`
      )
    }
    case 'leaf':
      return (
        `M ${round(width * 0.06)} ${round(height * 0.94)}` +
        ` C ${round(width * 0.04)} ${round(height * 0.36)} ${round(width * 0.36)} ${round(height * 0.04)} ${round(width * 0.94)} ${round(height * 0.06)}` +
        ` C ${round(width * 0.96)} ${round(height * 0.64)} ${round(width * 0.64)} ${round(height * 0.96)} ${round(width * 0.06)} ${round(height * 0.94)} Z`
      )
    case 'blob':
      return blobPath(width, height)
    case 'shield':
      return (
        `M 0 0 H ${round(width)} V ${round(height * 0.42)} ` +
        `C ${round(width)} ${round(height * 0.72)} ${round(width * 0.78)} ${round(height * 0.9)} ${round(width / 2)} ${round(height)} ` +
        `C ${round(width * 0.22)} ${round(height * 0.9)} 0 ${round(height * 0.72)} 0 ${round(height * 0.42)} Z`
      )
    case 'tag':
      return tagPath(width, height)
    case 'seal':
      return sealPath(width, height)
    case 'lightning':
      return polygon([
        [width * 0.6, 0],
        [width * 0.06, height * 0.54],
        [width * 0.42, height * 0.54],
        [width * 0.3, height],
        [width * 0.94, height * 0.4],
        [width * 0.56, height * 0.4]
      ])
    case 'frame':
      return (
        roundedRect(width, height, Math.min(10, Math.min(width, height) / 5)) +
        ` M ${round(width * 0.22)} ${round(height * 0.22)} V ${round(height * 0.78)} H ${round(width * 0.78)} V ${round(
          height * 0.22
        )} H ${round(width * 0.22)} Z`
      )
    case 'bookmark':
      return polygon([
        [0, 0],
        [width, 0],
        [width, height],
        [width / 2, height * 0.62],
        [0, height]
      ])
    case 'ribbon':
      return polygon([
        [0, 0],
        [width, 0],
        [width * 0.86, height / 2],
        [width, height],
        [0, height],
        [width * 0.14, height / 2]
      ])
    case 'chevron':
      return polygon([
        [0, 0],
        [width * 0.6, 0],
        [width, height / 2],
        [width * 0.6, height],
        [0, height],
        [width * 0.34, height / 2]
      ])
    case 'cross':
      return polygon([
        [width * 0.36, 0],
        [width * 0.64, 0],
        [width * 0.64, height * 0.36],
        [width, height * 0.36],
        [width, height * 0.64],
        [width * 0.64, height * 0.64],
        [width * 0.64, height],
        [width * 0.36, height],
        [width * 0.36, height * 0.64],
        [0, height * 0.64],
        [0, height * 0.36],
        [width * 0.36, height * 0.36]
      ])
    case 'cross_x':
      return crossXPath(width, height)
    case 'arrow_right':
    case 'arrow_left':
    case 'arrow_up':
    case 'arrow_down':
      return blockArrow(
        ARROW_DIR[shape] as 'right' | 'left' | 'up' | 'down',
        width,
        height,
        adjust ?? 0.35,
        adjust2
      )
    case 'arrow_double':
    case 'arrow_up_down':
      return doubleArrow(ARROW_DIR[shape] as 'lr' | 'ud', width, height, adjust ?? 0.22, adjust2)
    case 'arrow_four_way':
      return fourArrow(width, height, adjust ?? 0.22, adjust2)
    case 'arrow_bend':
      return bendArrow(width, height, adjust ?? 0.35, adjust2, false)
    case 'arrow_bend_flip':
      return bendArrow(width, height, adjust ?? 0.35, adjust2, true)
    case 'arrow_circular':
      return circularArrow(width, height, adjust ?? 0.35, adjust2)
    case 'speech_rect': {
      const body = bodyHeight(height, tail)
      const wedge = calloutTail(width, height, tail)
      const left = clamp(wedge.leftX, 0, width)
      const right = clamp(wedge.rightX, 0, width)
      return (
        `M 0 0 H ${round(width)} V ${round(body)} H ${round(right)} L ${round(wedge.tip[0])} ${round(wedge.tip[1])} ` +
        `L ${round(left)} ${round(body)} H 0 Z`
      )
    }
    case 'speech_round': {
      const body = bodyHeight(height, tail)
      const wedge = calloutTail(width, height, tail)
      const left = clamp(wedge.leftX, 0, width)
      const right = clamp(wedge.rightX, 0, width)
      const r = Math.min(18, body / 3, width / 4)
      return (
        `M ${round(r)} 0 H ${round(width - r)} A ${round(r)} ${round(r)} 0 0 1 ${round(width)} ${round(r)} ` +
        `V ${round(body - r)} A ${round(r)} ${round(r)} 0 0 1 ${round(width - r)} ${round(body)} H ${round(right)} ` +
        `L ${round(wedge.tip[0])} ${round(wedge.tip[1])} L ${round(left)} ${round(body)} H ${round(r)} ` +
        `A ${round(r)} ${round(r)} 0 0 1 0 ${round(body - r)} V ${round(r)} A ${round(r)} ${round(r)} 0 0 1 ${round(r)} 0 Z`
      )
    }
    case 'speech_oval': {
      const body = bodyHeight(height, tail)
      const wedge = wedgeOnEllipse(width, height, body, tail)
      return (
        `M ${round(wedge.start[0])} ${round(wedge.start[1])}` +
        arcTo(width / 2, body / 2, width / 2, body / 2, wedge.from, wedge.to) +
        ` L ${round(wedge.tip[0])} ${round(wedge.tip[1])} Z`
      )
    }
    case 'speech_cloud': {
      const body = bodyHeight(height, tail)
      const wedge = calloutTail(width, height, tail)
      const left = clamp(wedge.leftX, 0, width)
      const right = clamp(wedge.rightX, 0, width)
      return (
        cloudPath(width, body) +
        ` M ${round(right)} ${round(body * 0.9)} L ${round(wedge.tip[0])} ${round(wedge.tip[1])} L ${round(left)} ${round(body * 0.9)} Z`
      )
    }
    case 'flowchart_start':
      return roundedRect(width, height, height / 2)
    case 'flowchart_end':
      return polygon([
        [height / 2, 0],
        [width - height / 2, 0],
        [width, height / 2],
        [width - height / 2, height],
        [height / 2, height],
        [0, height / 2]
      ])
    case 'flowchart_document':
      return (
        `M 0 0 H ${round(width)} V ${round(height * 0.72)}` +
        ` C ${round(width * 0.75)} ${round(height * 1.02)} ${round(width * 0.7)} ${round(height * 0.48)} ${round(width * 0.5)} ${round(height * 0.72)}` +
        ` C ${round(width * 0.3)} ${round(height * 0.96)} ${round(width * 0.25)} ${round(height * 0.48)} 0 ${round(height * 0.72)} Z`
      )
    case 'flowchart_database':
      return cylinder(width, height, false)
    case 'flowchart_stored':
      return cylinder(width, height, true)
    case 'flowchart_predefined':
      return (
        box(width, height) +
        stroke([
          [width * 0.12, 0],
          [width * 0.12, height]
        ]) +
        stroke([
          [width * 0.88, 0],
          [width * 0.88, height]
        ])
      )
    case 'flowchart_internal':
      return (
        box(width, height) +
        stroke([
          [0, height * 0.16],
          [width * 0.84, height * 0.16],
          [width * 0.84, height]
        ])
      )
    case 'flowchart_manual_input':
      return polygon([
        [0, height * 0.28],
        [width * 0.28, 0],
        [width, 0],
        [width, height],
        [0, height]
      ])
    case 'flowchart_manual_op':
      return polygon([
        [0, height * 0.34],
        [width, 0],
        [width, height],
        [0, height]
      ])
    case 'flowchart_display':
      return (
        `M 0 0 H ${round(width * 0.72)} L ${round(width)} ${round(height / 2)} L ${round(width * 0.72)} ${round(height)} H 0 Z` +
        stroke([
          [width * 0.18, height],
          [width * 0.18, 0]
        ])
      )
    case 'flowchart_merge':
      return (
        ellipse(width / 2, height / 2, width / 2, height / 2) +
        ' Z' +
        stroke([
          [width * 0.28, height * 0.1],
          [width * 0.5, height * 0.5],
          [width * 0.72, height * 0.1]
        ])
      )
    case 'flowchart_or':
      return (
        ellipse(width / 2, height / 2, width / 2, height / 2) +
        ' Z' +
        stroke([
          [width * 0.2, height * 0.2],
          [width * 0.8, height * 0.8]
        ]) +
        stroke([
          [width * 0.8, height * 0.2],
          [width * 0.2, height * 0.8]
        ])
      )
    case 'flowchart_sum':
      return (
        ellipse(width / 2, height / 2, width / 2, height / 2) +
        ' Z' +
        stroke([
          [width * 0.5, height * 0.14],
          [width * 0.5, height * 0.86]
        ]) +
        stroke([
          [width * 0.14, height * 0.5],
          [width * 0.86, height * 0.5]
        ])
      )
    case 'flowchart_extract':
      return (
        polygon([
          [width / 2, 0],
          [width, height],
          [0, height]
        ]) +
        stroke([
          [width * 0.28, height * 0.18],
          [width * 0.72, height * 0.18]
        ]) +
        stroke([
          [width * 0.38, height * 0.5],
          [width * 0.62, height * 0.5]
        ]) +
        stroke([
          [width * 0.5, height * 0.22],
          [width * 0.5, height * 0.86]
        ])
      )
    case 'flowchart_delay':
      return (
        `M 0 0 H ${round(width * 0.7)}` +
        ` A ${round(width * 0.15)} ${round(height / 2)} 0 0 1 ${round(width * 0.7)} ${round(height)} H 0 Z` +
        ` M 0 ${round(height / 2)} H ${round(width * 0.12)}`
      )
    case 'flowchart_connector':
      return ellipse(width / 2, height / 2, width / 2, height / 2) + ' Z'
    case 'flowchart_offpage':
      return polygon([
        [0, 0],
        [width * 0.78, 0],
        [width, height / 2],
        [width * 0.78, height],
        [0, height]
      ])
    default:
      return box(width, height)
  }
}

export function shapeHandles(shape: ShapeName, w: number, h: number, params: ShapeParams): ShapeHandle[] {
  const adjust = params.adjust ?? ADJUST_DEFAULT[shape] ?? 0.3
  const adjust2 = params.adjust2 ?? ADJUST2_DEFAULT
  const handles: ShapeHandle[] = []
  if (isTailed(shape)) {
    const tail = params.tail ?? TAIL_DEFAULT
    handles.push({
      id: 'tail',
      x: clamp(tail.x, -0.15, 1.15) * w,
      y: clamp(tail.y, 0.62, 1) * h,
      axis: 'xy'
    })
  }
  const dir = ARROW_DIR[shape]
  if (dir === 'right' || dir === 'left' || dir === 'up' || dir === 'down') {
    const vertical = dir === 'up' || dir === 'down'
    const length = vertical ? h : w
    const cross = vertical ? w : h
    const headPoint = toBox(dir, [length - adjust * length, cross / 2 + (cross * adjust2) / 2], w, h)
    const shaftPoint = toBox(dir, [length * 0.25, cross / 2 - (cross * adjust2) / 2], w, h)
    handles.push({ id: 'adjust', x: headPoint[0], y: headPoint[1], axis: vertical ? 'y' : 'x' })
    handles.push({ id: 'adjust2', x: shaftPoint[0], y: shaftPoint[1], axis: vertical ? 'x' : 'y' })
    return handles
  }
  if (dir === 'lr' || dir === 'ud') {
    const length = dir === 'lr' ? w : h
    const cross = dir === 'lr' ? h : w
    const head: Pt = dir === 'lr' ? [adjust * length, cross / 2 + (cross * adjust2) / 2] : [cross / 2 - (cross * adjust2) / 2, adjust * length]
    const shaft: Pt = dir === 'lr' ? [length * 0.5, cross / 2 - (cross * adjust2) / 2] : [cross / 2 - (cross * adjust2) / 2, length * 0.5]
    handles.push({ id: 'adjust', x: head[0], y: head[1], axis: dir === 'lr' ? 'x' : 'y' })
    handles.push({ id: 'adjust2', x: shaft[0], y: shaft[1], axis: dir === 'lr' ? 'y' : 'x' })
    return handles
  }
  if (dir === 'four') {
    handles.push({
      id: 'adjust',
      x: w / 2 + (Math.min(w, h) * adjust2) / 4,
      y: h / 2 - adjust * h,
      axis: 'y'
    })
    return handles
  }
  if (shape === 'arrow_bend' || shape === 'arrow_bend_flip') {
    const half = Math.min(w, h) * adjust2 * 0.16
    const hw = half * 1.9
    handles.push({ id: 'adjust', x: w - hw * 2, y: adjust * h, axis: 'y' })
    handles.push({ id: 'adjust2', x: w * 0.3, y: h - half * 2, axis: 'y' })
    return handles
  }
  if (shape === 'round_rectangle' || shape === 'square') return handles
  const vertexBase = VERTEX_DEFAULTS[shape]
  if (vertexBase) {
    const points = shapeVertices(shape, params)
    points.forEach((point, index) => {
      handles.push({ id: `v${index}`, x: point.x * w, y: point.y * h, axis: 'xy' })
    })
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length]
      handles.push({ id: `add${index}`, x: ((point.x + next.x) * w) / 2, y: ((point.y + next.y) * h) / 2, axis: 'xy' })
    })
    return handles
  }
  if (shape === 'ring') {
    handles.push({ id: 'adjust', x: w / 2 + (w / 2) * clamp(adjust, 0.1, 0.9), y: h / 2, axis: 'x' })
    return handles
  }
  if (shape === 'star') {
    handles.push({ id: 'adjust', x: w / 2, y: h / 2 - (h / 2) * clamp(adjust, 0.2, 0.7), axis: 'y' })
    return handles
  }
  if (shape === 'moon') {
    const shift = (w / 2) * clamp(adjust, 0.1, 0.9) * 1.3
    handles.push({ id: 'adjust', x: w / 2 + shift / 2, y: h / 2, axis: 'x' })
    return handles
  }
  if (shape === 'pie') {
    const sweep = clamp(adjust, 0.05, 0.95) * Math.PI * 2 - Math.PI / 2
    handles.push({ id: 'adjust', x: w / 2 + (w / 2) * Math.cos(sweep), y: h / 2 + (h / 2) * Math.sin(sweep), axis: 'xy' })
  }
  return handles
}

export function shapeHandleValue(
  shape: ShapeName,
  id: string,
  point: { x: number; y: number },
  w: number,
  h: number,
  params: ShapeParams
): ShapeParams {
  const next: ShapeParams = { ...params }
  if (id === 'tail') {
    next.tail = { x: point.x / w, y: clamp(point.y / h, 0.62, 1.4) }
    return next
  }
  const vertex = /^v(\d+)$/.exec(id)
  if (VERTEX_DEFAULTS[shape] && vertex) {
    const list = shapeVertices(shape, params)
    const index = Number(vertex[1])
    if (list[index]) {
      list[index] = { x: round(point.x / w), y: round(point.y / h) }
      next.vertices = list
    }
    return next
  }
  const dir = ARROW_DIR[shape]
  if (dir === 'right' || dir === 'left' || dir === 'up' || dir === 'down') {
    const local = fromBox(dir, [point.x, point.y], w, h)
    const vertical = dir === 'up' || dir === 'down'
    const length = vertical ? h : w
    const cross = vertical ? w : h
    if (id === 'adjust') next.adjust = clamp((length - local[0]) / length, 0.12, 0.6)
    else next.adjust2 = clamp(Math.abs(cross / 2 - local[1]) * 2 / cross, 0.16, 0.94)
    return next
  }
  if (dir === 'lr' || dir === 'ud') {
    const length = dir === 'lr' ? w : h
    const cross = dir === 'lr' ? h : w
    const along = dir === 'lr' ? point.x : point.y
    const across = dir === 'lr' ? point.y : point.x
    if (id === 'adjust') next.adjust = clamp(Math.min(along, length - along) / length, 0.08, 0.42)
    else next.adjust2 = clamp(Math.abs(cross / 2 - across) * 2 / cross, 0.16, 0.94)
    return next
  }
  if (dir === 'four') {
    next.adjust = clamp((h / 2 - point.y) / h, 0.08, 0.42)
    return next
  }
  if (shape === 'arrow_bend' || shape === 'arrow_bend_flip') {
    if (id === 'adjust') next.adjust = clamp(point.y / h, 0.12, 0.6)
    else next.adjust2 = clamp((h - point.y) / Math.min(w, h) / 0.32, 0.2, 0.9)
    return next
  }
  if (shape === 'round_rectangle') {
    next.adjust = clamp(Math.min(point.x, point.y) / Math.min(w, h), 0, 0.5)
    return next
  }
  if (shape === 'ring') {
    next.adjust = clamp((point.x - w / 2) / (w / 2), 0.1, 0.9)
    return next
  }
  if (shape === 'star') {
    next.adjust = clamp((h / 2 - point.y) / (h / 2), 0.2, 0.7)
    return next
  }
  if (shape === 'moon') {
    next.adjust = clamp(((point.x - w / 2) * 2) / ((w / 2) * 1.3), 0.1, 0.9)
    return next
  }
  if (shape === 'pie') {
    const angle = Math.atan2(point.y - h / 2, point.x - w / 2) + Math.PI / 2
    next.adjust = clamp((angle < 0 ? angle + Math.PI * 2 : angle) / (Math.PI * 2), 0.05, 0.95)
  }
  return next
}

export const SHAPE_LABELS: Record<ShapeName, string> = {
  rectangle: 'Прямоугольник',
  round_rectangle: 'Скруглённый прямоугольник',
  square: 'Квадрат',
  circle: 'Эллипс',
  semicircle: 'Полукруг',
  quarter_circle: 'Четверть круга',
  arch: 'Арка',
  heart: 'Сердце',
  drop: 'Капля',
  moon: 'Полумесяц',
  ring: 'Кольцо',
  lens: 'Линза',
  pill: 'Капсула',
  leaf: 'Лист',
  triangle: 'Равнобедренный треугольник',
  right_triangle: 'Прямоугольный треугольник',
  diamond: 'Ромб',
  pentagon: 'Пятиугольник',
  hexagon: 'Шестиугольник',
  octagon: 'Восьмиугольник',
  trapezoid: 'Трапеция',
  parallelogram: 'Параллелограмм',
  star: 'Звезда',
  star_six: 'Шестиконечная звезда',
  sparkle: 'Искра',
  star_burst: 'Взрыв',
  pie: 'Сектор',
  cross: 'Плюс',
  cross_x: 'Крест',
  shield: 'Щит',
  tag: 'Ярлык',
  seal: 'Печать',
  lightning: 'Молния',
  frame: 'Рамка',
  cloud: 'Облако',
  blob: 'Клякса',
  speech_round: 'Скруглённая выноска',
  speech_oval: 'Овальная выноска',
  speech_rect: 'Прямоугольная выноска',
  speech_cloud: 'Выноска-облако',
  bookmark: 'Закладка',
  ribbon: 'Лента',
  chevron: 'Шеврон',
  arrow_right: 'Стрелка вправо',
  arrow_left: 'Стрелка влево',
  arrow_up: 'Стрелка вверх',
  arrow_down: 'Стрелка вниз',
  arrow_double: 'Стрелка в обе стороны',
  arrow_up_down: 'Стрелка вверх-вниз',
  arrow_four_way: 'Стрелка в четыре стороны',
  arrow_bend: 'Изогнутая стрелка',
  arrow_bend_flip: 'Изогнутая стрелка наоборот',
  arrow_circular: 'Круговая стрелка',
  flowchart_start: 'Терминатор',
  flowchart_end: 'Финал',
  flowchart_process: 'Процесс',
  flowchart_decision: 'Решение',
  flowchart_input_output: 'Данные',
  flowchart_document: 'Документ',
  flowchart_database: 'Хранилище данных',
  flowchart_stored: 'Записанные данные',
  flowchart_predefined: 'Предопределённый процесс',
  flowchart_internal: 'Внутренний ресурс',
  flowchart_manual_input: 'Ручной ввод',
  flowchart_manual_op: 'Ручная операция',
  flowchart_display: 'Отображение',
  flowchart_merge: 'Слияние',
  flowchart_or: 'Или',
  flowchart_sum: 'Суммирование',
  flowchart_extract: 'Извлечение',
  flowchart_delay: 'Задержка',
  flowchart_connector: 'Соединитель',
  flowchart_offpage: 'Переход',
  flowchart_preparation: 'Подготовка',
  unknown: 'Фигура'
}

export const SHAPE_GROUPS: Array<{ title: string; items: ShapeName[] }> = [
  {
    title: 'Основные',
    items: [
      'round_rectangle',
      'square',
      'circle',
      'triangle',
      'right_triangle',
      'diamond',
      'pentagon',
      'hexagon',
      'octagon',
      'parallelogram',
      'trapezoid'
    ]
  }
]

export const ROUND_SHAPES: ShapeName[] = [
  'circle',
  'ring',
  'moon',
  'cloud',
  'heart',
  'speech_round',
  'speech_oval',
  'speech_cloud',
  'flowchart_start',
  'flowchart_document',
  'flowchart_database',
  'flowchart_stored',
  'flowchart_connector',
  'flowchart_merge',
  'flowchart_or',
  'flowchart_sum',
  'flowchart_delay'
]

export function isRoundShape(shape: ShapeName): boolean {
  return ROUND_SHAPES.includes(shape)
}

export function strokeDash(style: 'normal' | 'dotted' | 'dashed'): string | undefined {
  if (style === 'dashed') return '10 8'
  if (style === 'dotted') return '1 7'
  return undefined
}
