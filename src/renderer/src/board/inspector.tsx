import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, Trash2, X } from 'lucide-react'
import type { BoardItem, TableItem } from '@shared/types'
import { Switch } from '../components/ui'
import { countNumber } from '@shared/util'
import { useApp } from '../lib/store'
import { applyPlainEdit, richHtmlFromPlain } from './richHtml'
import { kindLabel } from './itemKinds'

export interface InspectorProps {
  items: BoardItem[]
  docTitle: string
  onClose: () => void
  onPatch: (id: string, patch: Partial<BoardItem>) => void
  onPatchMany: (ids: string[], patch: Partial<BoardItem>) => void
  onPatchLive: (ids: string[], patch: Partial<BoardItem>) => void
  onDelete: (ids: string[]) => void
  onDuplicate: (ids: string[]) => void
  onNavigateTo: (id: string) => void
}

const PALETTE = [
  '#1a1a1a',
  '#7f1d1d',
  '#1d4ed8',
  '#15803d',
  '#b45309',
  '#6b21a8',
  '#0f766e',
  '#ffffff',
  '#f4f4f5',
  '#fff9b1',
  '#ffd8b1',
  '#cfe8fb'
]

const TEXT_PALETTE = ['#1a1a1a', '#ffffff', '#7f1d1d', '#1d4ed8', '#15803d', '#b45309']

const STICKY_PALETTE = ['#fff9b1', '#ffd8b1', '#cfe8fb', '#d9f2e3', '#f3e0ff']

function hasRichText(content: string): boolean {
  return /<(?:b|strong|i|em|u|s|strike|font|span|a|mark|code)\b|\bstyle=/i.test(content)
}

function strokeColorOf(item: BoardItem): string | null {
  if (item.kind === 'path' || item.kind === 'connector') return item.color
  if (item.kind === 'shape') return item.borderColor
  return null
}

function fillColorOf(item: BoardItem): string | null {
  if (item.kind === 'sticky') return item.color
  return null
}

function textColorOf(item: BoardItem): string | null {
  if (item.kind === 'text') return item.color
  if (item.kind === 'shape') return item.textColor ?? null
  if (item.kind === 'sticky') return item.textColor ?? null
  return null
}

function lineWidthOf(item: BoardItem): number | null {
  if (item.kind === 'path' || item.kind === 'connector') return item.lineWidth
  if (item.kind === 'shape') return item.borderWidth
  return null
}

function opacityOf(item: BoardItem): number | null {
  if (item.kind === 'path' || item.kind === 'shape' || item.kind === 'image') return item.opacity ?? 1
  return null
}

