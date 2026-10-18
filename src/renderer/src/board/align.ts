import type { Rect } from '@shared/types'

export type AlignMode =
  | 'left'
  | 'hcenter'
  | 'right'
  | 'top'
  | 'vcenter'
  | 'bottom'
  | 'distribute-h'
  | 'distribute-v'

export interface Placed extends Rect {
  id: string
}

export function unionBox(boxes: Rect[]): Rect {
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 }
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  let bottom = -Infinity
  for (const box of boxes) {
    left = Math.min(left, box.x)
    right = Math.max(right, box.x + box.width)
    top = Math.min(top, box.y)
    bottom = Math.max(bottom, box.y + box.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function alignDelta(boxes: Placed[], mode: AlignMode): Map<string, { dx: number; dy: number }> {
  const out = new Map<string, { dx: number; dy: number }>()
  if (!boxes.length) return out
  const total = unionBox(boxes)
  if (mode === 'distribute-h' || mode === 'distribute-v') {
    if (boxes.length < 3) return out
    const horizontal = mode === 'distribute-h'
    const sorted = [...boxes].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
    const sum = sorted.reduce((acc, box) => acc + (horizontal ? box.width : box.height), 0)
    const span = horizontal ? total.width : total.height
    const gap = (span - sum) / (sorted.length - 1)
    let cursor = horizontal ? total.x : total.y
    for (const box of sorted) {
      const delta = cursor - (horizontal ? box.x : box.y)
      if (Math.abs(delta) > 0.5) out.set(box.id, horizontal ? { dx: delta, dy: 0 } : { dx: 0, dy: delta })
      cursor += (horizontal ? box.width : box.height) + gap
    }
    return out
  }
  for (const box of boxes) {
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = total.x - box.x
    else if (mode === 'right') dx = total.x + total.width - (box.x + box.width)
    else if (mode === 'hcenter') dx = total.x + total.width / 2 - (box.x + box.width / 2)
    else if (mode === 'top') dy = total.y - box.y
    else if (mode === 'bottom') dy = total.y + total.height - (box.y + box.height)
    else if (mode === 'vcenter') dy = total.y + total.height / 2 - (box.y + box.height / 2)
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) out.set(box.id, { dx, dy })
  }
  return out
}

export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
}

interface Candidate {
  delta: number
  at: number
  from: number
  to: number
  cost: number
}

function better(current: Candidate | null, next: Candidate): boolean {
  return !current || next.cost < current.cost
}

export function snapBox(box: Rect, others: Placed[], threshold: number): SnapResult {
  if (!others.length || threshold <= 0) return { dx: 0, dy: 0, guides: [] }
  const boxCenterX = box.x + box.width / 2
  const boxCenterY = box.y + box.height / 2
  const boxRight = box.x + box.width
  const boxBottom = box.y + box.height
  let bestX: Candidate | null = null
  let bestY: Candidate | null = null

  for (const other of others) {
    const otherRight = other.x + other.width
    const otherBottom = other.y + other.height
    const nearX = Math.abs(other.x - boxRight) <= threshold || Math.abs(box.x - otherRight) <= threshold
    const nearY = Math.abs(other.y - boxBottom) <= threshold || Math.abs(box.y - otherBottom) <= threshold
    const spanX = Math.min(other.y, box.y)
    const spanXEnd = Math.max(otherBottom, boxBottom)
    const spanY = Math.min(other.x, box.x)
    const spanYEnd = Math.max(otherRight, boxRight)
    const targetsX: Array<[number, number]> = [
      [other.x - box.x, other.x],
      [other.x + other.width / 2 - boxCenterX, other.x + other.width / 2],
      [otherRight - boxRight, otherRight]
    ]
    const targetsY: Array<[number, number]> = [
      [other.y - box.y, other.y],
      [other.y + other.height / 2 - boxCenterY, other.y + other.height / 2],
      [otherBottom - boxBottom, otherBottom]
    ]
    for (const [delta, at] of targetsX) {
      if (Math.abs(delta) > threshold) continue
      const cost = Math.abs(delta) + (nearX ? -threshold * 0.9 : 0)
      const candidate: Candidate = { delta, at, from: spanX - 24, to: spanXEnd + 24, cost }
      if (better(bestX, candidate)) bestX = candidate
    }
    for (const [delta, at] of targetsY) {
      if (Math.abs(delta) > threshold) continue
      const cost = Math.abs(delta) + (nearY ? -threshold * 0.9 : 0)
      const candidate: Candidate = { delta, at, from: spanY - 24, to: spanYEnd + 24, cost }
      if (better(bestY, candidate)) bestY = candidate
    }
  }

  const guides: Guide[] = []
  let dx = 0
  let dy = 0
  if (bestX) {
    dx = bestX.delta
    guides.push({ axis: 'x', at: bestX.at, from: bestX.from, to: bestX.to })
  }
  if (bestY) {
    dy = bestY.delta
    guides.push({ axis: 'y', at: bestY.at, from: bestY.from, to: bestY.to })
  }
  return { dx, dy, guides }
}

export function evenSpacing(boxes: Placed[], axis: 'x' | 'y'): number {
  if (boxes.length < 3) return 0
  const sorted = [...boxes].sort((a, b) => (axis === 'x' ? a.x - b.x : a.y - b.y))
  const gaps: number[] = []
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]
    gaps.push((axis === 'x' ? current.x - (previous.x + previous.width) : current.y - (previous.y + previous.height)))
  }
  const total = gaps.reduce((sum, value) => sum + value, 0)
  return total / gaps.length
}