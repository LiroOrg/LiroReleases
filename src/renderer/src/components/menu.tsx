import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  danger?: boolean
  active?: boolean
  run: () => void
}

export function Menu(props: {
  items: MenuItem[]
  label: string
  children: ReactNode
  align?: 'left' | 'right'
  header?: string
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [spot, setSpot] = useState({ left: 0, top: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const place = useCallback((): void => {
    const trigger = wrapRef.current?.getBoundingClientRect()
    if (!trigger) return
    const pop = popRef.current
    const width = pop?.offsetWidth ?? 196
    const height = pop?.offsetHeight ?? 0
    const gap = 6
    const room = 10
    const left =
      props.align === 'left'
        ? trigger.left
        : Math.max(room, Math.min(trigger.right - width, window.innerWidth - width - room))
    let top = trigger.bottom + gap
    if (top + height > window.innerHeight - room) top = Math.max(room, trigger.top - gap - height)
    setSpot({ left, top })
  }, [props.align])

  useLayoutEffect(() => {
    if (open) place()
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (wrapRef.current?.contains(target) || popRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onReflow = (): void => place()
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, place])

  return (
    <div className="menu" ref={wrapRef}>
      <button
        type="button"
        className="menu__trigger"
        aria-label={props.label}
        title={props.label}
        data-active={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        {props.children}
      </button>
      {open
        ? createPortal(
            <div
              className="menu__pop"
              ref={popRef}
              style={{ left: spot.left, top: spot.top }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              {props.header ? <div className="menu__title">{props.header}</div> : null}
              {props.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="menu__item"
                  data-danger={item.danger ? 'true' : undefined}
                  data-active={item.active ? 'true' : undefined}
                  onClick={() => {
                    setOpen(false)
                    item.run()
                  }}
                >
                  {item.icon ? <span className="menu__icon">{item.icon}</span> : null}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}