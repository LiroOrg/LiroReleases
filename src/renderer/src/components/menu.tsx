import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

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
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

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
      {open ? (
        <div className="menu__pop" data-align={props.align ?? 'right'} onPointerDown={(event) => event.stopPropagation()}>
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
        </div>
      ) : null}
    </div>
  )
}