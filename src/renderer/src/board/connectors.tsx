import { memo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { BoardDoc, BoardItem, Rect } from '@shared/types'
import { curveControl, deriveConnectorPoints } from '@shared/geometry'
import { strokeDash } from '@shared/shapes'

export interface ConnectorLayerProps {
  doc: BoardDoc
  viewRef: { current: { x: number; y: number; zoom: number } }
  size: { width: number; height: number }
  visible: Rect
  dpr: number
  liveRef?: { current: number }
  livePosRef?: { current: Map<string, { x: number; y: number }> }
  previewPositions?: Array<{ id: string; x: number; y: number }>
}

function roundedElbow(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  radius: number
): void {
  ctx.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const corner = points[index]
    const next = points[index + 1]
    const inX = corner.x - previous.x
    const inY = corner.y - previous.y
    const outX = next.x - corner.x
    const outY = next.y - corner.y
    const inLen = Math.hypot(inX, inY)
    const outLen = Math.hypot(outX, outY)
    if (inLen < 0.01 || outLen < 0.01) continue
    const cut = Math.min(radius, inLen / 2, outLen / 2)
    ctx.lineTo(corner.x - (inX / inLen) * cut, corner.y - (inY / inLen) * cut)
    ctx.quadraticCurveTo(
      corner.x,
      corner.y,
      corner.x + (outX / outLen) * cut,
      corner.y + (outY / outLen) * cut
    )
  }
  const last = points[points.length - 1]
  ctx.lineTo(last.x, last.y)
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  cap: string,
  color: string,
  lineWidth: number
): void {
  if (cap === 'none') return
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const size = Math.max(6, lineWidth * 3.4)
  ctx.save()
  ctx.translate(to.x, to.y)
  ctx.rotate(angle)
  ctx.fillStyle = color
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, lineWidth * 0.8)
  const shape = cap.toLowerCase()
  ctx.beginPath()
  if (shape.includes('diamond')) {
    const half = size * 0.62
    ctx.moveTo(-half, 0)
    ctx.lineTo(0, -half * 0.72)
    ctx.lineTo(half, 0)
    ctx.lineTo(0, half * 0.72)
    ctx.closePath()
    if (shape.includes('filled')) ctx.fill()
    else ctx.stroke()
  } else if (shape.includes('oval') || shape.includes('circle')) {
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2)
    if (shape.includes('filled')) ctx.fill()
    else ctx.stroke()
  } else if (shape.includes('triangle')) {
    ctx.moveTo(0, 0)
    ctx.lineTo(-size * 0.85, -size * 0.6)
    ctx.lineTo(-size * 0.85, size * 0.6)
    ctx.closePath()
    ctx.fill()
  } else {
    ctx.moveTo(0, 0)
    ctx.lineTo(-size * 0.8, -size * 0.45)
    ctx.lineTo(-size * 0.8, size * 0.45)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export const ConnectorLayer = memo(function ConnectorLayer(props: ConnectorLayerProps): ReactNode {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const lastRef = useRef('')
  const propsRef = useRef(props)

  useEffect(() => {
    propsRef.current = props
  })

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let running = true
    const loop = (): void => {
      if (!running) return
      const live = propsRef.current
      const current = live.viewRef.current
      const previewKey = (live.previewPositions ?? [])
        .map((position) => `${position.id}:${Math.round(position.x)}:${Math.round(position.y)}`)
        .join(',')
      const signature = `${Math.round(current.x * 100)}:${Math.round(current.y * 100)}:${current.zoom.toFixed(4)}:${live.doc.items.length}:${live.size.width}x${live.size.height}:${live.liveRef?.current ?? 0}:${previewKey}`
      if (signature !== lastRef.current) {
        lastRef.current = signature
        draw(canvas, live, current)
      }
      requestAnimationFrame(loop)
    }
    loop()
    return () => {
      running = false
    }
  }, [])

  return (
    <canvas
      ref={ref}
      className="boardview__connectors"
      style={{ width: props.size.width, height: props.size.height }}
    />
  )
})

