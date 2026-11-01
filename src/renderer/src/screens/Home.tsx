import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowRight,
  ClipboardPaste,
  Clock,
  FileUp,
  FolderOpen,
  HardDrive,
  LayoutGrid,
  Rows3,
  ShieldCheck,
  SquarePlus
} from 'lucide-react'
import type { BoardMeta } from '@shared/types'
import { formatDate } from '@shared/util'
import { api } from '../lib/api'
import { createBoardFromClipboard } from '../lib/paste'
import { useApp } from '../lib/store'
import { navigate } from '../router'
import { Empty } from '../components/ui'

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function thumbUrl(board: BoardMeta): string {
  if (!board.thumbnail) return ''
  return `lirofile://${encodeURIComponent(board.id)}/${encodeURIComponent(board.thumbnail)}`
}

export function BoardThumb(props: { board: BoardMeta }): ReactNode {
  const [failed, setFailed] = useState(false)
  const src = thumbUrl(props.board)
  if (!src || failed) {
    return (
      <div className="thumbph">
        <LayoutGrid size={22} />
      </div>
    )
  }
  return <img src={src} alt="" onError={() => setFailed(true)} />
}

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

function whenLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return formatDate(iso)
  const days = Math.floor((Date.now() - date.getTime()) / 86400000)
  if (days <= 0) return 'сегодня'
  if (days === 1) return 'вчера'
  if (days < 7) return `${days} дн. назад`
  return formatDate(iso)
}

function BoardCard(props: { board: BoardMeta; onOpen: () => void }): ReactNode {
  return (
    <button type="button" className="tile" onClick={props.onOpen}>
      <span className="tile__thumb">
        <BoardThumb board={props.board} />
      </span>
      <span className="tile__body">
        <span className="tile__title truncate">{props.board.title}</span>
        <span className="tile__meta">
          <Clock size={11} />
          {whenLabel(props.board.updatedAt)}
        </span>
      </span>
    </button>
  )
}

function BoardRow(props: { board: BoardMeta; onOpen: () => void }): ReactNode {
  return (
    <button type="button" className="homerow" onClick={props.onOpen}>
      <span className="homerow__thumb">
        <BoardThumb board={props.board} />
      </span>
      <span className="homerow__main">
        <span className="homerow__title truncate">{props.board.title}</span>
        <span className="homerow__meta">{whenLabel(props.board.updatedAt)}</span>
      </span>
      <ArrowRight size={15} className="homerow__go" />
    </button>
  )
}

