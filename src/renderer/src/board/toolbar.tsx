import { memo, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import {
  Box,
  Eraser,
  Hand,
  Image as ImageIcon,
  LineChart,
  Link2,
  MoreHorizontal,
  MousePointer2,
  PenTool,
  Pin,
  Square,
  StickyNote,
  Table2,
  Type
} from 'lucide-react'

export type Tool = 'select' | 'pan' | 'pen' | 'erase' | 'create' | 'link' | 'text' | 'sticky' | 'image' | 'solid' | 'graph' | 'table'

interface ToolEntry {
  id: Tool
  label: string
  key: string
  icon: ReactNode
  editing: boolean
  divider?: boolean
}

const CORE: ToolEntry[] = [
  { id: 'select', label: 'Выделение', key: 'V', icon: <MousePointer2 size={18} />, editing: false },
  { id: 'pan', label: 'Рука', key: 'H', icon: <Hand size={18} />, editing: false },
  { id: 'text', label: 'Текст', key: 'T', icon: <Type size={18} />, editing: true, divider: true },
  { id: 'sticky', label: 'Стикер', key: 'N', icon: <StickyNote size={18} />, editing: true },
  { id: 'create', label: 'Фигуры', key: 'S', icon: <Square size={18} />, editing: true },
  { id: 'pen', label: 'Рисовать', key: 'P', icon: <PenTool size={18} />, editing: true },
  { id: 'link', label: 'Связь', key: 'L', icon: <Link2 size={18} />, editing: true },
  { id: 'erase', label: 'Ластик', key: 'E', icon: <Eraser size={18} />, editing: true, divider: true }
]

const EXTRA: ToolEntry[] = [
  { id: 'image', label: 'Картинка', key: 'I', icon: <ImageIcon size={18} />, editing: true },
  { id: 'table', label: 'Таблица', key: 'B', icon: <Table2 size={18} />, editing: true },
  { id: 'graph', label: 'График', key: '', icon: <LineChart size={18} />, editing: true },
  { id: 'solid', label: '3D-фигура', key: 'D', icon: <Box size={18} />, editing: true }
]

export const EXTRA_TOOLS = EXTRA

export function railTools(pins: string[]): ToolEntry[] {
  const pinned = EXTRA.filter((entry) => pins.includes(entry.id))
  const marked = pinned.map((entry, index) => (index === 0 ? { ...entry, divider: true } : entry))
  return [...CORE, ...marked]
}

export const BoardToolbar = memo(function BoardToolbar(props: {
  tool: Tool
  readOnly: boolean
  moreOpen: boolean
  pins: string[]
  onMore: (value: boolean) => void
  onPin: (tool: Tool) => void
  onTool: (tool: Tool) => void
}): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!props.moreOpen) return
    const listener = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) props.onMore(false)
    }
    window.addEventListener('pointerdown', listener, true)
    return () => window.removeEventListener('pointerdown', listener, true)
  }, [props.moreOpen, props.onMore])

  const pick = (tool: Tool): void => {
    props.onMore(false)
    props.onTool(tool)
  }

  const visible = railTools(props.pins).filter((entry) => !(entry.editing && props.readOnly))
  const moreSlot = visible.length + 1

  return (
    <div className="toolgroup toolrail" ref={rootRef} role="toolbar" aria-label="Инструменты">
      {visible.map((entry, index) => (
        <span key={entry.id} className="toolrail__item">
          {entry.divider ? <span className="toolrail__sep" /> : null}
          <button
            type="button"
            className="toolbtn"
            data-active={props.tool === entry.id}
            onClick={() => pick(entry.id)}
            aria-label={entry.label}
            title={`${entry.label} · ${entry.key}`}
            data-slot={index + 1}
          >
            {entry.icon}
          </button>
        </span>
      ))}
      {!props.readOnly ? (
        <span className="toolrail__item">
          <span className="toolrail__sep" />
          <button
            type="button"
            className="toolbtn"
            data-active={props.moreOpen}
            onClick={() => props.onMore(!props.moreOpen)}
            aria-label="Ещё инструменты"
            title={moreSlot <= 9 ? `Ещё инструменты · ${moreSlot}` : 'Ещё инструменты'}
            data-slot={moreSlot}
          >
            <MoreHorizontal size={18} />
          </button>
          {props.moreOpen ? (
            <div className="toolmenu">
              {EXTRA.map((entry) => {
                const pinned = props.pins.includes(entry.id)
                return (
                  <div key={entry.id} className="toolmenu__row">
                    <button
                      type="button"
                      className="toolmenu__item"
                      data-active={props.tool === entry.id}
                      onClick={() => pick(entry.id)}
                    >
                      {entry.icon}
                      <span>{entry.label}</span>
                      {entry.key ? <span className="toolmenu__key">{entry.key}</span> : null}
                    </button>
                    <button
                      type="button"
                      className="toolmenu__pin"
                      data-active={pinned}
                      onClick={() => props.onPin(entry.id)}
                      aria-label={pinned ? `Убрать ${entry.label} из панели` : `Закрепить ${entry.label} в панели`}
                      title={pinned ? 'Убрать из панели' : 'Закрепить в панели'}
                    >
                      <Pin size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : null}
        </span>
      ) : null}
    </div>
  )
})
