import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Box,
  BringToFront,
  Code2,
  Eye,
  FileText,
  Frame,
  Image as ImageIcon,
  LineChart,
  Link2,
  ListFilter,
  MessageSquare,
  PenLine,
  Search,
  SendToBack,
  Shapes,
  StickyNote,
  Table,
  Trash2,
  Type,
  Unlink,
  Vote,
  X
} from 'lucide-react'
import type { BoardItem, ItemKind } from '@shared/types'

const KIND_META: Record<ItemKind, { label: string; icon: ReactNode }> = {
  sticky: { label: 'Стикер', icon: <StickyNote size={14} /> },
  text: { label: 'Текст', icon: <Type size={14} /> },
  shape: { label: 'Фигура', icon: <Shapes size={14} /> },
  image: { label: 'Картинка', icon: <ImageIcon size={14} /> },
  frame: { label: 'Рамка', icon: <Frame size={14} /> },
  connector: { label: 'Связь', icon: <Link2 size={14} /> },
  card: { label: 'Карточка', icon: <Shapes size={14} /> },
  embed: { label: 'Вставка', icon: <Code2 size={14} /> },
  video: { label: 'Видео', icon: <FileText size={14} /> },
  table: { label: 'Таблица', icon: <Table size={14} /> },
  vote: { label: 'Голосование', icon: <Vote size={14} /> },
  group: { label: 'Группа', icon: <Frame size={14} /> },
  tag: { label: 'Метка', icon: <Shapes size={14} /> },
  document: { label: 'Документ', icon: <FileText size={14} /> },
  app_card: { label: 'Приложение', icon: <Box size={14} /> },
  code: { label: 'Код', icon: <Code2 size={14} /> },
  path: { label: 'Рисунок', icon: <PenLine size={14} /> },
  comment: { label: 'Комментарий', icon: <MessageSquare size={14} /> },
  solid: { label: '3D-фигура', icon: <Box size={14} /> },
  graph: { label: 'Координатная плоскость', icon: <LineChart size={14} /> },
  unknown: { label: 'Не распознано', icon: <Unlink size={14} /> }
}

export const UNSUPPORTED_KINDS: ItemKind[] = [
  'unknown',
  'embed',
  'video',
  'table',
  'vote',
  'app_card',
  'code',
  'document',
  'comment',
  'tag',
  'group',
  'card'
]

export function isUnsupported(item: BoardItem): boolean {
  return UNSUPPORTED_KINDS.includes(item.kind)
}

export function kindLabel(kind: ItemKind): string {
  return KIND_META[kind]?.label ?? 'Объект'
}

function kindIcon(kind: ItemKind): ReactNode {
  return KIND_META[kind]?.icon ?? <Shapes size={14} />
}

function itemTitle(item: BoardItem, index: number): string {
  const plain = (item as { plain?: string }).plain?.trim()
  if (plain) return plain.length > 42 ? `${plain.slice(0, 42)}…` : plain
  const label = item.sourceType?.trim()
  if (label) return label.length > 42 ? `${label.slice(0, 42)}…` : label
  return `${kindLabel(item.kind)} ${index + 1}`
}

export interface ObjectsPanelProps {
  items: BoardItem[]
  selection: Set<string>
  onSelect: (ids: string[], additive: boolean) => void
  onFocus: (id: string) => void
  onDelete: (ids: string[]) => void
  onToggleLock: (ids: string[]) => void
  onConvert: (ids: string[]) => void
  onOrder: (ids: string[], action: 'front' | 'back' | 'up' | 'down') => void
  onClose: () => void
}

