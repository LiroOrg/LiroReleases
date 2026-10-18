import type { ReactNode } from 'react'
import { Copy, Trash2, X } from 'lucide-react'
import type { BoardItem } from '@shared/types'
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
            {field('X', Math.round(single.x).toLocaleString('ru-RU'))}
            {field('Y', Math.round(single.y).toLocaleString('ru-RU'))}
            {field('Ширина', Math.round(single.w).toLocaleString('ru-RU'))}
            {field('Высота', Math.round(single.h).toLocaleString('ru-RU'))}
            {field('Поворот', `${Math.round(single.rotation)}°`)}
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

          {single.kind === 'sticky' ? (
            <div>
              <div className="inspector__label" style={{ marginBottom: 6 }}>
                Цвет
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['#fff9b1', '#ffd8b1', '#ffc0cb', '#d1f0c0', '#cfe8fb', '#e2d4f7', '#e4e4e7', '#1a1a1a'].map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    onClick={() => props.onPatch(single.id, { color } as Partial<BoardItem>)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 8,
                      background: color,
                      border: single.color === color ? '2px solid var(--text)' : '1px solid var(--border)',
                      cursor: 'pointer'
                    }}
                  />
                ))}
              </div>
            </div>
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