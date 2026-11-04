import { memo, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { GraphItem } from '@shared/types'
import { compileFormula, curveSegments } from '@shared/graph'

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

export const GraphView = memo(function GraphView(props: GraphViewProps): ReactNode {
  const { item } = props
  const width = Math.max(1, item.w)
  const height = Math.max(1, item.h)
  const radius = Math.max(0, Math.min(16, Math.round(Math.min(width, height) * 0.03)))
  const step = item.gridStep > 0 ? item.gridStep : 1
  const originX = clamp01(item.originX)
  const originY = clamp01(item.originY)
  const toX = (x: number): number => originX * width + x * item.scale
  const toY = (y: number): number => (1 - originY) * height - y * item.scale
  const xFrom = (-originX * width) / item.scale
  const xTo = ((1 - originX) * width) / item.scale
  const tick = Math.max(9, Math.min(15, Math.round(Math.min(width, height) / 44)))
  const axisFont = Math.max(11, Math.min(18, Math.round(Math.min(width, height) / 30)))
  const axisX = toX(0)
  const axisY = toY(0)

  const curves = useMemo(
    () =>
      item.expressions
        .filter((expression) => expression.visible && expression.formula.trim())
        .map((expression) => {
          const fn = compileFormula(expression.formula)
          const segments = fn ? curveSegments(fn, xFrom, xTo, toX, toY, width, height) : []
          const d = segments.map((points) => `M${points.join('L')}`).join('')
          return { id: expression.id, fn, d, color: expression.color, lineWidth: expression.lineWidth }
        }),
    [item.expressions, item.scale, originX, originY, width, height, xFrom, xTo]
  )

  const intersections = useMemo(() => {
    const active = curves.filter((curve) => curve.fn)
    if (active.length < 2) return [] as Array<{ x: number; y: number; px: number; py: number; colors: string[] }>
    const count = Math.max(240, Math.min(900, Math.round(width)))
    const span = xTo - xFrom
    if (!Number.isFinite(span) || span === 0) return []
    const values = active.map((curve) => {
      const out = new Array<number>(count + 1)
      for (let index = 0; index <= count; index += 1) {
        const x = xFrom + (span * index) / count
        const y = curve.fn ? curve.fn(x) : Number.NaN
        out[index] = Number.isFinite(y) ? y : Number.NaN
      }
      return out
    })
    const found: Array<{ x: number; y: number; px: number; py: number; colors: string[] }> = []
    for (let i = 0; i < active.length; i += 1) {
      for (let j = i + 1; j < active.length; j += 1) {
        for (let k = 1; k <= count; k += 1) {
          const a0 = values[i][k - 1]
          const a1 = values[i][k]
          const b0 = values[j][k - 1]
          const b1 = values[j][k]
          if (!Number.isFinite(a0) || !Number.isFinite(a1) || !Number.isFinite(b0) || !Number.isFinite(b1)) continue
          const d0 = a0 - b0
          const d1 = a1 - b1
          if (d0 === d1) continue
          if (d0 === 0 || d0 * d1 < 0) {
            const t = d0 === 0 ? 0 : d0 / (d0 - d1)
            if (t < 0 || t > 1) continue
            const x0 = xFrom + (span * (k - 1)) / count
            const x1 = xFrom + (span * k) / count
            const x = x0 + (x1 - x0) * t
            const y = a0 + (a1 - a0) * t
            const px = toX(x)
            const py = toY(y)
            if (px < -20 || px > width + 20 || py < -20 || py > height + 20) continue
            const existing = found.find((entry) => Math.hypot(entry.px - px, entry.py - py) < 6)
            if (existing) {
              if (!existing.colors.includes(active[i].color)) existing.colors.push(active[i].color)
              if (!existing.colors.includes(active[j].color)) existing.colors.push(active[j].color)
            } else {
              found.push({ x, y, px, py, colors: [active[i].color, active[j].color] })
            }
          }
        }
      }
    }
    return found
  }, [curves, width, height, xFrom, xTo, item.scale, originX, originY])

  const [hover, setHover] = useState<{ px: number; py: number; x: number; y: number; colors: string[] } | null>(null)

  const magnet = (value: number): number => {
    const rounded = Math.round(value * 10) / 10
    return Math.abs(value - rounded) <= 0.035 ? rounded : value
  }

  const onHoverMove = (event: ReactPointerEvent<SVGSVGElement>): void => {
    const target = event.currentTarget
    const rect = target.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = ((event.clientX - rect.left) * width) / rect.width
    const py = ((event.clientY - rect.top) * height) / rect.height
    const gx = (px - originX * width) / item.scale

    let best: { px: number; py: number; x: number; y: number; colors: string[] } | null = null
    let bestDistance = 14

    for (const curve of curves) {
      if (!curve.fn) continue
      const value = curve.fn(gx)
      if (!Number.isFinite(value)) continue
      const sy = toY(value)
      const distance = Math.abs(sy - py)
      if (distance <= bestDistance) {
        bestDistance = distance
        best = { px, py: sy, x: magnet(gx), y: magnet(value), colors: [curve.color] }
      }
    }

    for (const point of intersections) {
      const distance = Math.hypot(point.px - px, point.py - py)
      if (distance <= 12 && (!best || distance <= bestDistance + 2)) {
        bestDistance = distance
        best = { px: point.px, py: point.py, x: magnet(point.x), y: magnet(point.y), colors: point.colors }
      }
    }

    if (!best) {
      setHover(null)
      return
    }
    setHover(best)
  }

  const onHoverLeave = (): void => setHover(null)

  const hoverLabel = hover ? `${formatTick(hover.x)}; ${formatTick(hover.y)}` : ''
  const hoverFontSize = tick
  const hoverTextWidth = hoverLabel.length * hoverFontSize * 0.64 + 12
  const hoverBox =
    hover === null
      ? null
      : (() => {
          const boxHeight = hoverFontSize + 8
          const boxWidth = Math.max(hoverTextWidth, 34)
          const left = Math.max(1, Math.min(width - boxWidth - 1, hover.px + 10))
          const above = hover.py > boxHeight + 6
          const top = above ? hover.py - boxHeight - 6 : hover.py + 10
          return { left: Math.max(1, left), top: Math.max(1, Math.min(height - boxHeight - 1, top)), boxWidth, boxHeight }
        })()
  const hoverFillId = hover && hover.colors.length > 1 ? `graph-hover-${item.id}` : null
  const hoverFill = hover ? (hoverFillId ? `url(#${hoverFillId})` : hover.colors[0]) : undefined

  const stepPx = Math.max(1, step * item.scale)
  const drawEvery = Math.max(1, Math.ceil(8 / stepPx))
  const grid = useMemo(() => {
    let d = ''
    const limit = Math.ceil(Math.max(width, height) / stepPx) + 2
    for (let index = drawEvery; index <= limit; index += drawEvery) {
      const offset = index * stepPx
      if (offset <= width) d += `M${(originX * width + offset).toFixed(1)} 0V${height}`
      if (originX * width - offset >= 0) d += `M${(originX * width - offset).toFixed(1)} 0V${height}`
      if (offset <= height) d += `M0 ${((1 - originY) * height + offset).toFixed(1)}H${width}`
      if ((1 - originY) * height - offset >= 0) d += `M0 ${((1 - originY) * height - offset).toFixed(1)}H${width}`
    }
    return d
  }, [stepPx, drawEvery, originX, originY, width, height])

  const labels = useMemo(() => {
    const out: Array<{ x: number; y: number; text: string; anchor: 'middle' | 'end' }> = []
    if (!item.showLabels) return out
    const minGap = Math.max(46, tick * 3.4)
    const alongX: Array<{ px: number; text: string }> = []
    const alongY: Array<{ px: number; text: string }> = []
    const count = Math.ceil(Math.max(width, height) / stepPx) + 2
    for (let index = drawEvery; index <= count; index += drawEvery) {
      const value = index * step
      alongX.push({ px: toX(value), text: formatTick(value) })
      alongX.push({ px: toX(-value), text: formatTick(-value) })
      alongY.push({ px: toY(value), text: formatTick(value) })
      alongY.push({ px: toY(-value), text: formatTick(-value) })
    }
    let lastX = Number.NEGATIVE_INFINITY
    for (const entry of alongX.sort((a, b) => a.px - b.px)) {
      if (entry.px < tick * 2 || entry.px > width - tick) continue
      if (entry.px - lastX < minGap) continue
      lastX = entry.px
      out.push({ x: entry.px, y: axisY + tick + 3, text: entry.text, anchor: 'middle' })
    }
    let lastY = Number.NEGATIVE_INFINITY
    for (const entry of alongY.sort((a, b) => a.px - b.px)) {
      if (entry.px < tick || entry.px > height - 4) continue
      if (entry.px - lastY < minGap) continue
      lastY = entry.px
      out.push({ x: axisX - 6, y: entry.px + tick * 0.35, text: entry.text, anchor: 'end' })
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
      onPointerMove={onHoverMove}
      onPointerLeave={onHoverLeave}
    >
      <rect x={0} y={0} width={width} height={height} rx={radius} ry={radius} fill="#ffffff" />
      <g>
        {item.showGrid && grid ? (
          <path d={grid} stroke={item.axisColor} strokeWidth={0.5} opacity={0.16} fill="none" />
        ) : null}
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
        {curves.map((curve) =>
          curve.d ? (
            <path
              key={curve.id}
              d={curve.d}
              fill="none"
              stroke={curve.color}
              strokeWidth={curve.lineWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null
        )}
        {hoverFillId && hover ? (
          <defs>
            <linearGradient id={hoverFillId} x1="0%" y1="0%" x2="100%" y2="0%">
              {hover.colors.map((color, index) => {
                const from = hover.colors.length === 1 ? 0 : (index * 100) / (hover.colors.length - 1)
                return <stop key={`${color}-${index}`} offset={`${from}%`} stopColor={color} />
              })}
            </linearGradient>
          </defs>
        ) : null}
        {hover ? (
          <g pointerEvents="none">
            <line x1={hover.px} y1={hover.py} x2={hover.px} y2={axisY} stroke={hoverFill} strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
            <line x1={hover.px} y1={hover.py} x2={axisX} y2={hover.py} stroke={hoverFill} strokeWidth={1} strokeDasharray="4 4" opacity={0.7} />
            <circle cx={hover.px} cy={hover.py} r={3.2} fill={hoverFill} stroke="#ffffff" strokeWidth={1.2} />
          </g>
        ) : null}
      </g>
      {hover && hoverBox ? (
        <g pointerEvents="none">
          <rect
            x={hoverBox.left}
            y={hoverBox.top}
            width={hoverBox.boxWidth}
            height={hoverBox.boxHeight}
            rx={4}
            fill="#ffffff"
            stroke="#111111"
            strokeWidth={0.8}
            opacity={0.96}
          />
          <text
            x={hoverBox.left + 6}
            y={hoverBox.top + hoverFontSize + 1}
            fontSize={hoverFontSize}
            fontFamily="var(--font)"
            fill="#111111"
          >
            {hoverLabel}
          </text>
        </g>
      ) : null}
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