import { memo } from 'react'
import type { ReactNode } from 'react'
import type { RemoteCursor } from './session'
import { readableOn } from './session'

const ARROW = 'M 4.8 3.9 L 18.2 10.2 Q 20 11 18.5 12.3 L 13.2 15.1 L 9.5 19.7 Q 8 21 7.5 19.1 L 2.5 1.1 Q 3 3 4.8 3.9 Z'

export const LiveCursors = memo(function LiveCursors(props: {
  cursors: RemoteCursor[]
  toScreen: (x: number, y: number) => { x: number; y: number }
}): ReactNode {
  return (
    <>
      {props.cursors.map((cursor) => {
        if (!cursor.visible) return null
        const point = props.toScreen(cursor.x, cursor.y)
        return (
          <div
            key={cursor.id}
            className="livecursor"
            style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)` }}
          >
            <svg className="livecursor__arrow" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <path
                d={ARROW}
                fill={cursor.color}
                stroke="#ffffff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className="livecursor__name" style={{ background: cursor.color, color: readableOn(cursor.color) }}>
              {cursor.name}
            </span>
          </div>
        )
      })}
    </>
  )
})
