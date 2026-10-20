import type { ReactNode } from 'react'
import { Copy, Trash2, X } from 'lucide-react'
import type { BoardItem, TableItem } from '@shared/types'
import { Switch } from '../components/ui'

export interface InspectorProps {
  items: BoardItem[]
  docTitle: string
  onClose: () => void
  onPatch: (id: string, patch: Partial<BoardItem>) => void
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

function strokeColorOf(item: BoardItem): string | null {
  if (item.kind === 'path' || item.kind === 'connector') return item.color
  if (item.kind === 'shape') return item.borderColor
  return null
}

function fillColorOf(item: BoardItem): string | null {
  if (item.kind === 'shape') return item.fillColor
  if (item.kind === 'sticky') return item.color
  return null
}

function textColorOf(item: BoardItem): string | null {
  if (item.kind === 'text') return item.color
  if (item.kind === 'shape') return item.textColor ?? null
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
            − строка
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
            − столбец
          </button>
        ) : null}
      </div>
      <div className="field__hint">
        Строка: {rows} · Столбцов: {columns}. Щёлкните по ячейке, чтобы вписать текст.
      </div>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  sticky: 'Стикер',
  text: 'Текст',
  shape: 'Фигура',
  image: 'Изображение',
  frame: 'Рамка',
  connector: 'Связь',
  card: 'Карточка',
  embed: 'Вставка',
  video: 'Видео',
  table: 'Таблица',
  vote: 'Голосование',
  group: 'Группа',
  tag: 'Метка',
  document: 'Документ',
  app_card: 'Приложение',
  code: 'Код',
  comment: 'Комментарий',
  unknown: 'Неизвестный объект'
}

const field = (label: string, value: string): ReactNode => (
  <div>
    <div className="inspector__label">{label}</div>
    <div className="inspector__value">{value}</div>
  </div>
)

const numberField = (label: string, value: number, onChange: (value: number) => void): ReactNode => (
  <label className="inspector__number">
    <span className="inspector__label">{label}</span>
    <input
      className="input"
      type="number"
      value={Math.round(value * 100) / 100}
      onChange={(event) => {
        const parsed = Number(event.target.value)
        if (Number.isFinite(parsed)) onChange(parsed)
      }}
    />
  </label>
)