export function ObjectsPanel(props: ObjectsPanelProps): ReactNode {
  const [tab, setTab] = useState<'all' | 'unsupported'>('all')
  const [query, setQuery] = useState('')
  const list = useMemo(() => {
    const base = tab === 'unsupported' ? props.items.filter(isUnsupported) : props.items
    const needle = query.trim().toLowerCase()
    const sorted = [...base].sort((left, right) => right.z - left.z)
    if (!needle) return sorted
    return sorted.filter((item) => {
      const plain = (item as { plain?: string }).plain?.toLowerCase() ?? ''
      return plain.includes(needle) || (item.sourceType ?? '').toLowerCase().includes(needle) || kindLabel(item.kind).toLowerCase().includes(needle)
    })
  }, [props.items, tab, query])

  const unsupportedCount = useMemo(() => props.items.filter(isUnsupported).length, [props.items])

  return (
    <aside className="objpanel">
      <div className="objpanel__head">
        <button
          type="button"
          className="objpanel__tab"
          data-active={tab === 'all'}
          onClick={() => setTab('all')}
        >
          <ListFilter size={14} /> Объекты
        </button>
        <button
          type="button"
          className="objpanel__tab"
          data-active={tab === 'unsupported'}
          onClick={() => setTab('unsupported')}
        >
          <Unlink size={14} /> Не поддерживается{unsupportedCount ? ` · ${unsupportedCount}` : ''}
        </button>
        <button type="button" className="objpanel__close" onClick={props.onClose} title="Закрыть панель объектов">
          <X size={15} />
        </button>
      </div>
      <label className="objpanel__search">
        <Search size={14} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по объектам" />
      </label>
      {tab === 'unsupported' ? (
        <div className="objpanel__note">
          Эти объекты не умеет рисовать приложение. Их можно показать на доске, заменить простой фигурой или удалить.
        </div>
      ) : null}
      <div className="objpanel__list">
        {list.length === 0 ? (
          <div className="objpanel__empty">{tab === 'unsupported' ? 'Неподдерживаемых объектов нет' : 'Ничего не найдено'}</div>
        ) : null}
        {list.map((item) => {
          const index = props.items.indexOf(item)
          const selected = props.selection.has(item.id)
          return (
            <div
              key={item.id}
              className={selected ? 'objrow objrow--active' : 'objrow'}
              onClick={(event) => props.onSelect([item.id], event.shiftKey || event.ctrlKey || event.metaKey)}
              onDoubleClick={() => props.onFocus(item.id)}
            >
              <span className="objrow__icon">{kindIcon(item.kind)}</span>
              <span className="objrow__main">
                <span className="objrow__title truncate">{itemTitle(item, index)}</span>
                <span className="objrow__meta">
                  {kindLabel(item.kind)}
                  {item.sourceType ? ` · ${item.sourceType}` : ''}
                </span>
              </span>
              <span className="objrow__tools">
                <button type="button" title="Показать на доске" onClick={(event) => { event.stopPropagation(); props.onFocus(item.id) }}>
                  <Eye size={13} />
                </button>
                <button type="button" title="Выше" onClick={(event) => { event.stopPropagation(); props.onOrder([item.id], 'up') }}>
                  <ArrowUp size={13} />
                </button>
                <button type="button" title="Ниже" onClick={(event) => { event.stopPropagation(); props.onOrder([item.id], 'down') }}>
                  <ArrowDown size={13} />
                </button>
                <button type="button" title="На передний план" onClick={(event) => { event.stopPropagation(); props.onOrder([item.id], 'front') }}>
                  <BringToFront size={13} />
                </button>
                <button type="button" title="На задний план" onClick={(event) => { event.stopPropagation(); props.onOrder([item.id], 'back') }}>
                  <SendToBack size={13} />
                </button>
                {item.locked ? (
                  <button type="button" title="Разблокировать" onClick={(event) => { event.stopPropagation(); props.onToggleLock([item.id]) }}>
                    <LockGlyph open />
                  </button>
                ) : null}
                {tab === 'unsupported' ? (
                  <button type="button" title="Заменить простой фигурой" onClick={(event) => { event.stopPropagation(); props.onConvert([item.id]) }}>
                    <Shapes size={13} />
                  </button>
                ) : null}
                <button type="button" title="Удалить" onClick={(event) => { event.stopPropagation(); props.onDelete([item.id]) }}>
                  <Trash2 size={13} />
                </button>
              </span>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function LockGlyph(props: { open: boolean }): ReactNode {
  return props.open ? <Unlink size={13} /> : <Lock2Glyph />
}

function Lock2Glyph(): ReactNode {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </svg>
  )
}