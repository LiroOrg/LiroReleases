import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { GraphItem } from '@shared/types'
import { compileFormula, sampleCurve } from '@shared/graph'

export interface GraphViewProps {
  item: GraphItem
}

function formatTick(value: number): string {
  if (Math.abs(value) < 1e-9) return '0'
  return String(Math.round(value * 1000) / 1000)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0, Math.min(1, value))
}

interface Point {
  x: number
  y: number
}

function curveSegments(
  fn: (x: number) => number,
  xFrom: number,
  xTo: number,
  toX: (x: number) => number,
  toY: (y: number) => number,
  width: number,
  height: number
): string[][] {
  const samples = Math.min(8000, Math.max(1200, Math.round(width * 3)))
  const raw = sampleCurve(fn, xFrom, xTo, samples)
  const segments: string[][] = []
  let current: string[] = []
  const jumpLimit = Math.max(60, height * 2)
  const flush = (): void => {
    if (current.length >= 2) segments.push(current)
    current = []
  }
  for (let index = 1; index < raw.length; index += 1) {
    const a = raw[index - 1]
    const b = raw[index]
    if (!Number.isFinite(a.y) || !Number.isFinite(b.y)) {
      flush()
      continue
    }
    const ax = toX(a.x)
    const ay = toY(a.y)
    const bx = toX(b.x)
    const by = toY(b.y)
    if (current.length === 0) current.push(`${ax.toFixed(2)},${ay.toFixed(2)}`)
    if (Math.abs(by - ay) > jumpLimit) {
      flush()
      current.push(`${bx.toFixed(2)},${by.toFixed(2)}`)
      continue
    }
    current.push(`${bx.toFixed(2)},${by.toFixed(2)}`)
  }
  flush()
  return segments
}