export function Home(props: { onFail: (text: string) => void }): ReactNode {
  const library = useApp((state) => state.library)
  const setLibrary = useApp((state) => state.setLibrary)
  const settings = useApp((state) => state.settings)
  const appInfo = useApp((state) => state.appInfo)
  const toast = useApp((state) => state.toast)
  const [busy, setBusy] = useState<string | null>(null)
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const fail = props.onFail

  const boards = useMemo(
    () => library.boards.filter((board) => !board.archived).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [library.boards]
  )

  const reload = useCallback(async (): Promise<void> => {
    try {
      setLibrary(await api.library.get())
    } catch (error) {
      fail(errorText(error))
    }
  }, [setLibrary, fail])

  const createBoard = useCallback(async (): Promise<void> => {
    setBusy('new')
    try {
      const doc = await api.board.create('Новая доска')
      await reload()
      navigate({ name: 'board', docId: doc.id })
    } catch (error) {
      fail(errorText(error))
    } finally {
      setBusy(null)
    }
  }, [reload, fail])

  const pasteClipboard = useCallback(async (): Promise<void> => {
    setBusy('clip')
    try {
      const html = await api.clipboard.readHtml()
      if (!html) {
        toast('В буфере нет данных доски', 'clipboard')
        return
      }
      const result = await createBoardFromClipboard(html, '')
      if (!result) {
        toast('В буфере нет объектов для вставки', 'clipboard')
        return
      }
      await reload()
      navigate({ name: 'board', docId: result.id })
    } catch (error) {
      fail(errorText(error))
    } finally {
      setBusy(null)
    }
  }, [reload, fail, toast])

  const openFile = useCallback(async (): Promise<void> => {
    setBusy('file')
    try {
      const board = await api.importer.fromFile()
      if (!board) return
      await reload()
      navigate({ name: 'board', docId: board.id })
    } catch (error) {
      fail(errorText(error))
    } finally {
      setBusy(null)
    }
  }, [reload, fail])

  const last = boards[0]
  const recent = boards.slice(0, 12)
  const userName = (settings?.userName ?? '').trim()

  return (
    <div className="page page--home">
      <section className="homeintro">
        <h1 className="homeintro__title">
          {greeting()}
          {userName ? (
            <>
              , <span className="homeintro__name">{userName}</span>
            </>
          ) : null}
        </h1>
        <p className="homeintro__lead">Доски Liro лежат на этом компьютере и открываются без интернета.</p>
        <div className="homeintro__actions">
          <button type="button" className="act" onClick={() => void createBoard()} disabled={busy === 'new'}>
            <span className="act__icon">
              <SquarePlus size={18} />
            </span>
            <span className="act__body">
              <span className="act__title">Создать доску</span>
              <span className="act__text">Пустая, под ваши записи</span>
            </span>
          </button>
          {last ? (
            <button type="button" className="act" onClick={() => navigate({ name: 'board', docId: last.id })}>
              <span className="act__icon">
                <ArrowRight size={18} />
              </span>
              <span className="act__body">
                <span className="act__title">Продолжить с последней</span>
                <span className="act__text truncate">{last.title}</span>
              </span>
            </button>
          ) : null}
          <button type="button" className="act" onClick={() => navigate({ name: 'library' })}>
            <span className="act__icon">
              <LayoutGrid size={18} />
            </span>
            <span className="act__body">
              <span className="act__title">Все доски</span>
              <span className="act__text">Поиск, папки, архив</span>
            </span>
          </button>
          <button type="button" className="act" onClick={() => void pasteClipboard()} disabled={busy === 'clip'}>
            <span className="act__icon">
              <ClipboardPaste size={18} />
            </span>
            <span className="act__body">
              <span className="act__title">Вставить из буфера</span>
              <span className="act__text">Объекты скопированной доски</span>
            </span>
          </button>
          <button type="button" className="act" onClick={() => void openFile()} disabled={busy === 'file'}>
            <span className="act__icon">
              <FileUp size={18} />
            </span>
            <span className="act__body">
              <span className="act__title">Открыть файл</span>
              <span className="act__text">Доска из файла на диске</span>
            </span>
          </button>
        </div>
      </section>

      {last ? (
        <section className="homeresume">
          <button type="button" className="resume" onClick={() => navigate({ name: 'board', docId: last.id })}>
            <span className="resume__thumb">
              <BoardThumb board={last} />
            </span>
            <span className="resume__body">
              <span className="resume__label">Последняя доска</span>
              <span className="resume__title truncate">{last.title}</span>
              <span className="resume__meta">Открыта {whenLabel(last.updatedAt)}</span>
            </span>
            <span className="resume__go">
              <ArrowRight size={18} />
            </span>
          </button>
          <div className="homeresume__side">
            <button type="button" className="ghost" onClick={() => navigate({ name: 'library' })}>
              <LayoutGrid size={15} />
              Все доски
            </button>
            <button type="button" className="ghost" onClick={() => void api.board.reveal(last.id)}>
              <FolderOpen size={15} />
              Файлы доски
            </button>
          </div>
        </section>
      ) : (
        <Empty title="Пока нет ни одной доски" text="Вставьте содержимое из буфера обмена, откройте файл с доской или создайте пустую." />
      )}

      {recent.length > 1 ? (
        <section className="homerecent">
          <div className="homebar">
            <h2 className="homebar__title">Недавние доски</h2>
            <div className="homebar__switch">
              <button
                type="button"
                className="switchbtn"
                data-active={view === 'grid'}
                onClick={() => setView('grid')}
                aria-label="Плитка"
                title="Плитка"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                type="button"
                className="switchbtn"
                data-active={view === 'list'}
                onClick={() => setView('list')}
                aria-label="Список"
                title="Список"
              >
                <Rows3 size={15} />
              </button>
            </div>
          </div>
          {view === 'grid' ? (
            <div className="tiles">
              {recent.map((board) => (
                <BoardCard key={board.id} board={board} onOpen={() => navigate({ name: 'board', docId: board.id })} />
              ))}
            </div>
          ) : (
            <div className="homerows">
              {recent.map((board) => (
                <BoardRow key={board.id} board={board} onOpen={() => navigate({ name: 'board', docId: board.id })} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <footer className="homefoot">
        <button type="button" className="homefoot__item" onClick={() => void api.storage.reveal()}>
          <HardDrive size={14} />
          <span className="truncate">{appInfo?.storage || 'Папка хранилища'}</span>
        </button>
        <span className="homefoot__sep" />
        <span className="homefoot__item homefoot__item--plain">
          <ShieldCheck size={14} />
          ничего не уходит в интернет
        </span>
      </footer>
    </div>
  )
}