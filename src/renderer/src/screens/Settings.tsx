import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, FolderOpen, HardDrive, Image, RefreshCw } from 'lucide-react'
import type { Settings as AppSettings } from '@shared/types'
import { formatBytes, formatNumber } from '@shared/util'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { Modal, Switch, Spinner } from '../components/ui'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const SCALES = [0.85, 1, 1.15, 1.25]

function Row(props: { label: string; hint?: string; children: ReactNode }): ReactNode {
  return (
    <div className="setrow">
      <div className="setrow__main">
        <div className="setrow__label">{props.label}</div>
        {props.hint ? <div className="setrow__hint">{props.hint}</div> : null}
      </div>
      <div className="setrow__control">{props.children}</div>
    </div>
  )
}

export function SettingsScreen(): ReactNode {
  const settings = useApp((state) => state.settings)
  const setSettings = useApp((state) => state.setSettings)
  const library = useApp((state) => state.library)
  const setLibrary = useApp((state) => state.setLibrary)
  const appInfo = useApp((state) => state.appInfo)
  const toast = useApp((state) => state.toast)
  const [thumbBusy, setThumbBusy] = useState(false)
  const [askMove, setAskMove] = useState(false)
  const [thumbProgress, setThumbProgress] = useState({ done: 0, total: 0 })
  const [name, setName] = useState('')
  const nameTimerRef = useRef<number | null>(null)

  useEffect(() => {
    setName(settings?.userName ?? '')
  }, [settings?.userName])

  useEffect(
    () => () => {
      if (nameTimerRef.current !== null) window.clearTimeout(nameTimerRef.current)
    },
    []
  )

  const update = useCallback(
    async (patch: Partial<AppSettings>, message: string): Promise<void> => {
      try {
        const next = await api.settings.set(patch)
        setSettings(next)
        toast(message, 'success')
      } catch (error) {
        toast(errorText(error), 'error')
      }
    },
    [setSettings, toast]
  )

  const saveName = async (): Promise<void> => {
    const value = name.trim()
    const current = (settings?.userName ?? '').trim()
    if (!value) {
      setName(current)
      return
    }
    if (value === current) return
    await update({ userName: value }, 'Имя сохранено')
  }

  const scheduleNameSave = useCallback(() => {
    if (nameTimerRef.current !== null) window.clearTimeout(nameTimerRef.current)
    nameTimerRef.current = window.setTimeout(() => {
      nameTimerRef.current = null
      void saveName()
    }, 600)
  }, [saveName])

  const storagePath = appInfo?.storage || ''

  const reveal = async (): Promise<void> => {
    try {
      const path = await api.storage.reveal()
      toast(`Папка: ${path}`, 'file')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const move = async (): Promise<void> => {
    setAskMove(true)
  }

  const confirmMove = async (): Promise<void> => {
    setAskMove(false)
    try {
      const path = await api.storage.move()
      setLibrary(await api.library.get())
      toast(`Библиотека перенесена: ${path}`, 'save')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const exportIndex = async (): Promise<void> => {
    try {
      const path = await api.library.exportIndex()
      toast(`Индекс сохранён: ${path}`, 'save')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const refreshThumbs = async (): Promise<void> => {
    const boards = library.boards
    if (!boards.length) {
      toast('Нет досок для обновления', 'preview')
      return
    }
    setThumbBusy(true)
    setThumbProgress({ done: 0, total: boards.length })
    let done = 0
    for (const board of boards) {
      try {
        await api.board.thumbnail(board.id)
      } catch {
        done += 1
        setThumbProgress({ done, total: boards.length })
        continue
      }
      done += 1
      setThumbProgress({ done, total: boards.length })
    }
    setLibrary(await api.library.get())
    setThumbBusy(false)
    toast('Превью обновлены', 'preview')
  }

  const thumbPercent = useMemo(() => {
    if (!thumbProgress.total) return 0
    return (thumbProgress.done / thumbProgress.total) * 100
  }, [thumbProgress])

  if (!settings) {
    return (
      <div className="content">
        <div className="page page--narrow">
          <div className="empty">
            <div className="dots">
              <span />
              <span />
              <span />
            </div>
            <div className="empty__title">Загружаем настройки</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="content">
      <div className="page page--narrow">
        <Modal
          open={askMove}
          title="Перенести библиотеку?"
          onClose={() => setAskMove(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setAskMove(false)}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void confirmMove()}>
                Перенести
              </button>
            </>
          }
        >
          Приложение переедет целиком вместе со всеми досками и картинками.
        </Modal>
        <div className="page__head">
          <h1 className="page__title">Настройки</h1>
          <p className="page__lead">
            Внешний вид, параметры экспорта и расположение библиотеки. Изменения применяются сразу и сохраняются на
            диск.
          </p>
        </div>

        <div className="section">
          <div className="section__title">О себе</div>
          <div className="card">
            <Row label="Имя" hint="Показывается в приветствии на главной странице.">
              <input
                className="input"
                value={name}
                maxLength={40}
                placeholder="Как к вам обращаться"
                onChange={(event) => {
                  setName(event.target.value)
                  scheduleNameSave()
                }}
                onBlur={() => {
                  if (nameTimerRef.current !== null) {
                    window.clearTimeout(nameTimerRef.current)
                    nameTimerRef.current = null
                  }
                  void saveName()
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void saveName()
                }}
              />
            </Row>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Внешний вид</div>
          <div className="card">
            <Row label="Масштаб интерфейса" hint="Увеличивает или уменьшает размеры элементов приложения.">
              <select
                className="select"
                value={settings.uiScale}
                onChange={(event) =>
                  void update({ uiScale: Number(event.target.value) }, 'Масштаб интерфейса обновлён')
                }
              >
                {SCALES.map((scale) => (
                  <option key={scale} value={scale}>
                    {Math.round(scale * 100)}%
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Сетка" hint="Фоновая сетка на досках помогает выравнивать объекты.">
              <Switch
                value={settings.gridMode !== 'none'}
                label="Сетка"
                onChange={(value) =>
                  void update(
                    { gridMode: value ? 'dots' : 'none' },
                    value ? 'Сетка включена' : 'Сетка выключена'
                  )
                }
              />
            </Row>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Экспорт</div>
          <div className="card">
            <Row label="Масштаб по умолчанию" hint="Используется в диалоге экспорта PNG.">
              <select
                className="select"
                value={settings.exportScale}
                onChange={(event) => void update({ exportScale: Number(event.target.value) }, 'Масштаб экспорта обновлён')}
              >
                {[1, 2, 3, 4].map((scale) => (
                  <option key={scale} value={scale}>
                    {scale}×
                  </option>
                ))}
              </select>
            </Row>

            <Row label="Фон изображения" hint="Прозрачный фон удобен для вставки в документы и слайды.">
              <select
                className="select"
                value={settings.exportBackground}
                onChange={(event) =>
                  void update(
                    { exportBackground: event.target.value as AppSettings['exportBackground'] },
                    'Фон экспорта обновлён'
                  )
                }
              >
                <option value="white">Белый</option>
                <option value="transparent">Прозрачный</option>
              </select>
            </Row>

            <Row label="Качество изображений при импорте" hint="Оригинал сохраняет исходное разрешение, но занимает больше места.">
              <select
                className="select"
                value={settings.imageQuality}
                onChange={(event) =>
                  void update({ imageQuality: event.target.value as AppSettings['imageQuality'] }, 'Качество изображений обновлено')
                }
              >
                <option value="original">Оригинал</option>
                <option value="high">Высокое</option>
                <option value="medium">Среднее</option>
              </select>
            </Row>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Хранилище</div>
          <div className="card">
            <div className="stack">
              <div className="field__row">
                <HardDrive size={16} />
                <span className="setrow__label">Папка библиотеки</span>
              </div>
              <div className="codeblock">{storagePath || 'Папка определяется при запуске приложения'}</div>
              <div className="field__hint">
                Здесь хранятся доски, картинки и настройки. Скопируйте папку целиком — это готовая резервная копия.
              </div>
              <div className="field__row">
                <button type="button" className="btn" onClick={() => void reveal()}>
                  <FolderOpen size={15} />
                  Открыть папку
                </button>
                <button type="button" className="btn" onClick={() => void move()}>
                  <FolderOpen size={15} />
                  Перенести библиотеку…
                </button>
                <span className="field__hint">
                  <Image size={13} /> Занято: {formatBytes(library.boards.reduce((sum, board) => sum + board.assetBytes, 0))}{' '}
                  в {formatNumber(library.boards.length)} досок.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Данные</div>
          <div className="card">
            <div className="stack">
              <div className="field__row">
                <button type="button" className="btn" onClick={() => void exportIndex()}>
                  <Download size={15} />
                  Выгрузить индекс библиотеки
                </button>
                <button type="button" className="btn" onClick={() => void refreshThumbs()} disabled={thumbBusy}>
                  {thumbBusy ? <Spinner /> : <RefreshCw size={15} />}
                  Обновить превью всех досок
                </button>
              </div>
              <div className="field__hint">
                Индекс — текстовый список досок с размерами и путями. Превью перестраиваются по реальному содержимому
                досок.
              </div>
              {thumbBusy ? (
                <div className="stack">
                  <div className="progress">
                    <div className="progress__bar" style={{ width: `${thumbPercent}%` }} />
                  </div>
                  <div className="field__hint">
                    Обработано {formatNumber(thumbProgress.done)} из {formatNumber(thumbProgress.total)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
