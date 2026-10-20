export interface CurvePoint {
  x: number
  y: number
}

const round = (value: number): string => value.toFixed(1)

export function curvePath(points: CurvePoint[]): string {
  const count = points.length
  if (count === 0) return ''
  if (count === 1) return `M ${round(points[0].x)} ${round(points[0].y)}`
  if (count === 2) return `M ${round(points[0].x)} ${round(points[0].y)} L ${round(points[1].x)} ${round(points[1].y)}`
  const first = points[0]
  const second = points[1]
  let path = `M ${round((first.x + second.x) / 2)} ${round((first.y + second.y) / 2)}`
  for (let index = 1; index < count - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    path += ` Q ${round(point.x)} ${round(point.y)} ${round((point.x + next.x) / 2)} ${round((point.y + next.y) / 2)}`
  }
  const last = points[count - 1]
  path += ` L ${round(last.x)} ${round(last.y)}`
  return path
}