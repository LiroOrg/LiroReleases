import { memo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { BoardDoc, BoardItem, Rect } from '@shared/types'
import { deriveConnectorPoints } from '@shared/geometry'
import { strokeDash } from './shapes'

export interface ConnectorLayerProps {
  doc: BoardDoc
  viewRef: { current: { x: number; y: number; zoom: number } }
  size: { width: number; height: number }
  visible: Rect
  dpr: number
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

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let running = true
    const loop = (): void => {
      if (!running) return
      const current = props.viewRef.current
      const signature = `${Math.round(current.x * 100)}:${Math.round(current.y * 100)}:${current.zoom.toFixed(4)}:${props.doc.items.length}:${props.size.width}x${props.size.height}`
      if (signature !== lastRef.current) {
        lastRef.current = signature
        draw(canvas, props, current)
      }
      requestAnimationFrame(loop)
    }
    loop()
    return () => {
      running = false
    }
  }, [props.doc, props.size, props.viewRef, props.dpr])

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
    const area = props.visible
    const margin = 200

    for (const item of props.doc.items) {
      if (item.kind !== 'connector') continue
      if (
        item.x > area.x + area.width + margin ||
        item.x + Math.max(1, item.w) < area.x - margin ||
        item.y > area.y + area.height + margin ||
        item.y + Math.max(1, item.h) < area.y - margin
      ) {
        continue
      }
      const connector = item
      const points = deriveConnectorPoints(connector, byId)
      if (points.length < 2) continue
      const screen = points.map(toScreen)
      const lineWidth = Math.max(0.6, connector.lineWidth * zoom)
      ctx.strokeStyle = connector.color
      ctx.fillStyle = connector.color
      ctx.lineWidth = lineWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const dash = strokeDash(connector.lineStyle as 'normal' | 'dotted' | 'dashed')
      ctx.setLineDash(dash ? dash.split(' ').map((v) => Number(v) * zoom) : [])
      ctx.beginPath()
      if (connector.shape === 'curved' && screen.length === 2) {
        const [a, b] = screen
        const midX = (a.x + b.x) / 2
        const midY = (a.y + b.y) / 2 - Math.abs(b.x - a.x) * 0.11
        ctx.moveTo(a.x, a.y)
        ctx.quadraticCurveTo(midX, midY, b.x, b.y)
      } else if (connector.shape === 'elbowed' && screen.length === 2) {
        const [a, b] = screen
        const midX = (a.x + b.x) / 2
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(midX, a.y)
        ctx.lineTo(midX, b.y)
        ctx.lineTo(b.x, b.y)
      } else {
        ctx.moveTo(screen[0].x, screen[0].y)
        for (let i = 1; i < screen.length; i++) ctx.lineTo(screen[i].x, screen[i].y)
      }
      ctx.stroke()
      ctx.setLineDash([])
      if (connector.captions?.length) {
        const mid = screen[Math.floor(screen.length / 2)]
        ctx.font = `${Math.max(8, 12 * zoom)}px var(--font, sans-serif)`
        ctx.fillStyle = connector.textColor ?? '#1a1a1a'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const plain = connector.captions[0].replace(/<[^>]*>/g, '')
        ctx.fillText(plain.slice(0, 60), mid.x, mid.y - lineWidth * 2)
      }
      drawArrow(ctx, screen[0], screen[1], connector.startStroke, connector.color, lineWidth)
      const last = screen[screen.length - 1]
      const prev = screen[screen.length - 2]
      drawArrow(ctx, prev, last, connector.endStroke, connector.color, lineWidth)
    }
  }
}