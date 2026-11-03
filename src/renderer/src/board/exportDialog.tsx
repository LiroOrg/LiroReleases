import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { Modal } from '../components/ui'
import type { BoardDoc, ExportOptions } from '@shared/types'

const FORMATS: Array<{ id: ExportOptions['format']; title: string; text: string }> = [
  { id: 'liro', title: 'LIRO', text: 'Наш формат: доска целиком со всеми картинками в одном файле.' },
  { id: 'png', title: 'PNG', text: 'Растровое изображение доски. Выберите масштаб 1×–4×.' },
  { id: 'html', title: 'HTML', text: 'Автономный файл: открывается без приложения, работает офлайн.' },
  { id: 'svg', title: 'SVG', text: 'Векторная картинка: открывается в браузере, Иллюстраторе и Inkscape.' }
]

const WHOLE_FILE: Array<ExportOptions['format']> = ['liro']

export function ExportDialog(props: { doc: BoardDoc; onClose: () => void; flush?: () => Promise<void> }): ReactNode {
  const toast = useApp((state) => state.toast)
  const fail = useApp((state) => state.fail)
  const [format, setFormat] = useState<ExportOptions['format']>('liro')
  const [scope, setScope] = useState<ExportOptions['scope']>('board')
  const [scale, setScale] = useState(2)
  const [background, setBackground] = useState<ExportOptions['background']>('white')
  const [frameId, setFrameId] = useState('')
  const [busy, setBusy] = useState(false)

  const frames = useMemo(() => props.doc.items.filter((item) => item.kind === 'frame'), [props.doc.items])
  const measured = useMemo(() => {
    const frame = scope === 'frame' ? frames.find((entry) => entry.id === frameId) : undefined
    const width = frame ? frame.w : props.doc.bounds.width
    const height = frame ? frame.h : props.doc.bounds.height
    return { width: Math.round(width * scale), height: Math.round(height * scale) }
  }, [scope, frameId, frames, props.doc.bounds, scale])

  const pixels = measured.width * measured.height
  const tooBig = format === 'png' && (pixels > 36_000_000 || measured.width > 12000 || measured.height > 12000)
  const effectiveScope = WHOLE_FILE.includes(format) ? 'board' : scope
  const frameMissing = effectiveScope === 'frame' && !frameId

  const buildOptions = (): ExportOptions => ({
    docId: props.doc.id,
    format,
    scope: effectiveScope,
    targetId: effectiveScope === 'frame' ? frameId : undefined,
    scale,
    background,
    openFolder: false,
    overwrite: true
  })

  const run = async (saveAs: boolean): Promise<void> => {
    setBusy(true)
    try {
      await props.flush?.()
      const result = saveAs
        ? await api.board.exportSaveAs(buildOptions())
        : await api.board.export(buildOptions())
      if (result.ok && result.path) {
        const name = result.path.split(/[\\/]/).pop() ?? result.path
        toast(`Файл сохранён: ${name}`, 'export')
        props.onClose()
      } else {
        fail(result.message ?? 'Экспорт не выполнен')
      }
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      wide
      title="Экспорт доски"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={() => void run(true)} disabled={busy || frameMissing}>
            Выбрать место…
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void run(false)} disabled={busy || frameMissing}>
            {busy ? 'Готовим…' : 'Экспортировать в папку Liro'}
          </button>
        </>
      }
    >
      <div className="field">
        <span className="field__label">Формат</span>
        <div className="exportgrid">
          {FORMATS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="exportoption"
              data-active={format === item.id}
              aria-pressed={format === item.id}
              onClick={() => setFormat(item.id)}
            >
              <div className="exportoption__title">{item.title}</div>
              <div className="exportoption__text">{item.text}</div>
            </button>
          ))}
        </div>
      </div>

      {WHOLE_FILE.includes(format) ? null : (
        <div className="field">
          <span className="field__label">Что экспортировать</span>
          <div className="field__row field__row--wrap">
            <button
              type="button"
              className="chip"
              data-active={scope === 'board'}
              aria-pressed={scope === 'board'}
              onClick={() => setScope('board')}
            >
              Вся доска
            </button>
            <button
              type="button"
              className="chip"
              data-active={scope === 'frame'}
              aria-pressed={scope === 'frame'}
              onClick={() => setScope('frame')}
              disabled={!frames.length}
              title={frames.length ? 'Одну рамку' : 'На доске нет рамок'}
            >
              Одну рамку
            </button>
            <span className="note">{props.doc.title}</span>
          </div>
          {scope === 'frame' ? (
            <select
              className="select"
              aria-label="Рамка для экспорта"
              value={frameId}
              onChange={(event) => setFrameId(event.target.value)}
            >
              <option value="">Выберите рамку</option>
              {frames.map((frame) => (
                <option key={frame.id} value={frame.id}>
                  {frame.title || 'Без названия'}
                </option>
              ))}
            </select>
          ) : null}
          {frameMissing ? <div className="field__hint">Выберите рамку, чтобы экспортировать её одну.</div> : null}
        </div>
      )}

      {format === 'png' ? (
        <>
          <div className="field">
            <span className="field__label">Масштаб</span>
            <div className="field__row">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  className="chip"
                  data-active={scale === value}
                  aria-pressed={scale === value}
                  onClick={() => setScale(value)}
                >
                  {value}×
                </button>
              ))}
              <span className="note">
                {measured.width.toLocaleString('ru-RU')} × {measured.height.toLocaleString('ru-RU')} px
              </span>
            </div>
          </div>
          <div className="field">
            <span className="field__label">Фон</span>
            <div className="field__row">
              <button
                type="button"
                className="chip"
                data-active={background === 'white'}
                aria-pressed={background === 'white'}
                onClick={() => setBackground('white')}
              >
                Белый
              </button>
              <button
                type="button"
                className="chip"
                data-active={background === 'transparent'}
                aria-pressed={background === 'transparent'}
                onClick={() => setBackground('transparent')}
              >
                Прозрачный
              </button>
            </div>
          </div>
          {tooBig ? (
            <div className="field__hint">
              Размер слишком большой для одного кадра — приложение автоматически уменьшит масштаб, качество текста при
              этом снизится. Для очень больших досок удобнее экспортировать отдельные рамки.
            </div>
          ) : null}
        </>
      ) : null}

      <div className="field__hint">
        Экспорт выполняется локально и не требует интернета. Файлы по умолчанию складываются в папку «exports» рядом с
        библиотекой досок.
      </div>
    </Modal>
  )
}