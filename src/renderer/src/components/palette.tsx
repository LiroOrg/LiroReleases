import type { ReactNode } from 'react'
import { Check, Pipette } from 'lucide-react'

export function PaletteGroup(props: { title?: string; children: ReactNode }): ReactNode {
  return (
    <div className="toolpalette__group">
      {props.title ? <div className="toolpalette__label">{props.title}</div> : null}
      <div className="toolpalette__body">{props.children}</div>
    </div>
  )
}

export function PaletteGrid(props: { columns?: 2 | 3 | 4; children: ReactNode }): ReactNode {
  return <div className={`toolpalette__grid toolpalette__grid--${props.columns ?? 4}`}>{props.children}</div>
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
