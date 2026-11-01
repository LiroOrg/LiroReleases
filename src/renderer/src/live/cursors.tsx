import { memo, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { RemoteCursor } from './session'
import { readableOn } from './session'

const ARROW = 'M 4.8 3.9 L 18.2 10.2 Q 20 11 18.5 12.3 L 13.2 15.1 L 9.5 19.7 Q 8 21 7.5 19.1 L 2.5 1.1 Q 3 3 4.8 3.9 Z'
const TIP_X = 2.5
const TIP_Y = 1.1
const ARROW_SPAN = 22
const EDGE_CLEAR = 26
const INSET = 10
const STICKY_RATIO = 2
const TIP_OFFSET = `${-TIP_X}px ${-TIP_Y}px`

type EdgeDir = 'right' | 'down' | 'left' | 'up'

type Side = EdgeDir | 'in'

const ANGLE: Record<Side, number> = { in: 0, right: 135, down: 225, left: 315, up: 45 }
const LEAN = 38

const NAME_AT: Record<Side, string> = {
  in: 'translate(13px, 15px)',
  left: `translate(${EDGE_CLEAR}px, -50%)`,
  right: `translate(calc(-100% - ${EDGE_CLEAR}px), -50%)`,
  up: `translate(-50%, ${EDGE_CLEAR}px)`,
  down: `translate(-50%, calc(-100% - ${EDGE_CLEAR}px))`
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return (min + max) / 2
  return Math.min(Math.max(value, min), max)
}

function lean(side: Side, dx: number, dy: number): number {
  const base = ANGLE[side]
  if (side === 'in' || (!dx && !dy)) return base
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI + 135
  return base + clamp((((raw - base + 540) % 360) - 180), -LEAN, LEAN)
}

function room(dir: EdgeDir, x: number, width: number): number {
  if (dir === 'left') return width - INSET - x - EDGE_CLEAR
  if (dir === 'right') return x - INSET - EDGE_CLEAR
  return 2 * Math.max(48, Math.min(x - INSET, width - INSET - x))
}

function pickSide(sticky: EdgeDir | undefined, dx: number, dy: number): EdgeDir {
  const raw: EdgeDir = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down'
  if (!sticky || sticky === raw) return raw
  const major = Math.max(Math.abs(dx), Math.abs(dy))
  const minor = Math.min(Math.abs(dx), Math.abs(dy))
  return major > minor * STICKY_RATIO ? raw : sticky
}

export const LiveCursors = memo(function LiveCursors(props: {
  cursors: RemoteCursor[]
  width: number
  height: number
  gutter: number
  toScreen: (x: number, y: number) => { x: number; y: number }
}): ReactNode {
  const sides = useRef(new Map<string, EdgeDir>())
  const angles = useRef(new Map<string, number>())
  const seen = useRef(new Set<string>())
  const fresh = new Set<string>()

  return (
    <>
      {props.cursors.map((cursor) => {
        if (!cursor.visible) return null
        const point = props.toScreen(cursor.x, cursor.y)
        const x = clamp(point.x, props.gutter + INSET, props.width - INSET)
        const y = clamp(point.y, INSET + ARROW_SPAN / 2, props.height - INSET - ARROW_SPAN / 2)
        if (!seen.current.has(cursor.id)) {
          seen.current.add(cursor.id)
          fresh.add(cursor.id)
        }
        if (x === point.x && y === point.y) {
          sides.current.delete(cursor.id)
        } else {
          const side = pickSide(sides.current.get(cursor.id), point.x - x, point.y - y)
          sides.current.set(cursor.id, side)
        }
        const side: Side = sides.current.get(cursor.id) ?? 'in'
        const atEdge = side !== 'in'
        const target = lean(side, point.x - x, point.y - y)
        const last = angles.current.get(cursor.id)
        const angle = last === undefined ? target : target + 360 * Math.round((last - target) / 360)
        angles.current.set(cursor.id, angle)
        const style: CSSProperties = {
          translate: `${x}px ${y}px`,
          ...(fresh.has(cursor.id) ? { transition: 'none' } : null)
        }
        return (
          <div key={cursor.id} className={cursor.away ? 'livecursor livecursor--away' : 'livecursor'} style={style}>
            <span className="livecursor__pointer" style={{ rotate: `${angle}deg`, translate: TIP_OFFSET }}>
              <svg
                className="livecursor__arrow"
                width={ARROW_SPAN}
                height={ARROW_SPAN}
                viewBox="0 0 22 22"
                aria-hidden="true"
              >
                <path d={ARROW} fill={cursor.color} stroke="#ffffff" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </span>
            <span
              className="livecursor__name"
              style={{
                background: cursor.color,
                color: readableOn(cursor.color),
                transform: NAME_AT[side],
                maxWidth: atEdge ? room(side, x, props.width) : undefined
              }}
            >
              {cursor.name}
            </span>
          </div>
        )
      })}
    </>
  )
})
