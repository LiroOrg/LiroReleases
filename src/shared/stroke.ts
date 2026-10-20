export interface StrokePoint {
  x: number
  y: number
}

const round = (value: number): string => value.toFixed(1)

export function smoothStroke(points: StrokePoint[], strength: number): StrokePoint[] {
  if (points.length < 3 || strength <= 0) return points
  const out: StrokePoint[] = [points[0]]
  let current = { ...points[0] }
  for (let index = 1; index < points.length; index += 1) {
    const raw = points[index]
    current = {
      x: current.x + (raw.x - current.x) * (1 - strength),
      y: current.y + (raw.y - current.y) * (1 - strength)
    }
    out.push(current)
  }
  return out
}

export function strokeLengths(points: StrokePoint[]): number[] {
  const lengths: number[] = [0]
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y)
    lengths.push(total)
  }
  return lengths
}

export interface TimedPoint {
  x: number
  y: number
  t?: number
}

export function resampleTimed(points: TimedPoint[], spacing: number): TimedPoint[] {
  if (points.length < 2 || spacing <= 0) return points.map((point) => ({ ...point }))
  const out: TimedPoint[] = [{ ...points[0] }]
  let carry = 0
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const distance = Math.hypot(to.x - from.x, to.y - from.y)
    if (distance < 1e-6) continue
    const fromTime = from.t ?? 0
    const toTime = to.t ?? fromTime
    let travelled = carry
    while (travelled + spacing <= distance) {
      travelled += spacing
      const ratio = travelled / distance
      out.push({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
        t: fromTime + (toTime - fromTime) * ratio
      })
    }
    carry = travelled - distance
  }
  const last = points[points.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > spacing * 0.4) out.push({ ...last })
  return out
}

export function smoothCentered(points: TimedPoint[], passes = 2): TimedPoint[] {
  let current = points
  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) break
    const next: TimedPoint[] = [current[0]]
    for (let index = 1; index < current.length - 1; index += 1) {
      const left = current[index - 1]
      const middle = current[index]
      const right = current[index + 1]
      next.push({
        x: (left.x + 2 * middle.x + right.x) / 4,
        y: (left.y + 2 * middle.y + right.y) / 4,
        t: middle.t
      })
    }
    next.push(current[current.length - 1])
    current = next
  }
  return current
}

export function straightStroke(from: StrokePoint, to: StrokePoint): StrokePoint[] {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (length < 1e-6) return [{ ...from }, { ...to }]
  let angle = Math.atan2(dy, dx)
  const step = Math.PI / 2
  const nearest = Math.round(angle / step) * step
  if (Math.abs(angle - nearest) <= Math.PI / 36) angle = nearest
  return [{ ...from }, { x: from.x + Math.cos(angle) * length, y: from.y + Math.sin(angle) * length }]
}

export interface StrokeGeometry {
  points: StrokePoint[]
}

export function buildStroke(raw: TimedPoint[], options: { width: number; marker: boolean }): StrokeGeometry {
  if (raw.length === 0) return { points: [] }
  const smoothed = smoothCentered(resampleTimed(raw, 2), 2)
  return { points: smoothed.map((point) => ({ x: point.x, y: point.y })) }
}

export function strokeOutlinePath(points: StrokePoint[], widths: number[], base: number): string {
  const count = points.length
  if (count < 2) return ''
  const left: StrokePoint[] = []
  const right: StrokePoint[] = []
  for (let index = 0; index < count; index += 1) {
    const previous = points[Math.max(0, index - 1)]
    const next = points[Math.min(count - 1, index + 1)]
    let dx = next.x - previous.x
    let dy = next.y - previous.y
    const length = Math.hypot(dx, dy)
    if (length < 1e-6) {
      dx = 1
      dy = 0
    } else {
      dx /= length
      dy /= length
    }
    const half = Math.max(0.3, (base * (widths[index] ?? 1)) / 2)
    left.push({ x: points[index].x - dy * half, y: points[index].y + dx * half })
    right.push({ x: points[index].x + dy * half, y: points[index].y - dx * half })
  }
  const startWidth = Math.max(0.3, (base * (widths[0] ?? 1)) / 2)
  const endWidth = Math.max(0.3, (base * (widths[count - 1] ?? 1)) / 2)
  const parts: string[] = [`M ${round(left[0].x)} ${round(left[0].y)}`]
  for (let index = 1; index < count; index += 1) parts.push(`L ${round(left[index].x)} ${round(left[index].y)}`)
  parts.push(`A ${round(endWidth)} ${round(endWidth)} 0 0 1 ${round(right[count - 1].x)} ${round(right[count - 1].y)}`)
  for (let index = count - 2; index >= 0; index -= 1) parts.push(`L ${round(right[index].x)} ${round(right[index].y)}`)
  parts.push(`A ${round(startWidth)} ${round(startWidth)} 0 0 1 ${round(left[0].x)} ${round(left[0].y)}`)
  parts.push('Z')
  return parts.join(' ')
}

export function distanceToStroke(point: StrokePoint, points: StrokePoint[]): number {
  if (points.length === 0) return Infinity
  if (points.length === 1) return Math.hypot(point.x - points[0].x, point.y - points[0].y)
  let best = Infinity
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    let ratio = 0
    if (lengthSquared > 1e-9) {
      ratio = ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared
      ratio = Math.max(0, Math.min(1, ratio))
    }
    const x = from.x + dx * ratio
    const y = from.y + dy * ratio
    const distance = Math.hypot(point.x - x, point.y - y)
    if (distance < best) best = distance
  }
  return best
}
