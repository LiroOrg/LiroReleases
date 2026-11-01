import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { KeyboardEvent as MenuKeyboardEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'

export interface MenuItem {
  id: string
  label: string
  icon?: ReactNode
  hint?: string
  danger?: boolean
  active?: boolean
  disabled?: boolean
  radio?: boolean
  line?: boolean
  section?: string
  submenu?: MenuItem[]
  run?: () => void
}

let openMenus = 0
const menuWatchers = new Set<() => void>()

function countMenu(delta: number): void {
  openMenus = Math.max(0, openMenus + delta)
  for (const watch of menuWatchers) watch()
}

export function anyMenuOpen(): boolean {
  return openMenus > 0
}

export function watchMenus(handler: () => void): () => void {
  menuWatchers.add(handler)
  return () => menuWatchers.delete(handler)
}

const GAP = 5
const EDGE = 8

interface Spot {
  left: number
  top: number
}

function clampSpot(spot: Spot, size: { width: number; height: number }): Spot {
  return {
    left: Math.max(EDGE, Math.min(spot.left, window.innerWidth - size.width - EDGE)),
    top: Math.max(EDGE, Math.min(spot.top, window.innerHeight - size.height - EDGE))
  }
}

function Mark(props: { item: MenuItem }): ReactNode {
  if (props.item.radio)
    return (
      <span className="menu__mark">
        {props.item.active ? <span className="menu__dot" /> : null}
      </span>
    )
  return <span className="menu__icon">{props.item.icon}</span>
}

function MenuList(props: { items: MenuItem[]; onCloseAll: () => void; onBack?: () => void; root: boolean }): ReactNode {
  const [cursor, setCursor] = useState(-1)
  const [expanded, setExpanded] = useState('')
  const [subSpot, setSubSpot] = useState<Spot>({ left: 0, top: 0 })
  const listRef = useRef<HTMLDivElement>(null)
  const subRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef(new Map<string, HTMLButtonElement>())

  const selectable = props.items.filter((item) => !item.disabled)

  const closeSub = useCallback((): void => setExpanded(''), [])

  useEffect(() => {
    listRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!expanded) return
    const rect = rowsRef.current.get(expanded)?.getBoundingClientRect() ?? null
    if (!rect) return
    const size = subRef.current
      ? { width: subRef.current.offsetWidth, height: subRef.current.offsetHeight }
      : { width: 196, height: 160 }
    const flip = rect.right + size.width + GAP > window.innerWidth - EDGE
    setSubSpot({
      left: flip ? Math.max(EDGE, rect.left - size.width - GAP) : rect.right + GAP,
      top: clampSpot({ left: 0, top: rect.top - 6 }, size).top
    })
  }, [expanded])

  const run = (item: MenuItem): void => {
    if (item.disabled) return
    if (item.submenu?.length) {
      setExpanded(item.id)
      setCursor(props.items.indexOf(item))
      return
    }
    props.onCloseAll()
    item.run?.()
  }

  const move = (step: number): void => {
    if (!selectable.length) return
    const current = selectable.findIndex((item) => props.items.indexOf(item) === cursor)
    const next = current < 0 ? (step > 0 ? 0 : selectable.length - 1) : (current + step + selectable.length) % selectable.length
    const item = selectable[next]
    setCursor(props.items.indexOf(item))
    if (expanded && expanded !== item.id) setExpanded(item.submenu?.length ? item.id : '')
  }

  const onKeyDown = (event: MenuKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      move(1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      move(-1)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      if (selectable[0]) setCursor(props.items.indexOf(selectable[0]))
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      const last = selectable[selectable.length - 1]
      if (last) setCursor(props.items.indexOf(last))
      return
    }
    if (event.key === 'ArrowRight') {
      const item = props.items[cursor]
      if (item?.submenu?.length) {
        event.preventDefault()
        setExpanded(item.id)
      }
      return
    }
    if (event.key === 'ArrowLeft') {
      if (expanded) {
        event.preventDefault()
        closeSub()
        return
      }
      if (props.onBack) {
        event.preventDefault()
        props.onBack()
      }
      return
    }
    if (event.key === 'Escape') {
      if (expanded) {
        event.preventDefault()
        closeSub()
        return
      }
      if (props.onBack || !props.root) {
        event.preventDefault()
        if (props.onBack) props.onBack()
        else props.onCloseAll()
      }
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      const item = props.items[cursor]
      if (item) {
        event.preventDefault()
        run(item)
      }
    }
  }

  return (
    <>
      <div className="menu__list" ref={listRef} role="menu" tabIndex={-1} onKeyDown={onKeyDown}>
        {props.items.map((item, index) => {
          const openSub = expanded === item.id && Boolean(item.submenu?.length)
          return (
            <Fragment key={item.id}>
              {item.line && index > 0 ? <div className="menu__sep" /> : null}
              {item.section && item.section !== props.items[index - 1]?.section ? (
                <div className="menu__group">{item.section}</div>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="menu__item"
                ref={(node) => {
                  if (node) rowsRef.current.set(item.id, node)
                  else rowsRef.current.delete(item.id)
                }}
                data-danger={item.danger ? 'true' : undefined}
                data-active={item.active ? 'true' : undefined}
                data-cursor={cursor === index ? 'true' : undefined}
                data-open={openSub ? 'true' : undefined}
                aria-disabled={item.disabled ? 'true' : undefined}
                aria-haspopup={item.submenu ? 'true' : undefined}
                aria-expanded={item.submenu ? openSub : undefined}
                disabled={item.disabled}
                onMouseEnter={() => {
                  setCursor(index)
                  if (item.submenu?.length) setExpanded(item.id)
                  else if (expanded) closeSub()
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  run(item)
                }}
              >
                <Mark item={item} />
                <span className="menu__label">{item.label}</span>
                {item.hint ? <span className="menu__hint">{item.hint}</span> : null}
                {item.submenu?.length ? <ChevronRight size={13} className="menu__next" /> : null}
              </button>
            </Fragment>
          )
        })}
      </div>
      {expanded
        ? createPortal(
            <div className="menu__pop menu__pop--sub" ref={subRef} style={{ left: subSpot.left, top: subSpot.top }}>
              <MenuList
                items={props.items.find((item) => item.id === expanded)?.submenu ?? []}
                onCloseAll={props.onCloseAll}
                onBack={closeSub}
                root={false}
              />
            </div>,
            document.body
          )
        : null}
    </>
  )
}

function Pop(props: { spot: Spot; title?: string; items: MenuItem[]; onClose: () => void; innerRef: RefObject<HTMLDivElement | null> }): ReactNode {
  return (
    <div
      className="menu__pop"
      ref={props.innerRef}
      style={{ left: props.spot.left, top: props.spot.top }}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {props.title ? <div className="menu__title">{props.title}</div> : null}
      <MenuList items={props.items} onCloseAll={props.onClose} root />
    </div>
  )
}

export function ContextMenu(props: { title: string; items: MenuItem[]; x: number; y: number; onClose: () => void }): ReactNode {
  const popRef = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<Spot>({ left: props.x, top: props.y })

  useEffect(() => {
    countMenu(1)
    return () => countMenu(-1)
  }, [])

  useLayoutEffect(() => {
    const pop = popRef.current
    if (!pop) return
    setSpot(clampSpot({ left: props.x, top: props.y }, { width: pop.offsetWidth, height: pop.offsetHeight }))
  }, [props.x, props.y, props.items])

  useEffect(() => {
    const onDown = (event: PointerEvent): void => {
      if (popRef.current?.contains(event.target as Node)) return
      props.onClose()
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      if (document.querySelector('.menu__pop--sub')) return
      props.onClose()
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', props.onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', props.onClose)
    }
  }, [props.onClose])

  return createPortal(
    <Pop spot={spot} title={props.title} items={props.items} onClose={props.onClose} innerRef={popRef} />,
    document.body
  )
}

export function Menu(props: {
  items: MenuItem[]
  label: string
  children: ReactNode
  align?: 'left' | 'right'
  side?: 'bottom' | 'top' | 'right' | 'left'
  header?: string
  title?: string
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [spot, setSpot] = useState<Spot>({ left: 0, top: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    countMenu(1)
    return () => countMenu(-1)
  }, [open])

  const place = useCallback((): void => {
    const trigger = wrapRef.current?.getBoundingClientRect()
    if (!trigger) return
    const pop = popRef.current
    const width = pop?.offsetWidth ?? 196
    const height = pop?.offsetHeight ?? 0
    const side = props.side ?? 'bottom'
    if (side === 'right') {
      setSpot(clampSpot({ left: trigger.right + GAP, top: trigger.top - 6 }, { width, height }))
      return
    }
    if (side === 'left') {
      setSpot(clampSpot({ left: trigger.left - width - GAP, top: trigger.top - 6 }, { width, height }))
      return
    }
    const left =
      props.align === 'left' ? trigger.left : Math.max(EDGE, Math.min(trigger.right - width, window.innerWidth - width - EDGE))
    const below = trigger.bottom + GAP
    const above = trigger.top - GAP - height
    const top = side === 'top' || below + height > window.innerHeight - EDGE ? Math.max(EDGE, above) : below
    setSpot(clampSpot({ left, top }, { width, height }))
  }, [props.align, props.side])

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
      if (event.key !== 'Escape') return
      if (document.querySelector('.menu__pop--sub')) return
      setOpen(false)
    }
    const onReflow = (): void => place()
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey, true)
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
        title={props.title ?? props.label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-active={open ? 'true' : undefined}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        {props.children}
      </button>
      {open
        ? createPortal(
            <Pop spot={spot} title={props.header} items={props.items} onClose={() => setOpen(false)} innerRef={popRef} />,
            document.body
          )
        : null}
    </div>
  )
}
