import type { ReactNode } from 'react'
import { Grid3x3, Magnet, Minus, Plus, X } from 'lucide-react'
import type { GridMode } from '@shared/types'

const MODES: Array<{ id: GridMode; label: string }> = [
  { id: 'none', label: 'Нет' },
  { id: 'lines', label: 'Линии' },
  { id: 'dots', label: 'Точки' }
]

const SIZES = [10, 20, 40, 80, 160]

export interface BoardSettingsProps {
  mode: GridMode
  size: number
  snap: boolean
  onMode: (mode: GridMode) => void
  onSize: (size: number) => void
  onSnap: (value: boolean) => void
  onClose: () => void
}

export function BoardSettings(props: BoardSettingsProps): ReactNode {
  const step = Math.max(0, SIZES.indexOf(props.size))
  return (
    <div className="boardsettings">
      <div className="boardsettings__head">
        <Grid3x3 size={15} />
        <span className="boardsettings__title">Сетка и привязка</span>
        <button type="button" className="boardsettings__close" onClick={props.onClose} aria-label="Закрыть настройки доски">
          <X size={14} />
        </button>
      </div>

      <div className="boardsettings__list">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            type="button"
            className="boardsettings__row"
            data-active={props.mode === mode.id}
            onClick={() => props.onMode(mode.id)}
          >
            <span className="boardsettings__radio" />
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      <div className="boardsettings__sep" />

      <div className="boardsettings__step">
        <span className="boardsettings__label">Шаг сетки</span>
        <div className="boardsettings__stepper">
          <button type="button" className="toolbtn" disabled={step <= 0} onClick={() => props.onSize(SIZES[step - 1])} aria-label="Мельче">
            <Minus size={15} />
          </button>
          <span className="boardsettings__value">{props.size} px</span>
          <button
            type="button"
            className="toolbtn"
            disabled={step >= SIZES.length - 1}
            onClick={() => props.onSize(SIZES[step + 1])}
            aria-label="Крупнее"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      <div className="boardsettings__sep" />

      <label className="boardsettings__row boardsettings__row--switch">
        <Magnet size={14} />
        <span>Привязка к сетке</span>
        <input type="checkbox" checked={props.snap} onChange={(event) => props.onSnap(event.target.checked)} />
      </label>
      <div className="toolpalette__hint">Объекты встают на клетки при переносе и создании.</div>
    </div>
  )
}