import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Archive,
  Check,
  Download,
  FolderOpen,
  Globe,
  HardDrive,
  Layers,
  LayoutGrid,
  Package,
  ClipboardPaste,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Link2,
  Save
} from 'lucide-react'
import { api } from '../lib/api'
import logo from '../../../../resources/icon-512.png'
import { useApp } from '../lib/store'
import { selfTest } from '../lib/boardClipboard'
import { usePrompt } from '../components/ui'
import { navigate } from '../router'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const FEATURES: Array<{ icon: ReactNode; title: string; text: string }> = [
  {
    icon: <ClipboardPaste size={16} />,
    title: 'Вставка из буфера обмена',
    text: 'Скопировали элементы на доске Miro — нажмите Ctrl+V, и они вставятся сюда целиком, с размерами и цветами.'
  },
  {
    icon: <Globe size={16} />,
    title: 'Офлайн-просмотр',
    text: 'Доска открывается без интернета и полностью редактируется: перемещение, кадрирование, удаление, сохранение.'
  },
  {
    icon: <Archive size={16} />,
    title: 'Проекты',
    text: 'Группируйте доски по проектам, переносите доски между ними и храните в избранном.'
  },
  {
    icon: <Search size={16} />,
    title: 'Поиск',
    text: 'Быстрый поиск по названиям и описаниям досок, сортировка по дате, объектам и размеру.'
  },
  {
    icon: <Download size={16} />,
    title: 'Экспорт PNG, PDF, HTML, ZIP и JSON',
    text: 'Выгрузка целиком или по фрейму, в масштабе до 4×, с белым или прозрачным фоном.'
  },
  {
    icon: <Sparkles size={16} />,
    title: 'Редактирование и сохранение',
    text: 'Изменения сохраняются в локальный файл доски, исходная доска не затрагивается.'
  }
]

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'V', action: 'Выделение' },
  { keys: 'H', action: 'Перемещение доски' },
  { keys: 'T', action: 'Текст' },
  { keys: 'N', action: 'Стикер' },
  { keys: 'S', action: 'Фигуры' },
  { keys: 'P', action: 'Рисование' },
  { keys: 'E', action: 'Ластик' },
  { keys: 'L', action: 'Связь' },
  { keys: 'I', action: 'Картинка' },
  { keys: 'B', action: 'Таблица' },
  { keys: 'D', action: 'Трёхмерная фигура' },
  { keys: 'R / O', action: 'Прямоугольник / круг' },
  { keys: '1–9', action: 'Инструменты по порядку' },
  { keys: '← / →', action: 'Переход между рамками в режиме докладчика' },
  { keys: 'Shift', action: 'Ровная линия при рисовании' },
  { keys: 'Пробел', action: 'Перетаскивание доски' },
  { keys: 'Ctrl+Z / Ctrl+Y', action: 'Отменить / вернуть' },
  { keys: 'Ctrl+C / Ctrl+V', action: 'Копировать / вставить' },
  { keys: 'Ctrl+D', action: 'Дублировать' },
  { keys: 'Ctrl+A', action: 'Выделить всё' },
  { keys: 'Delete', action: 'Удалить выбранное' },
  { keys: 'F', action: 'Вписать доску' },
  { keys: 'G', action: 'Показать или скрыть сетку' },
  { keys: 'Esc', action: 'Отменить выбор' }
]

