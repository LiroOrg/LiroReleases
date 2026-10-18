import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { BoardDoc, ItemKind } from '@shared/types'
import { formatBytes, formatDate, formatNumber } from '@shared/util'
import { kindLabel } from './objectsPanel'

const SOURCE_LABEL: Record<string, string> = {
  'server-api': 'Загрузка с сервера',
  'page-capture': 'Сбор страницы',
  file: 'Файл',
  demo: 'Демонстрационная доска'
}

const field = (label: string, value: string): ReactNode => (
  <div>
    <div className="inspector__label">{label}</div>
    <div className="inspector__value">{value}</div>
  </div>
)

export function BoardDetails(props: { doc: BoardDoc; onClose: () => void }): ReactNode {
  const { doc } = props
  const stats = doc.stats
  const kinds = Object.entries(stats.byKind ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const saved = Object.values(doc.assets ?? {}).filter((asset) => asset.local).length
  const remote = Object.keys(doc.assets ?? {}).length - saved

  return (
    <div className="inspector boarddetails">
      <div className="inspector__title">
        <span>Подробнее о доске</span>
        <span style={{ marginLeft: 'auto' }} />
        <button
          type="button"
          className="btn btn--ghost btn--icon btn--sm"
          onClick={props.onClose}
          aria-label="Закрыть подробности"
        >
          <X size={14} />
        </button>
      </div>

      <div className="boarddetails__block">
        <div className="inspector__grid">
          {field('Объектов', formatNumber(stats.items))}
          {field('В исходнике', formatNumber(doc.source.itemCount ?? stats.items))}
          {field('Размер доски', `${formatNumber(Math.round(doc.bounds.width))} × ${formatNumber(Math.round(doc.bounds.height))}`)}
          {field('Символов текста', formatNumber(stats.plainChars))}
          {field('Картинок', formatNumber(stats.images))}
          {field('Места под файлы', formatBytes(stats.assetsBytes))}
        </div>
      </div>

      <div className="boarddetails__block">
        <div className="inspector__label">Состав</div>
        <div className="boarddetails__bars">
          {kinds.map(([kind, count]) => (
            <div key={kind} className="boarddetails__bar">
              <span className="boarddetails__name truncate">{kindLabel(kind as ItemKind)}</span>
              <span className="boarddetails__track">
                <span
                  className="boarddetails__fill"
                  style={{ width: `${Math.max(2, Math.round((count / Math.max(1, stats.items)) * 100))}%` }}
                />
              </span>
              <span className="boarddetails__count">{formatNumber(count)}</span>
            </div>
          ))}
          {kinds.length === 0 ? <div className="field__hint">Объектов нет</div> : null}
        </div>
      </div>

      <div className="boarddetails__block">
        <div className="inspector__label">Файлы</div>
        <div className="boarddetails__files">
          <span>Сохранено на диске: {formatNumber(saved)}</span>
          {remote > 0 ? <span>Только по ссылке: {formatNumber(remote)}</span> : null}
        </div>
      </div>

      <div className="boarddetails__block">
        <div className="inspector__label">Происхождение</div>
        <div className="boarddetails__files">
          <span>{SOURCE_LABEL[doc.source.kind] ?? doc.source.kind}</span>
          <span>Импорт: {formatDate(doc.source.importedAt)}</span>
          <span>Создана: {formatDate(doc.createdAt)}</span>
          <span>Изменена: {formatDate(doc.updatedAt)}</span>
          <span>Идентификатор: {doc.id}</span>
        </div>
      </div>
    </div>
  )
}