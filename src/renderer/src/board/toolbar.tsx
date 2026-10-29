import { memo, useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import {
  Box,
  Eraser,
  Hand,
  Image as ImageIcon,
  LineChart,
  MoreHorizontal,
  MousePointer2,
  PenTool,
  Square,
  StickyNote,
  Table2,
  Type,
  Waypoints
} from 'lucide-react'

export type Tool = 'select' | 'pan' | 'pen' | 'erase' | 'create' | 'link' | 'text' | 'sticky' | 'image' | 'solid' | 'graph' | 'table'

export interface ToolEntry {
  id: Tool
  label: string
  key: string
  icon: ReactNode
  editing: boolean
  divider?: boolean
}

const ENTRIES: Record<Tool, ToolEntry> = {
  pen: { id: 'pen', label: 'Рисовать', key: 'P', icon: <PenTool size={18} />, editing: true },
  select: { id: 'select', label: 'Выделение', key: 'V', icon: <MousePointer2 size={18} />, editing: false },
  pan: { id: 'pan', label: 'Рука', key: 'H', icon: <Hand size={18} />, editing: false },
  text: { id: 'text', label: 'Текст', key: 'T', icon: <Type size={18} />, editing: true, divider: true },
  sticky: { id: 'sticky', label: 'Стикер', key: 'N', icon: <StickyNote size={18} />, editing: true },
  create: { id: 'create', label: 'Фигуры', key: 'S', icon: <Square size={18} />, editing: true },
  solid: { id: 'solid', label: '3D-фигура', key: 'D', icon: <Box size={18} />, editing: true },
  erase: { id: 'erase', label: 'Ластик', key: 'E', icon: <Eraser size={18} />, editing: true, divider: true },
  link: { id: 'link', label: 'Связь', key: 'L', icon: <Waypoints size={18} />, editing: true },
  image: { id: 'image', label: 'Картинка', key: 'I', icon: <ImageIcon size={18} />, editing: true },
  table: { id: 'table', label: 'Таблица', key: 'B', icon: <Table2 size={18} />, editing: true },
  graph: { id: 'graph', label: 'График', key: '', icon: <LineChart size={18} />, editing: true }
}

export const TOOL_ORDER: Tool[] = ['pen', 'select', 'pan', 'text', 'sticky', 'create', 'link', 'erase', 'solid', 'image', 'table', 'graph']
export const TOOL_EXTRAS: Tool[] = ['solid', 'image', 'table', 'graph']

export function toolEntry(id: Tool): ToolEntry {
  return ENTRIES[id]
}

export function normalizeToolLayout(order?: string[], extras?: string[]): { order: Tool[]; extras: Tool[] } {
  const known = (list?: string[]): Tool[] => (list ?? []).filter((id): id is Tool => id in ENTRIES)
  if (!(order ?? []).length && !(extras ?? []).length) return { order: [...TOOL_ORDER], extras: [...TOOL_EXTRAS] }
  const stored = known(order)
  const merged: Tool[] = [...stored, ...TOOL_ORDER.filter((id) => !stored.includes(id))]
  const storedExtras = known(extras)
  const nextExtras = extras === undefined ? [...TOOL_EXTRAS] : [...storedExtras, ...TOOL_ORDER.filter((id) => !merged.includes(id))]
  return { order: merged, extras: [...new Set(nextExtras)].filter((id) => merged.includes(id)) }
}

export function railTools(order: Tool[], extras: Tool[]): ToolEntry[] {
  return order.filter((id) => !extras.includes(id)).map((id) => ENTRIES[id])
}

interface Layout {
  order: Tool[]
  extras: Tool[]
}

function move(layout: Layout, dragged: Tool, target: Tool | null, before: boolean, toExtras: boolean): Layout {
  const order = layout.order.filter((id) => id !== dragged)
  const at = target === null ? order.length : order.indexOf(target)
  if (target === null || before) order.splice(at, 0, dragged)
  else order.splice(at + 1, 0, dragged)
  const extras = toExtras
    ? [...layout.extras.filter((id) => id !== dragged), dragged]
    : layout.extras.filter((id) => id !== dragged)
  return { order, extras: extras.filter((id) => TOOL_ORDER.includes(id)) }
}

export const BoardToolbar = memo(function BoardToolbar(props: {
  tool: Tool
  readOnly: boolean
  moreOpen: boolean
  order: Tool[]
  extras: Tool[]
  onMore: (value: boolean) => void
  onLayout: (layout: Layout) => void
  onTool: (tool: Tool) => void
}): ReactNode {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [dragged, setDragged] = useState<Tool | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const startDrag = (event: DragEvent, id: Tool): void => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
    setDragged(id)
  }

  const dropOnRail = (event: DragEvent, target: Tool | null, before: boolean): void => {
    event.preventDefault()
    event.stopPropagation()
    const id = (event.dataTransfer.getData('text/plain') || dragged) as Tool
    setOver(null)
    if (id && id !== target) props.onLayout(move({ order: props.order, extras: props.extras }, id, target, before, false))
    setDragged(null)
  }

  const dropOnMore = (event: DragEvent, target: Tool | null): void => {
    event.preventDefault()
    event.stopPropagation()
    const id = (event.dataTransfer.getData('text/plain') || dragged) as Tool
    setOver(null)
    if (id && id !== target) props.onLayout(move({ order: props.order, extras: props.extras }, id, target, true, true))
    setDragged(null)
  }

  const allow = (event: DragEvent, slot: string): void => {
    event.preventDefault()
    setOver(slot)
  }

  const visible = railTools(props.order, props.extras).filter((entry) => !(entry.editing && props.readOnly))
  const moreSlot = visible.length + 1
  const extraEntries = props.order.filter((id) => props.extras.includes(id)).map((id) => ENTRIES[id])

  return (
    <div
      className="toolgroup toolrail"
      ref={rootRef}
      role="toolbar"
      aria-label="Инструменты"
      onDragOver={(event) => (props.readOnly ? undefined : allow(event, 'rail'))}
      onDrop={(event) => (props.readOnly ? undefined : dropOnRail(event, null, false))}
    >
      {visible.map((entry, index) => (
        <span
          key={entry.id}
          className="toolrail__item"
          data-over={over === `item:${entry.id}`}
          onDragOver={(event) => {
            if (props.readOnly) return
            event.preventDefault()
            event.stopPropagation()
            const rect = event.currentTarget.getBoundingClientRect()
            setOver(`item:${entry.id}:${event.clientY - rect.top < rect.height / 2 ? 'before' : 'after'}`)
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(event) => {
            if (props.readOnly) return
            const slot = (over || '').split(':')
            dropOnRail(event, entry.id, slot[2] !== 'after')
          }}
        >
          {entry.divider ? <span className="toolrail__sep" /> : null}
          <button
            type="button"
            className="toolbtn"
            draggable={!props.readOnly}
            onDragStart={(event) => startDrag(event, entry.id)}
            onDragEnd={() => setOver(null)}
            data-active={props.tool === entry.id}
            onClick={() => props.onTool(entry.id)}
            aria-label={entry.label}
            title={`${entry.label} · ${entry.key}`}
            data-slot={index + 1}
          >
            {entry.icon}
          </button>
        </span>
      ))}
      {!props.readOnly ? (
        <span
          className="toolrail__item"
          data-over={over === 'more'}
          onDragOver={(event) => allow(event, 'more')}
          onDragLeave={() => setOver(null)}
          onDrop={(event) => dropOnMore(event, null)}
        >
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
              {extraEntries.length === 0 ? <div className="toolmenu__empty">Перетащите сюда инструмент</div> : null}
              {extraEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="toolmenu__row"
                  draggable
                  onDragStart={(event) => startDrag(event, entry.id)}
                  onDragEnd={() => setOver(null)}
                  data-over={over === `extra:${entry.id}`}
                  onDragOver={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    setOver(`extra:${entry.id}`)
                  }}
                  onDrop={(event) => dropOnMore(event, entry.id)}
                >
                  <button
                    type="button"
                    className="toolmenu__item"
                    data-active={props.tool === entry.id}
                    onClick={() => {
                      props.onMore(false)
                      props.onTool(entry.id)
                    }}
                  >
                    {entry.icon}
                    <span>{entry.label}</span>
                    {entry.key ? <span className="toolmenu__key">{entry.key}</span> : null}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </span>
      ) : null}
    </div>
  )
})
