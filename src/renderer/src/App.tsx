import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { FolderKanban, Info, LayoutGrid, Search, Settings as SettingsIcon } from 'lucide-react'
import logo from '../../../resources/icon-256.png'
import { useApp } from './lib/store'
import type { ToastKind } from './lib/store'
import { navigate, onRouteChange, parseRoute, type Route } from './router'
import { Toasts, usePrompt } from './components/ui'
import { FirstRunName } from './components/welcome'
import { BoardView } from './board/boardView'
import { RenderMode } from './render/renderMode'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { SettingsScreen } from './screens/Settings'
import { PreviewScreen } from './screens/Preview'
import { About } from './screens/About'
import { JoinScreen } from './screens/Join'
import { WindowFrame } from './components/windowFrame'
import { FolderTree } from './components/folderTree'
import { api } from './lib/api'
import { createBoardFromClipboard } from './lib/paste'

const NAV = [
  { name: 'home' as const, label: 'Обзор', icon: LayoutGrid, route: { name: 'home' } as Route },
  { name: 'library' as const, label: 'Доски', icon: FolderKanban, route: { name: 'library' } as Route }
]

async function pasteIntoNewBoard(html: string, text: string, toast: (text: string, kind?: ToastKind) => void, fail: (text: string) => void): Promise<void> {
  try {
    const result = await createBoardFromClipboard(html, text)
    if (!result) {
      fail('Не удалось разобрать данные из буфера')
      return
    }
    toast('Данные из буфера — создана новая доска', 'board')
    navigate({ name: 'board', docId: result.id })
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error))
  }
}

