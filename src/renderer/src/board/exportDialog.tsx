import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { Modal } from '../components/ui'
import type { BoardDoc, ExportOptions } from '@shared/types'

const FORMATS: Array<{ id: ExportOptions['format']; title: string; text: string }> = [
  { id: 'png', title: 'PNG', text: 'Растровое изображение доски. Выберите масштаб 1×–4×.' },
  { id: 'pdf', title: 'PDF', text: 'Векторный документ с текстом. Можно разбить на несколько страниц.' },
  { id: 'html', title: 'HTML', text: 'Автономный файл: открывается без приложения, работает офлайн.' },
  { id: 'zip', title: 'ZIP', text: 'Архив: описание доски плюс все изображения.' },
  { id: 'json', title: 'JSON', text: 'Полное описание доски для последующего импорта.' }
]

export function ExportDialog(props: { doc: BoardDoc; onClose: () => void }): ReactNode {
  const toast = useApp((state) => state.toast)
  const fail = useApp((state) => state.fail)
  const [format, setFormat] = useState<ExportOptions['format']>('png')
  const [scope, setScope] = useState<ExportOptions['scope']>('board')
  const [scale, setScale] = useState(2)
  const [background, setBackground] = useState<ExportOptions['background']>('white')
  const [pdfMode, setPdfMode] = useState<ExportOptions['pdfMode']>('single')
  const [paper, setPaper] = useState<ExportOptions['pdfPaper']>('a3')
  const [cols, setCols] = useState(2)
  const [rows, setRows] = useState(2)
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

  const buildOptions = (): ExportOptions => ({
    docId: props.doc.id,
    format,
    scope,
    targetId: scope === 'frame' ? frameId : undefined,
    scale,
    background,
    pdfMode,
    pdfPaper: paper,
    pdfTileCols: cols,
    pdfTileRows: rows,
    openFolder: false,
    overwrite: true
  })

  const run = async (saveAs: boolean): Promise<void> => {
    setBusy(true)
    try {
      const result = saveAs
        ? await api.board.exportSaveAs(buildOptions())
        : await api.board.export(buildOptions())
      if (result.ok && result.path) {
        toast('export')
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
          <button type="button" className="btn" onClick={() => void run(true)} disabled={busy}>
            Выбрать место…
          </button>
          <button type="button" className="btn btn--primary" onClick={() => void run(false)} disabled={busy}>
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
              onClick={() => setFormat(item.id)}
            >
              <div className="exportoption__title">{item.title}</div>
              <div className="exportoption__text">{item.text}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span className="field__label">Что экспортировать</span>
        <div className="field__row" style={{ flexWrap: 'wrap' }}>
          <button
            type="button"
            className={scope === 'board' ? 'chip chip--active' : 'chip'}
            onClick={() => setScope('board')}
          >
            Вся доска
          </button>
          <button
            type="button"
            className={scope === 'frame' ? 'chip chip--active' : 'chip'}
            onClick={() => setScope('frame')}
          >
            Одну рамку
          </button>
          <span className="dim" style={{ fontSize: 12 }}>
            {props.doc.title}
          </span>
        </div>
        {scope === 'frame' ? (
          <select className="select" value={frameId} onChange={(event) => setFrameId(event.target.value)}>
            <option value="">Выберите рамку</option>
            {frames.map((frame) => (
              <option key={frame.id} value={frame.id}>
                {frame.kind === 'frame' ? frame.title || 'Без названия' : 'Рамка'}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      {format === 'png' ? (
        <>
          <div className="field">
            <span className="field__label">Масштаб</span>
            <div className="field__row">
              {[1, 2, 3, 4].map((value) => (
                <button
                  key={value}
                  type="button"
                  className={scale === value ? 'chip chip--active' : 'chip'}
                  onClick={() => setScale(value)}
                >
                  {value}×
                </button>
              ))}
              <span className="dim" style={{ fontSize: 12 }}>
                {measured.width.toLocaleString('ru-RU')} × {measured.height.toLocaleString('ru-RU')} px
              </span>
            </div>
          </div>
          <div className="field">
            <span className="field__label">Фон</span>
            <div className="field__row">
              <button
                type="button"
                className={background === 'white' ? 'chip chip--active' : 'chip'}
                onClick={() => setBackground('white')}
              >
                Белый
              </button>
              <button
                type="button"
                className={background === 'transparent' ? 'chip chip--active' : 'chip'}
                onClick={() => setBackground('transparent')}
              >
                Прозрачный
              </button>
            </div>
          </div>
          {tooBig ? (
            <div className="field__hint">
              Размер слишком большой для одного кадра — приложение автоматически уменьшит масштаб, качество текста при
              этом снизится. Для очень больших досок удобнее экспортировать отдельные рамки или использовать PDF с
              разбивкой на страницы.
            </div>
          ) : null}
        </>
      ) : null}

      {format === 'pdf' ? (
        <>
          <div className="field">
            <span className="field__label">Разбивка на страницы</span>
            <div className="field__row">
              <button
                type="button"
                className={pdfMode === 'single' ? 'chip chip--active' : 'chip'}
                onClick={() => setPdfMode('single')}
              >
                Одна страница
              </button>
              <button
                type="button"
                className={pdfMode === 'tiles' ? 'chip chip--active' : 'chip'}
                onClick={() => setPdfMode('tiles')}
              >
                Несколько страниц
              </button>
            </div>
          </div>
          {pdfMode === 'tiles' ? (
            <div className="field__row" style={{ gap: 10, marginBottom: 14 }}>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field__label">Столбцов</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={6}
                  value={cols}
                  onChange={(event) => setCols(Math.max(1, Math.min(6, Number(event.target.value) || 1)))}
                />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field__label">Строк</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={6}
                  value={rows}
                  onChange={(event) => setRows(Math.max(1, Math.min(6, Number(event.target.value) || 1)))}
                />
              </label>
              <label className="field" style={{ marginBottom: 0 }}>
                <span className="field__label">Формат листа</span>
                <select className="select" value={paper} onChange={(event) => setPaper(event.target.value as 'a4' | 'a3')}>
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                </select>
              </label>
            </div>
          ) : (
            <div className="field">
              <span className="field__label">Формат листа</span>
              <select className="select" value={paper} onChange={(event) => setPaper(event.target.value as 'a4' | 'a3')}>
                <option value="a4">A4</option>
                <option value="a3">A3</option>
              </select>
            </div>
          )}
        </>
      ) : null}

      <div className="field__hint">
        Экспорт выполняется локально и не требует интернета. Файлы по умолчанию складываются в папку «exports» рядом с
        библиотекой досок.
      </div>
    </Modal>
  )
}