export function Inspector(props: InspectorProps): ReactNode {
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
        <span>{single ? KIND_LABEL[single.kind] ?? single.kind : `Выбрано: ${items.length}`}</span>
        <span style={{ marginLeft: 'auto' }} />
        <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={props.onClose} aria-label="Закрыть панель">
          <X size={14} />
        </button>
      </div>

      {single ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="inspector__grid">
            {numberField('X', single.x, (value) => props.onPatch(single.id, { x: Math.round(value) } as Partial<BoardItem>))}
            {numberField('Y', single.y, (value) => props.onPatch(single.id, { y: Math.round(value) } as Partial<BoardItem>))}
            {numberField('Ширина', single.w, (value) =>
              props.onPatch(single.id, { w: Math.max(1, Math.round(value)) } as Partial<BoardItem>)
            )}
            {numberField('Высота', single.h, (value) =>
              props.onPatch(single.id, { h: Math.max(1, Math.round(value)) } as Partial<BoardItem>)
            )}
            {numberField('Поворот', single.rotation, (value) =>
              props.onPatch(single.id, { rotation: Math.round(value) } as Partial<BoardItem>)
            )}
            {field('Слой', String(single.z + 1))}
          </div>

          {single.kind === 'sticky' || single.kind === 'text' || single.kind === 'shape' ? (
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field__label">Текст</span>
              <textarea
                className="textarea"
                style={{ minHeight: 70, fontSize: 12.5 }}
                value={'plain' in single ? single.plain : ''}
                onChange={(event) => {
                  const html = event.target.value
                    .split(/\n{2,}/)
                    .map((chunk) => `<p>${chunk.replace(/\n/g, '<br>')}</p>`)
                    .join('')
                  props.onPatch(single.id, { content: html, plain: event.target.value } as Partial<BoardItem>)
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

          <ColorRow
            label="Заливка"
            value={fillColorOf(single)}
            colors={PALETTE}
            onPick={(color) => {
              if (single.kind === 'shape') props.onPatch(single.id, { fillColor: color } as Partial<BoardItem>)
              else if (single.kind === 'sticky') props.onPatch(single.id, { color } as Partial<BoardItem>)
            }}
          />

          <ColorRow
            label="Цвет текста"
            value={textColorOf(single)}
            colors={TEXT_PALETTE}
            onPick={(color) => {
              if (single.kind === 'text') props.onPatch(single.id, { color } as Partial<BoardItem>)
              else if (single.kind === 'shape') props.onPatch(single.id, { textColor: color } as Partial<BoardItem>)
            }}
          />

          <SliderRow
            label="Толщина"
            value={lineWidthOf(single)}
            min={1}
            max={24}
            onChange={(value) => {
              if (single.kind === 'path' || single.kind === 'connector') {
                props.onPatch(single.id, { lineWidth: value } as Partial<BoardItem>)
              } else if (single.kind === 'shape') {
                props.onPatch(single.id, { borderWidth: value } as Partial<BoardItem>)
              }
            }}
          />

          <SliderRow
            label="Прозрачность"
            value={opacityOf(single)}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(value) => props.onPatch(single.id, { opacity: value } as Partial<BoardItem>)}
          />

          <SliderRow
            label="Размер шрифта"
            value={fontSizeOf(single)}
            min={8}
            max={72}
            onChange={(value) => props.onPatch(single.id, { fontSize: Math.round(value) } as Partial<BoardItem>)}
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
            <label className="field" style={{ marginBottom: 0 }}>
              <span className="field__label">Название рамки</span>
              <input
                className="input"
                value={single.title}
                onChange={(event) => props.onPatch(single.id, { title: event.target.value } as Partial<BoardItem>)}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="inspector__grid">
            {field('Объектов', String(items.length))}
            {field('Габариты', `${Math.round(bounds.w)} × ${Math.round(bounds.h)}`)}
          </div>

          <ColorRow
            label="Цвет линии"
            value={items.map(strokeColorOf).find((value) => value !== null) ?? null}
            colors={PALETTE}
            onPick={(color) => {
              for (const item of items) {
                if (item.kind === 'path' || item.kind === 'connector') {
                  props.onPatch(item.id, { color } as Partial<BoardItem>)
                } else if (item.kind === 'shape') {
                  props.onPatch(item.id, { borderColor: color } as Partial<BoardItem>)
                }
              }
            }}
          />

          <ColorRow
            label="Заливка"
            value={items.map(fillColorOf).find((value) => value !== null) ?? null}
            colors={PALETTE}
            onPick={(color) => {
              for (const item of items) {
                if (item.kind === 'shape') props.onPatch(item.id, { fillColor: color } as Partial<BoardItem>)
                else if (item.kind === 'sticky') props.onPatch(item.id, { color } as Partial<BoardItem>)
              }
            }}
          />

          <ColorRow
            label="Цвет текста"
            value={items.map(textColorOf).find((value) => value !== null) ?? null}
            colors={TEXT_PALETTE}
            onPick={(color) => {
              for (const item of items) {
                if (item.kind === 'text') props.onPatch(item.id, { color } as Partial<BoardItem>)
                else if (item.kind === 'shape') props.onPatch(item.id, { textColor: color } as Partial<BoardItem>)
              }
            }}
          />

          <SliderRow
            label="Толщина"
            value={items.map(lineWidthOf).find((value) => value !== null) ?? null}
            min={1}
            max={24}
            onChange={(value) => {
              for (const item of items) {
                if (item.kind === 'path' || item.kind === 'connector') {
                  props.onPatch(item.id, { lineWidth: value } as Partial<BoardItem>)
                } else if (item.kind === 'shape') {
                  props.onPatch(item.id, { borderWidth: value } as Partial<BoardItem>)
                }
              }
            }}
          />

          <SliderRow
            label="Прозрачность"
            value={items.map(opacityOf).find((value) => value !== null) ?? null}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(value) => {
              for (const item of items) {
                if (item.kind === 'path' || item.kind === 'shape' || item.kind === 'image') {
                  props.onPatch(item.id, { opacity: value } as Partial<BoardItem>)
                }
              }
            }}
          />

          <SliderRow
            label="Размер шрифта"
            value={items.map(fontSizeOf).find((value) => value !== null) ?? null}
            min={8}
            max={72}
            onChange={(value) => {
              for (const item of items) {
                if (item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape') {
                  props.onPatch(item.id, { fontSize: Math.round(value) } as Partial<BoardItem>)
                }
              }
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
          className="btn btn--sm btn--block"
          style={{ marginTop: 10 }}
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
    <div className="toolgroup" style={{ paddingLeft: 10, paddingRight: 10, gap: 8 }}>
      <span style={{ fontSize: 12 }}>Только просмотр</span>
      <Switch value={props.on} onChange={props.onChange} label="Режим просмотра" />
    </div>
  )
}