export function App(): ReactNode {
  const ready = useApp((state) => state.ready)
  const init = useApp((state) => state.init)
  const library = useApp((state) => state.library)
  const setLibrary = useApp((state) => state.setLibrary)
  const setSettings = useApp((state) => state.setSettings)
  const setCapture = useApp((state) => state.setCapture)
  const setProgress = useApp((state) => state.setProgress)
  const toast = useApp((state) => state.toast)
  const fail = useApp((state) => state.fail)
  const patchToast = useApp((state) => state.patchToast)
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  const { ask, element: promptElement } = usePrompt()

  useEffect(() => {
    void init()
  }, [init])

  useEffect(() => onRouteChange(setRoute), [])

  useEffect(() => {
    const offLibrary = window.liro.subscribe('library:changed', (payload) => setLibrary(payload))
    const offSettings = window.liro.subscribe('settings:changed', (payload) => setSettings(payload))
    const offCapture = window.liro.subscribe('capture:update', (payload) => setCapture(payload))
    const offProgress = window.liro.subscribe('import:progress', (payload) =>
      setProgress({ ...payload, warnings: payload.warnings ?? [] })
    )
    const offNav = window.liro.subscribe('nav:go', (payload) => {
      const target = String(payload)
      if (target.startsWith('#')) window.location.hash = target.slice(1)
    })
    const offCommand = window.liro.subscribe('board:command', (payload) => {
      window.dispatchEvent(new CustomEvent('liro:board-command', { detail: String(payload) }))
    })
    const offToast = window.liro.subscribe('toast', (payload) => toast(payload.text, payload.kind))
    const offJoin = window.liro.subscribe('live:join', (code) => {
      navigate({ name: 'join', code })
    })
    let progressId = ''
    let version = ''
    let readyVersion = ''
    let pending = false
    const offUpdate = window.liro.subscribe('update:status', (payload) => {
      if (payload.phase === 'downloading') {
        pending = true
        if (payload.version) version = payload.version
        const text = `Скачивается обновление ${version}`
        if (progressId) patchToast(progressId, text, payload.percent ?? 0)
        else progressId = toast(text, 'update', { sticky: true, progress: payload.percent ?? 0 })
        return
      }
      if (progressId) {
        useApp.getState().dismiss(progressId)
        progressId = ''
      }
      if (payload.phase === 'ready') {
        const name = payload.version ?? version
        pending = true
        readyVersion = name
        toast(`Обновление ${name} скачано. Желаете ли перезагрузить приложение для применения обновлений?`, 'update-ready', {
          sticky: true,
          actions: [
            { id: 'apply', label: 'Да', primary: true, run: () => void api.update.apply() },
            { id: 'later', label: 'Позже', run: () => undefined }
          ]
        })
        return
      }
      if (payload.phase === 'error' && pending) {
        pending = false
        fail(readyVersion ? `Не удалось применить обновление ${readyVersion}` : 'Обновление не скачалось')
        return
      }
      if (payload.manual && payload.phase === 'current') {
        pending = false
        toast('Установлена свежая версия', 'check')
      }
      if (payload.manual && payload.phase === 'error') {
        pending = false
        toast('Не удалось проверить обновления', 'error')
      }
    })
    return () => {
      offLibrary()
      offSettings()
      offCapture()
      offProgress()
      offNav()
      offCommand()
      offToast()
      offUpdate()
      offJoin()
    }
  }, [setLibrary, setSettings, setCapture, setProgress, toast, patchToast, fail])

  useEffect(() => {
    let alive = true
    void api.live
      .pendingCode()
      .then((code) => {
        if (!alive || !code) return
        navigate({ name: 'join', code })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      if (parseRoute(window.location.hash).name === 'board') return
      const html = event.clipboardData?.getData('text/html')
      const text = event.clipboardData?.getData('text/plain')
      if (!html && !text) return
      event.preventDefault()
      void pasteIntoNewBoard(html ?? '', text ?? '', toast, fail)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [toast, fail])

  if (window.location.hash.replace(/^#/, '').startsWith('/render')) return <RenderMode />

  if (parseRoute(window.location.hash).name === 'preview') return <PreviewScreen />

  if (route.name === 'join') return <JoinScreen code={route.code} />

  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="dots">
          <span />
          <span />
          <span />
        </div>
      </div>
    )
  }

  const boards = library.boards.filter((board) => !board.archived)
  const isBoard = route.name === 'board'

  return (
    <div className="shell">
      <WindowFrame />
      <div className={isBoard ? 'app app--wide' : 'app'}>
      {!isBoard ? (
        <aside className="sidebar">
          <div className="sidebar__brand">
            <img className="sidebar__mark" src={logo} alt="" />
            <div className="sidebar__title">Liro</div>
          </div>
          <nav className="sidebar__nav">
            {NAV.map((item) => {
              const Icon = item.icon
              const active = route.name === item.name
              return (
                <button
                  key={item.name}
                  type="button"
                  className={active ? 'navitem navitem--active' : 'navitem'}
                  onClick={() => navigate(item.route)}
                >
                  <Icon size={16} className="navitem__icon" />
                  {item.label}
                  {item.name === 'library' && boards.length ? (
                    <span className="navitem__count">{boards.length}</span>
                  ) : null}
                </button>
              )
            })}
            <FolderTree library={library} route={route} onFail={fail} onToast={toast} />
          </nav>
          <div className="sidebar__foot">
            <button
              type="button"
              className={route.name === 'search' ? 'navitem navitem--active' : 'navitem'}
              onClick={() => {
                void ask('Поиск по названию доски').then((query) => {
                  if (query) navigate({ name: 'search', query })
                })
              }}
            >
              <Search size={16} className="navitem__icon" />
              Поиск
            </button>
            <button
              type="button"
              className={route.name === 'settings' ? 'navitem navitem--active' : 'navitem'}
              onClick={() => navigate({ name: 'settings' })}
            >
              <SettingsIcon size={16} className="navitem__icon" />
              Настройки
            </button>
            <button
              type="button"
              className={route.name === 'about' ? 'navitem navitem--active' : 'navitem'}
              onClick={() => navigate({ name: 'about' })}
            >
              <Info size={16} className="navitem__icon" />
              О программе
            </button>
          </div>
        </aside>
      ) : null}

      <main className="main">
        {isBoard ? (
          <BoardView docId={(route as { docId: string }).docId} />
        ) : route.name === 'home' ? (
          <Home onFail={fail} />
        ) : route.name === 'library' ? (
          <Library />
        ) : route.name === 'project' ? (
          <Library projectId={(route as { projectId: string }).projectId} />
        ) : route.name === 'search' ? (
          <Library query={(route as { query: string }).query} />
        ) : route.name === 'settings' ? (
          <SettingsScreen />
        ) : (
          <About />
        )}
      </main>
      </div>
      {promptElement}
      <Toasts />
      <FirstRunName />
    </div>
  )
}