function draw(
  canvas: HTMLCanvasElement,
  props: ConnectorLayerProps,
  viewport: { x: number; y: number; zoom: number }
): void {
  {
    const dpr = Math.max(1, props.dpr)
    const width = Math.max(1, Math.round(props.size.width * dpr))
    const height = Math.max(1, Math.round(props.size.height * dpr))
    if (canvas.width !== width) canvas.width = width
    if (canvas.height !== height) canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.scale(dpr, dpr)
    const { x: cx, y: cy, zoom } = viewport
    const originX = props.size.width / 2 - cx * zoom
    const originY = props.size.height / 2 - cy * zoom
    const toScreen = (point: { x: number; y: number }): { x: number; y: number } => ({
      x: point.x * zoom + originX,
      y: point.y * zoom + originY
    })

    const byId = new Map<string, BoardItem>()
    for (const item of props.doc.items) byId.set(item.id, item)
    for (const [id, position] of props.livePosRef?.current ?? []) {
      const item = byId.get(id)
      if (item) byId.set(id, { ...item, x: position.x, y: position.y } as BoardItem)
    }
    for (const position of props.previewPositions ?? []) {
      const item = byId.get(position.id)
      if (item) byId.set(position.id, { ...item, x: position.x, y: position.y } as BoardItem)
    }
    const area = props.visible
    const margin = 200

    for (const item of props.doc.items) {
      if (item.kind !== 'connector') continue
      const connector = item
      const points = deriveConnectorPoints(connector, byId)
      if (points.length < 2) continue
      let left = Infinity
      let right = -Infinity
      let top = Infinity
      let bottom = -Infinity
      for (const point of points) {
        left = Math.min(left, point.x)
        right = Math.max(right, point.x)
        top = Math.min(top, point.y)
        bottom = Math.max(bottom, point.y)
      }
      if (
        left > area.x + area.width + margin ||
        right < area.x - margin ||
        top > area.y + area.height + margin ||
        bottom < area.y - margin
      ) {
        continue
      }
      const screen = points.map(toScreen)
      const lineWidth = Math.max(0.6, connector.lineWidth * zoom)
      const elbowRadius = Math.min(Math.max(4, 14 * zoom), 40)
      ctx.strokeStyle = connector.color
      ctx.fillStyle = connector.color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const dash = strokeDash(connector.lineStyle as 'normal' | 'dotted' | 'dashed')
      ctx.setLineDash(dash ? dash.split(' ').map((v) => Number(v) * zoom) : [])
      ctx.beginPath()
      let ctrl: { x: number; y: number } | null = null
      if (connector.shape === 'curved' && screen.length === 2) {
        const [a, b] = screen
        ctrl = curveControl(a, b)
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(ctrl.x, ctrl.y, b.x, b.y)
      } else if (connector.shape === 'elbowed' && screen.length === 2) {
        const [a, b] = screen
        const path =
          Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
            ? [a, { x: (a.x + b.x) / 2, y: a.y }, { x: (a.x + b.x) / 2, y: b.y }, b]
            : [a, { x: a.x, y: (a.y + b.y) / 2 }, { x: b.x, y: (a.y + b.y) / 2 }, b]
        roundedElbow(ctx, path, elbowRadius)
      } else if (screen.length > 2) {
        roundedElbow(ctx, screen, elbowRadius)
      } else {
        ctx.moveTo(screen[0].x, screen[0].y)
        ctx.lineTo(screen[1].x, screen[1].y)
      }
      ctx.stroke()
      ctx.setLineDash([])
      if (connector.captions?.length) {
        const mid = ctrl
          ? {
              x: (screen[0].x + 2 * ctrl.x + screen[1].x) / 4,
              y: (screen[0].y + 2 * ctrl.y + screen[1].y) / 4
            }
          : screen[Math.floor(screen.length / 2)]
        ctx.font = `${Math.max(8, 12 * zoom)}px Inter, 'Segoe UI', sans-serif`
        ctx.fillStyle = connector.textColor ?? '#1a1a1a'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const plain = connector.captions[0].replace(/<[^>]*>/g, '')
        ctx.fillText(plain, mid.x, mid.y - lineWidth * 2)
      }
      const startFrom = ctrl ?? screen[1]
      drawArrow(ctx, startFrom, screen[0], connector.startStroke, connector.color, lineWidth)
      const last = screen[screen.length - 1]
      const endFrom = ctrl ?? screen[screen.length - 2]
      drawArrow(ctx, endFrom, last, connector.endStroke, connector.color, lineWidth)
    }
  }
}