export const GraphView = memo(function GraphView(props: GraphViewProps): ReactNode {
  const { item } = props
  const width = Math.max(1, item.w)
  const height = Math.max(1, item.h)
  const radius = Math.max(0, Math.min(20, Math.round(Math.min(width, height) * 0.03)))
  const step = item.gridStep > 0 ? item.gridStep : 1
  const originX = clamp01(item.originX)
  const originY = clamp01(item.originY)
  const toX = (x: number): number => originX * width + x * item.scale
  const toY = (y: number): number => (1 - originY) * height - y * item.scale
  const xFrom = (-originX * width) / item.scale
  const xTo = ((1 - originX) * width) / item.scale
  const yTop = -((1 - originY) * height) / item.scale
  const yBottom = (originY * height) / item.scale
  const tick = Math.max(9, Math.min(15, Math.round(Math.min(width, height) / 44)))
  const axisFont = Math.max(11, Math.min(18, Math.round(Math.min(width, height) / 30)))
  const clipId = `gclip-${item.id}`
  const axisX = toX(0)
  const axisY = toY(0)

  const curves = useMemo(
    () =>
      item.expressions
        .filter((expression) => expression.visible && expression.formula.trim())
        .map((expression) => {
          const fn = compileFormula(expression.formula)
          const segments = fn ? curveSegments(fn, xFrom, xTo, toX, toY, width, height) : []
          return { id: expression.id, segments, color: expression.color, lineWidth: expression.lineWidth }
        }),
    [item.expressions, item.scale, originX, originY, width, height, xFrom, xTo]
  )

  const stepPx = Math.max(1, step * item.scale)
  const drawEvery = Math.max(1, Math.ceil(8 / stepPx))
  const grid = useMemo(() => {
    const verticals: number[] = []
    const horizontals: number[] = []
    const limit = Math.ceil(Math.max(width, height) / stepPx) + 2
    for (let index = drawEvery; index <= limit; index += drawEvery) {
      const offset = index * stepPx
      if (offset <= width) verticals.push(originX * width + offset)
      if (originX * width - offset >= 0) verticals.push(originX * width - offset)
      if (offset <= height) horizontals.push((1 - originY) * height + offset)
      if ((1 - originY) * height - offset >= 0) horizontals.push((1 - originY) * height - offset)
    }
    return { verticals, horizontals }
  }, [stepPx, drawEvery, originX, originY, width, height])

  const labels = useMemo(() => {
    const out: Array<{ x: number; y: number; text: string; anchor: 'middle' | 'end' }> = []
    if (!item.showLabels) return out
    const count = Math.ceil(Math.max(width, height) / stepPx) + 2
    for (let index = drawEvery; index <= count; index += drawEvery) {
      const value = index * step
      const right = toX(value)
      if (right > tick * 2 && right < width - tick) {
        out.push({ x: right, y: axisY + tick + 3, text: formatTick(value), anchor: 'middle' })
      }
      const left = toX(-value)
      if (left > tick * 2 && left < width - tick) {
        out.push({ x: left, y: axisY + tick + 3, text: formatTick(-value), anchor: 'middle' })
      }
      const top = toY(value)
      if (top > tick && top < height - 4) {
        out.push({ x: axisX - 6, y: top + tick * 0.35, text: formatTick(value), anchor: 'end' })
      }
      const bottom = toY(-value)
      if (bottom > tick && bottom < height - 4) {
        out.push({ x: axisX - 6, y: bottom + tick * 0.35, text: formatTick(-value), anchor: 'end' })
      }
    }
    return out
  }, [item.showLabels, step, stepPx, drawEvery, item.scale, originX, originY, width, height, axisX, axisY, tick])

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="geometricPrecision"
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={0} width={width} height={height} rx={radius} ry={radius} />
        </clipPath>
      </defs>
      <rect x={0} y={0} width={width} height={height} rx={radius} ry={radius} fill="#ffffff" />
      <g clipPath={`url(#${clipId})`}>
        {item.showGrid
          ? grid.verticals.map((x, index) => (
              <line
                key={`v${index}`}
                x1={x}
                y1={0}
                x2={x}
                y2={height}
                stroke={item.axisColor}
                strokeWidth={0.5}
                opacity={0.16}
              />
            ))
          : null}
        {item.showGrid
          ? grid.horizontals.map((y, index) => (
              <line
                key={`h${index}`}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke={item.axisColor}
                strokeWidth={0.5}
                opacity={0.16}
              />
            ))
          : null}
        <line x1={0} y1={axisY} x2={width} y2={axisY} stroke={item.axisColor} strokeWidth={item.lineWidth} />
        <line x1={axisX} y1={0} x2={axisX} y2={height} stroke={item.axisColor} strokeWidth={item.lineWidth} />
        {axisX > 2 && axisX < width - 2 && axisY > 2 && axisY < height - 2 ? (
          <>
            <path
              d={`M ${width - 3} ${axisY} L ${width - 11} ${axisY - 4} L ${width - 11} ${axisY + 4} Z`}
              fill={item.axisColor}
            />
            <path d={`M ${axisX} 3 L ${axisX - 4} 11 L ${axisX + 4} 11 Z`} fill={item.axisColor} />
          </>
        ) : null}
        {labels.map((label, index) => (
          <text
            key={`l${index}`}
            x={label.x}
            y={label.y}
            fontSize={tick}
            fontFamily="var(--font)"
            fill={item.axisColor}
            opacity={0.55}
            textAnchor={label.anchor}
          >
            {label.text}
          </text>
        ))}
        {curves.flatMap((curve) =>
          curve.segments.map((points, index) => (
            <polyline
              key={`${curve.id}-${index}`}
              points={points.join(' ')}
              fill="none"
              stroke={curve.color}
              strokeWidth={curve.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))
        )}
      </g>
      <rect
        x={item.lineWidth / 2}
        y={item.lineWidth / 2}
        width={Math.max(0, width - item.lineWidth)}
        height={Math.max(0, height - item.lineWidth)}
        rx={radius}
        ry={radius}
        fill="none"
        stroke={item.axisColor}
        strokeWidth={item.lineWidth}
      />
      <text x={width - tick - 2} y={axisY - 7} fontSize={axisFont} fontFamily="var(--font)" fill={item.axisColor} opacity={0.7}>
        x
      </text>
      <text x={axisX + 8} y={axisFont + 4} fontSize={axisFont} fontFamily="var(--font)" fill={item.axisColor} opacity={0.7}>
        y
      </text>
    </svg>
  )
})