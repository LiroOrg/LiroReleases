import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pipette, Plus } from 'lucide-react'

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const chroma = saturation * Math.min(lightness, 1 - lightness)
  const channel = (offset: number): number => {
    const k = (offset + hue / 30) % 12
    return lightness - chroma * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  const hex = (value: number): string =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${hex(channel(0))}${hex(channel(8))}${hex(channel(4))}`
}

function isLight(hex: string): boolean {
  const value = hex.replace('#', '')
  if (value.length !== 6) return false
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6
}

const HUES: Array<[number, number]> = [
  [2, 0.7], [20, 0.78], [36, 0.82], [50, 0.78], [76, 0.62], [140, 0.52],
  [172, 0.52], [196, 0.62], [216, 0.7], [248, 0.62], [280, 0.56], [322, 0.62]
]

const TONES: Array<[number, number]> = [
  [0.9, 0.6], [0.78, 0.82], [0.64, 1], [0.48, 1], [0.32, 0.88]
]

const GRAYS = [0.97, 0.93, 0.86, 0.77, 0.66, 0.55, 0.44, 0.35, 0.27, 0.19, 0.12, 0.06]

const GRID_COLUMNS = 6

function serpentine(colors: string[]): string[] {
  const rows: string[][] = []
  for (let index = 0; index < colors.length; index += GRID_COLUMNS)
    rows.push(colors.slice(index, index + GRID_COLUMNS))
  return rows.flatMap((row, index) => (index % 2 ? row.slice().reverse() : row))
}

function buildAllColors(): string[] {
  const ramp = GRAYS.slice().reverse().map((tone) => hslToHex(220, 0.02, tone))
  for (const [lightness, saturation] of TONES)
    for (const [hue, base] of HUES) ramp.push(hslToHex(hue, base * saturation, lightness))
  return serpentine(ramp)
}

const ALL_COLORS = buildAllColors()

export function PaletteHead(props: { icon: ReactNode; label: string; hint?: string; keyHint?: string }): ReactNode {
  return (
    <div className="toolpalette__head">
      <span className="toolpalette__head-icon" aria-hidden="true">
        {props.icon}
      </span>
      <span className="toolpalette__head-label">{props.label}</span>
      {props.hint ? <span className="toolpalette__head-hint truncate">{props.hint}</span> : null}
      {props.keyHint ? <kbd className="toolpalette__head-key">{props.keyHint}</kbd> : null}
    </div>
  )
}

export function PaletteGroup(props: { title?: string; children: ReactNode }): ReactNode {
  return (
    <div className="toolpalette__group">
      {props.title ? <div className="toolpalette__label">{props.title}</div> : null}
      <div className="toolpalette__body">{props.children}</div>
    </div>
  )
}

export function PaletteGrid(props: { columns?: 2 | 3 | 4 | 5 | 6; children: ReactNode }): ReactNode {
  return <div className={`toolpalette__grid toolpalette__grid--${props.columns ?? 4}`}>{props.children}</div>
}

export function LineGlyph(props: { shape: 'straight' | 'curved' | 'elbowed' | 'arrow' }): ReactNode {
  const path =
    props.shape === 'straight'
      ? 'M 2 11 L 18 3'
      : props.shape === 'curved'
        ? 'M 2 11 C 9 11 11 3 18 3'
        : props.shape === 'elbowed'
          ? 'M 2 11 H 8 Q 10 11 10 9 V 5 Q 10 3 12 3 H 18'
          : 'M 2 11 L 18 3'
  const head = props.shape === 'arrow' ? 'M 11 3 H 18 V 10' : null
  return (
    <svg
      width="20"
      height="14"
      viewBox="0 0 20 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
      {head ? <path d={head} /> : null}
    </svg>
  )
}

export function PaletteCell(props: {
  title: string;
  icon: ReactNode
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children?: ReactNode
}): ReactNode {
  return (
    <button
      type="button"
      className={props.children ? 'toolbtn toolpalette__cell toolpalette__cell--tall' : 'toolbtn toolpalette__cell'}
      data-active={props.active ? 'true' : undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.active ? true : undefined}
    >
      {props.icon}
      {props.children ? <span className="toolpalette__caption">{props.children}</span> : null}
    </button>
  )
}

export function PaletteOption(props: {
  label: string
  icon?: ReactNode
  active?: boolean
  disabled?: boolean
  hint?: string
  title?: string
  onClick: () => void
}): ReactNode {
  return (
    <button
      type="button"
      className="toolbtn toolpalette__option"
      data-active={props.active ? 'true' : undefined}
      disabled={props.disabled}
      onClick={props.onClick}
      title={props.title ?? props.label}
      aria-pressed={props.active ? true : undefined}
    >
      <span className="toolpalette__option-icon">{props.icon}</span>
      <span className="toolpalette__option-label">{props.label}</span>
      {props.hint ? <span className="toolpalette__option-hint">{props.hint}</span> : null}
    </button>
  )
}

export function PaletteSlider(props: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}): ReactNode {
  return (
    <label className="toolpalette__slider" title={props.label}>
      <span className="toolpalette__slider-name">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <span className="toolpalette__slider-value">
        {Math.round(props.value)}
        {props.suffix}
      </span>
    </label>
  )
}

export function PaletteSwatches(props: {
  colors: string[]
  value: string
  onPick: (color: string) => void
  onCustom: (color: string) => void
  customLabel?: string
  nameFor?: (color: string) => string
  note?: string
}): ReactNode {
  const lowered = props.value.toLowerCase()
  return (
    <div className="toolpalette__colors">
      {props.colors.map((color) => (
        <button
          key={color}
          type="button"
          className="swatch"
          data-active={color.toLowerCase() === lowered ? 'true' : undefined}
          aria-label={props.nameFor ? props.nameFor(color) : color}
          title={props.note ?? (props.nameFor ? props.nameFor(color) : color)}
          onClick={() => props.onPick(color)}
          style={{ background: color }}
        />
      ))}
      <label className="swatch swatch--custom" title={props.customLabel ?? 'Свой цвет'}>
        <input type="color" value={props.value} onChange={(event) => props.onCustom(event.target.value)} aria-label={props.customLabel ?? 'Свой цвет'} />
        <Pipette size={13} />
      </label>
    </div>
  )
}

export function BrushDot(props: {
  color: string
  width: number
  max: number
  active: boolean
  nameFor: (color: string) => string
  onSelect: () => void
  onChange: (patch: { color?: string; width?: number }) => void
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [spot, setSpot] = useState({ left: 0, top: 0 })
  const dotRef = useRef<HTMLButtonElement | null>(null)
  const customRef = useRef<HTMLInputElement | null>(null)
  const popRef = useRef<HTMLDivElement | null>(null)
  const lowered = props.color.toLowerCase()
  const ink = 11 + (Math.min(Math.max(props.width, 1), props.max) / props.max) * 21

  useLayoutEffect(() => {
    if (!open) return
    const trigger = dotRef.current?.getBoundingClientRect()
    const pop = popRef.current
    if (!trigger || !pop) return
    const panel = dotRef.current?.closest('.toolpalette')?.getBoundingClientRect() ?? trigger
    const gap = 8
    const left =
      panel.right + pop.offsetWidth + gap > window.innerWidth - 8
        ? Math.max(8, panel.left - pop.offsetWidth - gap)
        : panel.right + gap
    const top = Math.max(8, Math.min(trigger.top - 8, window.innerHeight - pop.offsetHeight - 8))
    setSpot({ left, top })
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event: PointerEvent): void => {
      const target = event.target as Node
      if (popRef.current?.contains(target) || dotRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (color: string): void => {
    props.onChange({ color })
    setOpen(false)
  }

  const select = (): void => {
    props.onSelect()
    if (props.active) setOpen((current) => !current)
  }

  return (
    <>
      <button
        type="button"
        ref={dotRef}
        className="brushdot"
        data-active={props.active ? 'true' : undefined}
        aria-label={`${props.nameFor(props.color)}, ${props.width}`}
        title={`${props.nameFor(props.color)} · ${props.width} · выбрать, повторный клик — настроить`}
        onClick={select}
      >
        <span
          className="brushdot__ink"
          style={{ background: props.color, width: `${ink}px`, height: `${ink}px` }}
        />
      </button>
      {open
        ? createPortal(
            <div
              className="colorpick"
              ref={popRef}
              style={{ left: spot.left, top: spot.top }}
              role="dialog"
              aria-label="Кисть"
              onPointerDown={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
            >
              <input
                type="range"
                className="colorpick__size"
                min={1}
                max={props.max}
                step={1}
                value={props.width}
                aria-label="Размер кисти"
                title={`Размер: ${props.width}`}
                onChange={(event) => props.onChange({ width: Number(event.target.value) })}
              />
              <div className="colorpick__section">Все цвета</div>
              <div
                className="colorpick__grid"
                style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))` }}
              >
                {ALL_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="colorpick__cell"
                    data-active={color.toLowerCase() === lowered ? 'true' : undefined}
                    aria-label={props.nameFor(color)}
                    title={props.nameFor(color)}
                    onClick={() => pick(color)}
                    style={{ background: color }}
                  >
                    {color.toLowerCase() === lowered ? (
                      <Check size={13} strokeWidth={3} className={isLight(color) ? 'mark-dark' : 'mark-light'} />
                    ) : null}
                  </button>
                ))}
                <button
                  type="button"
                  className="colorpick__cell colorpick__cell--more"
                  aria-label="Свой цвет"
                  title="Свой цвет"
                  onClick={() => customRef.current?.click()}
                >
                  <Plus size={14} />
                </button>
                <input
                  ref={customRef}
                  type="color"
                  className="colorpick__custom"
                  value={/^#[0-9a-fA-F]{6}$/.test(props.color) ? props.color : '#000000'}
                  aria-label="Свой цвет"
                  onChange={(event) => pick(event.target.value.toLowerCase())}
                />
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  )
}

export function PaletteCheck(props: { label: string; checked: boolean; onChange: (value: boolean) => void }): ReactNode {
  return (
    <label className="toolpalette__check">
      <input type="checkbox" checked={props.checked} onChange={(event) => props.onChange(event.target.checked)} />
      <span className="toolpalette__check-box" aria-hidden="true">
        {props.checked ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span className="toolpalette__check-label">{props.label}</span>
    </label>
  )
}

export function PaletteAction(props: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; title?: string }): ReactNode {
  return (
    <button
      type="button"
      className="toolbtn toolpalette__action"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title ?? props.label}
    >
      {props.icon}
      {props.label}
    </button>
  )
}

export function PaletteNote(props: { children: ReactNode; action?: ReactNode }): ReactNode {
  return (
    <div className="toolpalette__note">
      <span>{props.children}</span>
      {props.action}
    </div>
  )
}