export function About(): ReactNode {
  const appInfo = useApp((state) => state.appInfo)
  const toast = useApp((state) => state.toast)
  const capture = useApp((state) => state.capture)
  const [storage, setStorage] = useState('')
  const { ask, element: promptElement } = usePrompt()

  useEffect(() => {
    let alive = true
    void (async (): Promise<void> => {
      try {
        const info = await api.app.info()
        if (alive) setStorage(info.storage)
      } catch {
        return
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const runSelfTest = (): void => {
    const ok = selfTest()
    if (ok) toast('Формат буфера: самопроверка пройдена', 'check')
    else toast('Формат буфера: самопроверка не пройдена', 'error')
  }

  const revealStorage = async (): Promise<void> => {
    try {
      const path = await api.storage.reveal()
      toast(`Папка: ${path}`, 'file')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const startCapture = async (): Promise<void> => {
    const url = await ask('Ссылка на доску Miro', '', 'https://miro.com/app/board/...')
    if (!url) return
    try {
      await api.capture.open(url, { url, autoSweep: false, downloadImages: true, maxImageBytes: 32 * 1024 * 1024 })
      toast('Откроется окно сбора — дождитесь, пока доска соберётся', 'board')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const saveCapture = async (): Promise<void> => {
    try {
      const meta = await api.capture.save('local')
      toast('Доска сохранена в библиотеку', 'board')
      navigate({ name: 'board', docId: meta.id })
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const openCaptureTools = async (): Promise<void> => {
    try {
      await api.capture.openTools('folder')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  return (
    <div className="content">
      <div className="page page--narrow">
        <div className="page__head">
          <img className="about__logo" src={logo} alt="Liro" />
          <h1 className="page__title">Liro</h1>
          <p className="page__lead">
            Настольное приложение для офлайн-работы с досками. Библиотека живёт на вашем компьютере
            и остаётся доступной без интернета.
          </p>
        </div>

        <div className="card">
          <div className="rowlist">
            <div className="rowitem">
              <span className="rowitem__grow">Версия</span>
              <span className="mono">{appInfo?.version || '—'}</span>
            </div>
            <div className="rowitem">
              <span className="rowitem__grow">Electron</span>
              <span className="mono">{appInfo?.electron || '—'}</span>
            </div>
            <div className="rowitem">
              <span className="rowitem__grow">Платформа</span>
              <span className="mono">{appInfo?.platform || '—'}</span>
            </div>
            <div className="rowitem">
              <span className="rowitem__grow">Папка хранилища</span>
              <span className="mono truncate" style={{ maxWidth: 340 }}>
                {storage || appInfo?.storage || '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Возможности</div>
          <div className="grid grid--split">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="card">
                <div className="stack">
                  <div className="field__row">
                    <span className="quick__icon">{feature.icon}</span>
                    <span className="setrow__label">{feature.title}</span>
                  </div>
                  <div className="field__hint">{feature.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section__title">Горячие клавиши</div>
          <div className="card">
            <div className="rowlist">
              {SHORTCUTS.map((item) => (
                <div key={item.keys} className="rowitem">
                  <span className="mono" style={{ minWidth: 150 }}>
                    {item.keys}
                  </span>
                  <span className="rowitem__grow">{item.action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Проверки</div>
          <div className="card">
            <div className="stack">
              <div className="field__row">
                <button type="button" className="btn" onClick={runSelfTest}>
                  <Check size={15} />
                  Проверить формат буфера
                </button>
                <button type="button" className="btn" onClick={() => void revealStorage()}>
                  <FolderOpen size={15} />
                  Открыть папку хранилища
                </button>
                {appInfo?.packaged ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      toast('Проверяем обновления', 'update')
                      void api.update.check()
                    }}
                  >
                    <RefreshCw size={15} />
                    Проверить обновления
                  </button>
                ) : null}
              </div>
              <div className="field__hint">
                Самопроверка кодирует и декодирует тестовый объект, проверяет стили, связи и обратное преобразование —
                так видно, корректно ли приложение читает и отдаёт формат буфера.
              </div>
              <div className="field__hint">
                Обновления Liro скачиваются сами с GitHub. Когда новая версия готова, внизу
                появляется вопрос: перезагрузить приложение сейчас или позже. Ответ «Позже»
                ничего не ломает — обновление встанет при следующем запуске или выходе.
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Как это работает</div>
          <div className="card">
            <div className="stack">
              <div className="field__row">
                <ShieldCheck size={16} />
                <span className="setrow__label">Данные не уходят в интернет</span>
              </div>
              <div className="field__hint">
                Приложение работает полностью офлайн: данные из буфера обмена превращаются в доску и складываются
                в обычную папку на вашем компьютере, без сторонних сервисов.
              </div>
              <div className="field__hint">
                Доски можно копировать, архивировать и переносить на другой диск средствами системы.
              </div>
              <div className="field__hint">
                Экспорт и редактирование выполняются локально, поэтому приложение полностью работоспособно без подключения
                к сети.
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section__title">Импорт с сайта Miro</div>
          <div className="card">
            <div className="stack">
              <div className="field__row">
                <Globe size={15} />
                <span className="setrow__label">Сбор доски прямо из браузера</span>
              </div>
              <div className="field__hint">
                Укажите ссылку на доску — откроется окно сбора. Войдите в Miro, пролистайте доску, и она сохранится
                в библиотеку вместе с картинками.
              </div>
              <div className="field__row">
                <button type="button" className="btn" onClick={() => void startCapture()}>
                  <Link2 size={15} />
                  Указать ссылку на доску
                </button>
                <button type="button" className="btn" onClick={() => void openCaptureTools()}>
                  <Package size={15} />
                  Файлы расширения
                </button>
                {capture && (capture.status === 'done' || capture.status === 'ready') ? (
                  <button type="button" className="btn btn--primary" onClick={() => void saveCapture()}>
                    <Save size={15} />
                    Сохранить доску
                  </button>
                ) : null}
              </div>
              {capture ? (
                <div className="field__hint">
                  {capture.status === 'done' || capture.status === 'ready'
                    ? `Собрано объектов: ${capture.items}`
                    : capture.status === 'error'
                      ? capture.message || 'Сбор не удался'
                      : capture.needsLogin
                        ? 'Нужен вход в Miro в окне сбора'
                        : capture.message || 'Идёт сбор'}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="section">
          <div className="card card--flat">
            <div className="stack">
              <div className="field__row">
                <Package size={15} />
                <span className="setrow__label">Пакеты приложения</span>
              </div>
              <div className="rowlist">
                <div className="rowitem">
                  <span className="quick__icon">
                    <HardDrive size={15} />
                  </span>
                  <span className="rowitem__grow">
                    <span className="setrow__label">Форматы импорта</span>
                    <div className="setrow__hint">.json, .zip, .rtb и сбор из браузера</div>
                  </span>
                </div>
                <div className="rowitem">
                  <span className="quick__icon">
                    <Layers size={15} />
                  </span>
                  <span className="rowitem__grow">
                    <span className="setrow__label">Форматы экспорта</span>
                    <div className="setrow__hint">PNG, PDF, HTML, ZIP и JSON</div>
                  </span>
                </div>
                <div className="rowitem">
                  <span className="quick__icon">
                    <LayoutGrid size={15} />
                  </span>
                  <span className="rowitem__grow">
                    <span className="setrow__label">Виды досок</span>
                    <div className="setrow__hint">Плитка и список, архив и избранное</div>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {promptElement}
    </div>
  )
}