function fontSizeOf(item: BoardItem): number | null {
  if (item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape') return item.fontSize
  return null
}

function alignOf(item: BoardItem): 'left' | 'center' | 'right' | null {
  if (item.kind === 'text') return item.align
  if (item.kind === 'sticky' || item.kind === 'shape') return item.textAlign
  return null
}

function ColorRow(props: {
  label: string
  value: string | null
  colors: string[]
  onPick: (color: string) => void
}): ReactNode {
  const value = props.value
  if (!value) return null
  return (
    <div className="inspector__block">
      <div className="inspector__label">{props.label}</div>
      <div className="inspector__colors">
        {props.colors.map((color) => (
          <button
            key={color}
            type="button"
            className="inspector__color"
            aria-label={`${props.label}: ${color}`}
            title={color}
            onClick={() => props.onPick(color)}
            style={{
              background: color,
              border: value.toLowerCase() === color.toLowerCase() ? '2px solid var(--text)' : '1px solid var(--border)'
            }}
          />
        ))}
        <label className="inspector__color inspector__color--custom" title="Свой цвет">
          <input
            type="color"
            value={value}
            onChange={(event) => props.onPick(event.target.value)}
            aria-label={`${props.label}: свой цвет`}
          />
        </label>
      </div>
    </div>
  )
}

function SliderRow(props: {
  label: string
  value: number | null
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}): ReactNode {
  if (props.value === null) return null
  return (
    <label className="inspector__slider">
      <span className="inspector__label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <span className="inspector__value">
        {Math.round(props.value * 100) / 100}
        {props.suffix ?? ''}
      </span>
    </label>
  )
}

function TableControls(props: { item: TableItem; onPatch: (patch: Partial<TableItem>) => void }): ReactNode {
  const { item } = props
  const columns = Math.max(1, item.columns)
  const rows = Math.max(1, item.rows)
  const columnWidths = Array.from({ length: columns }, (_, index) => Math.max(60, item.columnWidths[index] ?? 180))
  const rowHeights = Array.from({ length: rows }, (_, index) => Math.max(28, item.rowHeights[index] ?? 44))
  const totalWidth = columnWidths.reduce((sum, value) => sum + value, 0)
  const totalHeight = rowHeights.reduce((sum, value) => sum + value, 0)

  return (
    <div className="inspector__block">
      <div className="inspector__label">Строки и столбцы</div>
      <div className="inspector__row">
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            const cells = [...item.cells]
            cells.splice(rows * columns, 0, '')
            props.onPatch({
              rows: rows + 1,
              rowHeights: [...rowHeights, 44],
              cells,
              w: totalWidth,
              h: totalHeight + 44
            })
          }}
        >
          + строка
        </button>
        <button
          type="button"
          className="btn btn--sm"
          onClick={() => {
            const cells: string[] = []
            for (let row = 0; row < rows; row += 1) {
              for (let column = 0; column < columns; column += 1) cells.push(item.cells[row * columns + column] ?? '')
              cells.push('')
            }
            props.onPatch({
              columns: columns + 1,
              columnWidths: [...columnWidths, 180],
              cells,
              w: totalWidth + 180,
              h: totalHeight
            })
          }}
        >
          + столбец
        </button>
      </div>
      <div className="inspector__row">
        {rows > 1 ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              const cells = [...item.cells]
              cells.splice((rows - 1) * columns, columns)
              props.onPatch({
                rows: rows - 1,
                rowHeights: rowHeights.slice(0, rows - 1),
                cells,
                w: totalWidth,
                h: totalHeight - rowHeights[rows - 1]
              })
            }}
          >
            − последняя строка
          </button>
        ) : null}
        {columns > 1 ? (
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              const cells: string[] = []
              for (let row = 0; row < rows; row += 1) {
                for (let column = 0; column < columns; column += 1) {
                  if (column === columns - 1) continue
                  cells.push(item.cells[row * columns + column] ?? '')
                }
              }
              props.onPatch({
                columns: columns - 1,
                columnWidths: columnWidths.slice(0, columns - 1),
                cells,
                w: totalWidth - columnWidths[columns - 1],
                h: totalHeight
              })
            }}
          >
            − последний столбец
          </button>
        ) : null}
      </div>
      <div className="field__hint">
        {countNumber(rows, ['строка', 'строки', 'строк'])} · {countNumber(columns, ['столбец', 'столбца', 'столбцов'])}. Щёлкните по ячейке, чтобы вписать текст.
      </div>
    </div>
  )
}

const field = (label: string, value: string): ReactNode => (
  <div>
    <div className="inspector__label">{label}</div>
    <div className="inspector__value">{value}</div>
  </div>
)

const rounded = (value: number): number => Math.round(value * 100) / 100

function idsOf(items: BoardItem[], kinds: BoardItem['kind'][]): string[] {
  return items.filter((item) => kinds.includes(item.kind)).map((item) => item.id)
}

function NumberField(props: {
  label: string
  value: number
  onCommit: (value: number) => void
}): ReactNode {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (): void => {
    const text = draft?.trim() ?? ''
    setDraft(null)
    if (!text) return
    const parsed = Number(text)
    if (Number.isFinite(parsed) && rounded(parsed) !== props.value) props.onCommit(parsed)
  }
  return (
    <label className="inspector__number">
      <span className="inspector__label">{props.label}</span>
      <input
        className="input"
        type="number"
        value={draft ?? rounded(props.value)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            setDraft(null)
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

export function Inspector(props: InspectorProps): ReactNode {
  const toast = useApp((state) => state.toast)
  const richWarnedId = useRef('')
  const { items } = props
  if (!items.length) return null
  const single = items.length === 1 ? items[0] : null
  const bounds = items.reduce(
    (acc, item) => ({
      x: Math.min(acc.x, item.x),
      y: Math.min(acc.y, item.y),
      w: Math.max(acc.w, item.x + item.w) - Math.min(acc.x, item.x),
      h: Math.max(acc.h, item.y + item.h) - Math.min(acc.y, item.y)
    }),
    { x: Infinity, y: Infinity, w: 0, h: 0 }
  )

  return (
    <div className="inspector">
      <div className="inspector__title">
        <span>{single ? kindLabel(single.kind) : `Выбрано: ${items.length}`}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={props.onClose} aria-label="Закрыть панель">
          <X size={14} />
        </button>
      </div>

      {single ? (
        <div className="stack">
          <div className="inspector__grid">
            <NumberField label="X" value={single.x} onCommit={(value) => props.onPatch(single.id, { x: Math.round(value) } as Partial<BoardItem>)} />
            <NumberField label="Y" value={single.y} onCommit={(value) => props.onPatch(single.id, { y: Math.round(value) } as Partial<BoardItem>)} />
            <NumberField
              label="Ширина"
              value={single.w}
              onCommit={(value) => props.onPatch(single.id, { w: Math.max(1, Math.round(value)) } as Partial<BoardItem>)}
            />
            <NumberField
              label="Высота"
              value={single.h}
              onCommit={(value) => props.onPatch(single.id, { h: Math.max(1, Math.round(value)) } as Partial<BoardItem>)}
            />
            <NumberField
              label="Поворот"
              value={single.rotation}
              onCommit={(value) => props.onPatch(single.id, { rotation: Math.round(value) } as Partial<BoardItem>)}
            />
            {field('Слой', String(single.z + 1))}
          </div>

          {single.kind === 'sticky' || single.kind === 'text' || single.kind === 'shape' ? (
            <label className="field field--tight">
              <span className="field__label">Текст</span>
              <textarea
                className="textarea textarea--compact"
                value={'plain' in single ? single.plain : ''}
                onChange={(event) => {
                  const before = 'content' in single ? (single.content ?? '') : ''
                  const kept = applyPlainEdit(before, event.target.value)
                  if (!kept && hasRichText(before) && richWarnedId.current !== single.id) {
                    richWarnedId.current = single.id
                    toast('Жирный, курсив и цвет в этом поле не сохраняются. Правьте текст двойным щелчком по объекту', 'text')
                  }
                  const html = kept ?? richHtmlFromPlain(event.target.value)
                  props.onPatchLive([single.id], { content: html, plain: event.target.value } as Partial<BoardItem>)
                }}
              />
            </label>
          ) : null}

          <ColorRow
            label="Цвет линии"
            value={strokeColorOf(single)}
            colors={PALETTE}
            onPick={(color) => {
              if (single.kind === 'path' || single.kind === 'connector') {
                props.onPatch(single.id, { color } as Partial<BoardItem>)
              } else if (single.kind === 'shape') {
                props.onPatch(single.id, { borderColor: color } as Partial<BoardItem>)
              }
            }}
          />

          {single.kind === 'sticky' ? (
            <ColorRow
              label="Заливка"
              value={fillColorOf(single)}
              colors={STICKY_PALETTE}
              onPick={(color) => {
                props.onPatch(single.id, { color } as Partial<BoardItem>)
              }}
            />
          ) : null}

          <ColorRow
            label="Цвет текста"
            value={textColorOf(single)}
            colors={TEXT_PALETTE}
            onPick={(color) => {
              if (single.kind === 'text') props.onPatch(single.id, { color } as Partial<BoardItem>)
              else if (single.kind === 'shape') props.onPatch(single.id, { textColor: color } as Partial<BoardItem>)
              else if (single.kind === 'sticky') props.onPatch(single.id, { textColor: color } as Partial<BoardItem>)
            }}
          />

          <SliderRow
            label="Толщина"
            value={lineWidthOf(single)}
            min={1}
            max={24}
            onChange={(value) => {
              if (single.kind === 'path' || single.kind === 'connector') {
                props.onPatchLive([single.id], { lineWidth: value } as Partial<BoardItem>)
              } else if (single.kind === 'shape') {
                props.onPatchLive([single.id], { borderWidth: value } as Partial<BoardItem>)
              }
            }}
          />

          <SliderRow
            label="Прозрачность"
            value={opacityOf(single)}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(value) => props.onPatchLive([single.id], { opacity: value } as Partial<BoardItem>)}
          />

          <SliderRow
            label="Размер шрифта"
            value={fontSizeOf(single)}
            min={8}
            max={72}
            onChange={(value) => props.onPatchLive([single.id], { fontSize: Math.round(value) } as Partial<BoardItem>)}
          />

          {alignOf(single) ? (
            <div className="inspector__block">
              <div className="inspector__label">Выравнивание текста</div>
              <div className="inspector__row">
                {(['left', 'center', 'right'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="btn btn--sm"
                    data-active={alignOf(single) === value}
                    onClick={() => {
                      if (single.kind === 'text') props.onPatch(single.id, { align: value } as Partial<BoardItem>)
                      else if (single.kind === 'sticky' || single.kind === 'shape') {
                        props.onPatch(single.id, { textAlign: value } as Partial<BoardItem>)
                      }
                    }}
                  >
                    {value === 'left' ? 'По левому краю' : value === 'center' ? 'По центру' : 'По правому краю'}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {single.kind === 'table' ? (
            <TableControls item={single} onPatch={(patch) => props.onPatch(single.id, patch as Partial<BoardItem>)} />
          ) : null}

          {single.kind === 'frame' ? (
            <label className="field field--tight">
              <span className="field__label">Название рамки</span>
              <input
                className="input"
                value={single.title}
                onChange={(event) => props.onPatchLive([single.id], { title: event.target.value } as Partial<BoardItem>)}
              />
            </label>
          ) : null}

          {single.kind === 'image' ? (
            <div className="field__hint">
              {single.asset?.local
                ? `Файл: ${single.asset.file} · ${Math.round((single.asset.bytes / 1024) * 10) / 10} КБ`
                : 'Файл не сохранён локально — при импорте не удалось скачать'}
            </div>
          ) : null}

          {single.kind === 'connector' ? (
            <div className="field__hint">
              Связь: {single.shape} · {single.startStroke} → {single.endStroke}
              {single.startItemId ? ' · привязана к элементам' : ''}
            </div>
          ) : null}

          {single.kind === 'unknown' ? (
            <div className="field__hint">
              Объект типа «{single.label ?? single.sourceType}» не поддерживается для рисования. Исходные данные
              сохранены в документе.
            </div>
          ) : null}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => props.onDuplicate([single.id])}>
              <Copy size={13} /> Дублировать
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => props.onDelete([single.id])}>
              <Trash2 size={13} /> Удалить
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="inspector__grid">
            {field('Объектов', String(items.length))}
            {field('Габариты', `${Math.round(bounds.w)} × ${Math.round(bounds.h)}`)}
          </div>

          <ColorRow
            label="Цвет линии"
            value={items.map(strokeColorOf).find((value) => value !== null) ?? null}
            colors={PALETTE}
            onPick={(color) => {
              props.onPatchMany(idsOf(items, ['path', 'connector']), { color } as Partial<BoardItem>)
              props.onPatchMany(idsOf(items, ['shape']), { borderColor: color } as Partial<BoardItem>)
            }}
          />

          {items.some((item) => item.kind === 'sticky') ? (
            <ColorRow
              label="Заливка"
              value={items.map(fillColorOf).find((value) => value !== null) ?? null}
              colors={STICKY_PALETTE}
              onPick={(color) => {
                props.onPatchMany(idsOf(items, ['sticky']), { color } as Partial<BoardItem>)
              }}
            />
          ) : null}

          <ColorRow
            label="Цвет текста"
            value={items.map(textColorOf).find((value) => value !== null) ?? null}
            colors={TEXT_PALETTE}
            onPick={(color) => {
              props.onPatchMany(idsOf(items, ['text']), { color } as Partial<BoardItem>)
              props.onPatchMany(idsOf(items, ['shape', 'sticky']), { textColor: color } as Partial<BoardItem>)
            }}
          />

          <SliderRow
            label="Толщина"
            value={items.map(lineWidthOf).find((value) => value !== null) ?? null}
            min={1}
            max={24}
            onChange={(value) => {
              props.onPatchLive(idsOf(items, ['path', 'connector']), { lineWidth: value } as Partial<BoardItem>)
              props.onPatchLive(idsOf(items, ['shape']), { borderWidth: value } as Partial<BoardItem>)
            }}
          />

          <SliderRow
            label="Прозрачность"
            value={items.map(opacityOf).find((value) => value !== null) ?? null}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(value) => {
              props.onPatchLive(idsOf(items, ['path', 'shape', 'image']), { opacity: value } as Partial<BoardItem>)
            }}
          />

          <SliderRow
            label="Размер шрифта"
            value={items.map(fontSizeOf).find((value) => value !== null) ?? null}
            min={8}
            max={72}
            onChange={(value) => {
              props.onPatchLive(idsOf(items, ['text', 'sticky', 'shape']), { fontSize: Math.round(value) } as Partial<BoardItem>)
            }}
          />

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn--sm" onClick={() => props.onDuplicate(items.map((i) => i.id))}>
              <Copy size={13} /> Дублировать
            </button>
            <button type="button" className="btn btn--sm btn--danger" onClick={() => props.onDelete(items.map((i) => i.id))}>
              <Trash2 size={13} /> Удалить
            </button>
          </div>
        </div>
      )}

      {single?.parentId ? (
        <button
          type="button"
          className="btn btn--sm btn--block btn--gap"
          onClick={() => props.onNavigateTo(single.parentId!)}
        >
          К рамке
        </button>
      ) : null}
    </div>
  )
}

export function ReadOnlyHint(props: { on: boolean; onChange: (value: boolean) => void }): ReactNode {
  return (
    <div className="toolgroup toolgroup--labeled">
      <span className="note">Только просмотр</span>
      <Switch value={props.on} onChange={props.onChange} label="Режим просмотра" />
    </div>
  )
}