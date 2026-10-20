import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Archive,
  ArrowLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  FolderPlus,
  ClipboardPaste,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2
} from 'lucide-react'
import type { BoardMeta, Project } from '@shared/types'
import { formatBytes, formatDate, formatNumber } from '@shared/util'
import { api } from '../lib/api'
import { createBoardFromClipboard } from '../lib/paste'
import { useApp } from '../lib/store'
import { navigate } from '../router'
import { Empty, Modal } from '../components/ui'
import { Menu } from '../components/menu'
import { BoardThumb } from './Home'

type SortKey = 'updated' | 'name' | 'items' | 'size'
type ViewKey = 'grid' | 'list'

type Dialog =
  | { kind: 'none' }
  | { kind: 'newBoard' }
  | { kind: 'renameBoard'; board: BoardMeta }
  | { kind: 'moveBoard'; board: BoardMeta }
  | { kind: 'deleteBoard'; board: BoardMeta }
  | { kind: 'newProject' }
  | { kind: 'renameProject'; project: Project }
  | { kind: 'deleteProject'; project: Project }

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function Library(props?: { projectId?: string; query?: string }): ReactNode {
  const library = useApp((state) => state.library)
  const setLibrary = useApp((state) => state.setLibrary)
  const toast = useApp((state) => state.toast)

  const projectId = props?.projectId
  const [search, setSearch] = useState(props?.query ?? '')
  const [projectFilter, setProjectFilter] = useState(projectId ?? 'all')
  const [sort, setSort] = useState<SortKey>('updated')
  const [view, setView] = useState<ViewKey>('grid')
  const [archived, setArchived] = useState(false)
  const [dialog, setDialog] = useState<Dialog>({ kind: 'none' })
  const [draft, setDraft] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deleteMode, setDeleteMode] = useState<'unassign' | 'deleteBoards'>('unassign')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setLibrary(await api.library.get())
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }, [setLibrary, toast])

  const close = useCallback((): void => {
    setDialog({ kind: 'none' })
    setDraft('')
    setMoveTo('')
    setDeleteFiles(false)
    setDeleteMode('unassign')
  }, [])

  const activeProject = useMemo(
    () => library.projects.find((project) => project.id === projectId) ?? null,
    [library.projects, projectId]
  )

  const boards = useMemo(() => {
    const text = search.trim().toLowerCase()
    let list = library.boards.filter((board) => board.archived === archived)
    if (projectId) {
      list = list.filter((board) => board.projectId === projectId)
    } else if (projectFilter === 'none') {
      list = list.filter((board) => !board.projectId)
    } else if (projectFilter !== 'all') {
      list = list.filter((board) => board.projectId === projectFilter)
    }
    if (text) {
      const folders = new Map(library.projects.map((project) => [project.id, project.name.toLowerCase()]))
      list = list.filter((board) => {
        const folder = board.projectId ? folders.get(board.projectId) ?? '' : ''
        return `${board.title} ${board.description ?? ''} ${folder}`.toLowerCase().includes(text)
      })
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((left, right) => left.title.localeCompare(right.title, 'ru'))
    else if (sort === 'items') sorted.sort((left, right) => right.itemCount - left.itemCount)
    else if (sort === 'size') sorted.sort((left, right) => right.assetBytes - left.assetBytes)
    else sorted.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    return sorted
  }, [library.boards, search, projectFilter, projectId, sort, archived])

  const projectName = useCallback(
    (id?: string): string => {
      if (!id) return 'Без папки'
      return library.projects.find((project) => project.id === id)?.name ?? 'Без папки'
    },
    [library.projects]
  )

  const openBoard = (id: string): void => navigate({ name: 'board', docId: id })

  const createBoard = async (): Promise<void> => {
    const title = draft.trim() || 'Новая доска'
    setBusy(true)
    try {
      const doc = await api.board.create(title, projectId)
      await refresh()
      close()
      toast('Создана новая пустая доска', 'board')
      navigate({ name: 'board', docId: doc.id })
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const renameBoard = async (board: BoardMeta): Promise<void> => {
    const title = draft.trim()
    if (!title) return
    setBusy(true)
    try {
      await api.board.rename(board.id, title)
      await refresh()
      close()
      toast('Доска переименована', 'board')
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const duplicateBoard = async (board: BoardMeta): Promise<void> => {
    try {
      await api.board.duplicate(board.id)
      await refresh()
      toast('Копия доски создана', 'copy')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const patchBoard = async (board: BoardMeta, patch: Partial<BoardMeta>, message: string): Promise<void> => {
    try {
      await api.board.update(board.id, patch)
      await refresh()
      toast(message, 'success')
    } catch (error) {
      toast(errorText(error), 'error')
    }
  }

  const moveBoard = async (board: BoardMeta): Promise<void> => {
    setBusy(true)
    try {
      await api.board.update(board.id, { projectId: moveTo || undefined })
      await refresh()
      close()
      toast(moveTo ? `Доска перенесена в «${projectName(moveTo)}»` : 'Доска убрана из проекта', 'folder')
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const deleteBoard = async (board: BoardMeta): Promise<void> => {
    setBusy(true)
    try {
      await api.board.remove(board.id, deleteFiles)
      await refresh()
      close()
      toast('Доска удалена', 'delete')
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const createProject = async (): Promise<void> => {
    const name = draft.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.project.create(name)
      await refresh()
      close()
      toast('Папка создана', 'folder')
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const renameProject = async (project: Project): Promise<void> => {
    const name = draft.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.project.rename(project.id, name)
      await refresh()
      close()
      toast('Папка переименована', 'folder')
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const deleteProject = async (project: Project): Promise<void> => {
    setBusy(true)
    try {
      await api.project.remove(project.id, deleteMode)
      await refresh()
      close()
      toast(
        deleteMode === 'deleteBoards' ? 'Папка удалена вместе с досками' : 'Папка удалена, доски остались в библиотеке',
        'success'
      )
      if (projectId === project.id) navigate({ name: 'library' })
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const boardMenu = (board: BoardMeta): ReactNode => (
    <Menu
      label={`Действия с доской «${board.title}»`}
      header={board.title}
      items={[
        { id: 'open', label: 'Открыть', icon: <ChevronRight size={14} />, run: () => openBoard(board.id) },
        {
          id: 'rename',
          label: 'Переименовать',
          icon: <Pencil size={14} />,
          run: () => {
            setDraft(board.title)
            setDialog({ kind: 'renameBoard', board })
          }
        },
        { id: 'copy', label: 'Дублировать', icon: <Copy size={14} />, run: () => void duplicateBoard(board) },
        {
          id: 'fav',
          label: board.favorite ? 'Убрать из избранного' : 'В избранное',
          icon: <Star size={14} fill={board.favorite ? 'currentColor' : 'none'} />,
          active: board.favorite,
          run: () =>
            void patchBoard(
              board,
              { favorite: !board.favorite },
              board.favorite ? 'Убрано из избранного' : 'Добавлено в избранное'
            )
        },
        {
          id: 'move',
          label: 'Переместить в папку',
          icon: <FolderPlus size={14} />,
          run: () => {
            setMoveTo(board.projectId ?? '')
            setDialog({ kind: 'moveBoard', board })
          }
        },
        {
          id: 'archive',
          label: board.archived ? 'Вернуть из архива' : 'В архив',
          icon: <Archive size={14} />,
          active: board.archived,
          run: () =>
            void patchBoard(
              board,
              { archived: !board.archived },
              board.archived ? 'Доска возвращена' : 'Доска в архиве'
            )
        },
        { id: 'reveal', label: 'Показать в папке', icon: <FolderOpen size={14} />, run: () => void api.board.reveal(board.id) },
        {
          id: 'delete',
          label: 'Удалить',
          icon: <Trash2 size={14} />,
          danger: true,
          run: () => {
            setDeleteFiles(false)
            setDialog({ kind: 'deleteBoard', board })
          }
        }
      ]}
    >
      <MoreHorizontal size={16} />
    </Menu>
  )

  const pasteClipboard = async (): Promise<void> => {
    setBusy(true)
    try {
      const html = await api.clipboard.readHtml()
      if (!html) {
        toast('В буфере нет данных доски', 'info')
        return
      }
      const result = await createBoardFromClipboard(html, '')
      if (!result) {
        toast('В буфере нет объектов для вставки', 'info')
        return
      }
      await openBoard(result.id)
    } catch (error) {
      toast(errorText(error), 'error')
    } finally {
      setBusy(false)
    }
  }

  const folders: Array<{ id: string; label: string }> = [
    { id: 'all', label: 'Все' },
    { id: 'none', label: 'Без папки' },
    ...library.projects.map((project) => ({ id: project.id, label: project.name }))
  ]

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const board of library.boards) {
      if (board.archived !== archived) continue
      const key = board.projectId ?? 'none'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    map.set('all', library.boards.filter((board) => board.archived === archived).length)
    return map
  }, [library.boards, archived])

  return (
    <div className="content">
      <div className="page page--library">
        <div className="libhead">
          <div className="libhead__title">
            {projectId ? (
              <button type="button" className="libhead__back" onClick={() => navigate({ name: 'library' })} aria-label="Все доски">
                <ArrowLeft size={16} />
              </button>
            ) : null}
            <h1 className="page__title" style={{ margin: 0 }}>
              {activeProject ? activeProject.name : 'Доски'}
            </h1>
            <span className="libhead__count">{formatNumber(boards.length)}</span>
          </div>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setDraft('')
              setDialog({ kind: 'newBoard' })
            }}
          >
            <Plus size={15} /> Новая доска
          </button>
        </div>

        <div className="libbar">
          <div className="libbar__search">
            <Search size={15} />
            <input
              className="input"
              placeholder="Поиск по названию"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <select className="select libbar__sort" value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="updated">По изменению</option>
            <option value="name">По имени</option>
            <option value="items">По объектам</option>
            <option value="size">По размеру</option>
          </select>
          <div className="libbar__switch">
            <button
              type="button"
              className="switchbtn"
              data-active={view === 'grid'}
              aria-label="Плитка"
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className="switchbtn"
              data-active={view === 'list'}
              aria-label="Список"
              onClick={() => setView('list')}
            >
              <List size={15} />
            </button>
          </div>
        </div>

        <div className="libchips">
          {!projectId ? (
            <>
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  type="button"
                  className="chip"
                  data-active={projectFilter === folder.id}
                  onClick={() => setProjectFilter(folder.id)}
                >
                  {folder.label}
                  <span className="chip__count">{formatNumber(folderCounts.get(folder.id) ?? 0)}</span>
                </button>
              ))}
              <span className="libchips__sep" />
              <button type="button" className="chip" data-active={archived} onClick={() => setArchived((value) => !value)}>
                <Archive size={13} /> Архив
              </button>
              <button type="button" className="chip" onClick={() => setDialog({ kind: 'newProject' })}>
                <Plus size={13} /> Папка
              </button>
              <button type="button" className="chip" disabled={busy} onClick={() => void pasteClipboard()}>
                <ClipboardPaste size={13} /> Вставить из буфера
              </button>
            </>
          ) : (
            <button
              type="button"
              className="chip"
              data-active={archived}
              onClick={() => setArchived((value) => !value)}
            >
              <Archive size={13} /> Архив
            </button>
          )}
        </div>

        {activeProject ? (
          <div className="libfolder">
            <span className="field__hint">
              создана {formatDate(activeProject.createdAt)} · {formatNumber(folderCounts.get(activeProject.id) ?? 0)} досок
            </span>
            <button
              type="button"
              className="chip"
              onClick={() => {
                setDraft(activeProject.name)
                setDialog({ kind: 'renameProject', project: activeProject })
              }}
            >
              <Pencil size={13} /> Переименовать
            </button>
            <button
              type="button"
              className="chip"
              data-danger="true"
              onClick={() => {
                setDeleteMode('unassign')
                setDialog({ kind: 'deleteProject', project: activeProject })
              }}
            >
              <Trash2 size={13} /> Удалить папку
            </button>
          </div>
        ) : null}

        {boards.length ? (
          view === 'grid' ? (
            <div className="tiles">
              {boards.map((board) => (
                <div key={board.id} className="tile" onClick={() => openBoard(board.id)}>
                  <span className="tile__thumb">
                    <BoardThumb board={board} />
                    {board.favorite ? <span className="tile__star" aria-label="В избранном"><Star size={12} fill="currentColor" /></span> : null}
                  </span>
                  <span className="tile__body">
                    <span className="tile__title truncate">{board.title}</span>
                    <span className="tile__meta truncate">
                      {formatDate(board.updatedAt)} · {projectName(board.projectId)}
                    </span>
                  </span>
                  <span className="tile__menu" onClick={(event) => event.stopPropagation()}>
                    {boardMenu(board)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="homerows">
              {boards.map((board) => (
                <div key={board.id} className="homerow" onClick={() => openBoard(board.id)}>
                  <span className="homerow__thumb">
                    <BoardThumb board={board} />
                  </span>
                  <span className="homerow__main">
                    <span className="homerow__title truncate">{board.title}</span>
                    <span className="homerow__meta truncate">
                      {formatDate(board.updatedAt)} · {formatNumber(board.itemCount)} объектов ·{' '}
                      {formatBytes(board.assetBytes)} · {projectName(board.projectId)}
                    </span>
                  </span>
                  <span className="tile__menu" onClick={(event) => event.stopPropagation()}>
                    {boardMenu(board)}
                  </span>
                </div>
              ))}
            </div>
          )
        ) : (
          <Empty
            title={search ? 'Ничего не найдено' : archived ? 'Архив пуст' : 'Досок пока нет'}
            text={
              search
                ? 'Измените запрос или сбросьте фильтры, чтобы увидеть другие доски.'
                : 'Вставьте содержимое из буфера обмена, откройте файл с доской или создайте пустую доску.'
            }
            action={
              <div className="field__row">
                <button type="button" className="btn btn--primary" onClick={() => navigate({ name: 'home' })}>
                  <ClipboardPaste size={15} />
                  Вставить из буфера
                </button>
                <button type="button" className="btn" onClick={() => setDialog({ kind: 'newBoard' })}>
                  <Plus size={15} />
                  Новая доска
                </button>
              </div>
            }
          />
        )}
      </div>

      <Modal
        open={dialog.kind === 'newBoard'}
        title="Новая доска"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void createBoard()}>
              Создать
            </button>
          </>
        }
      >
        <div className="field">
          <span className="field__label">Название</span>
          <input
            className="input"
            autoFocus
            value={draft}
            placeholder="Новая доска"
            onChange={(event) => setDraft(event.target.value)}
          />
          <span className="field__hint">Доска создаётся пустой. Объекты можно добавить позже или вставить из буфера.</span>
        </div>
      </Modal>

      <Modal
        open={dialog.kind === 'renameBoard'}
        title="Переименовать доску"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void renameBoard((dialog as { board: BoardMeta }).board)}>
              Сохранить
            </button>
          </>
        }
      >
        <div className="field">
          <span className="field__label">Название</span>
          <input className="input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
        </div>
      </Modal>

      <Modal
        open={dialog.kind === 'moveBoard'}
        title="Переместить в проект"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void moveBoard((dialog as { board: BoardMeta }).board)}>
              Переместить
            </button>
          </>
        }
      >
        <div className="field">
          <span className="field__label">Папка</span>
          <select className="select" value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
            <option value="">Без папки</option>
            {library.projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <span className="field__hint">Доска останется в библиотеке, изменится только её принадлежность проекту.</span>
        </div>
      </Modal>

      <Modal
        open={dialog.kind === 'deleteBoard'}
        title="Удалить доску"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void deleteBoard((dialog as { board: BoardMeta }).board)}>
              <Trash2 size={14} />
              Удалить
            </button>
          </>
        }
      >
        <div className="stack">
          <div>
            Доска «{(dialog as { board: BoardMeta }).board?.title}» будет убрана из библиотеки. Отменить это действие
            нельзя.
          </div>
          <label className="check">
            <input type="checkbox" checked={deleteFiles} onChange={(event) => setDeleteFiles(event.target.checked)} />
            Удалить вместе с файлами доски (экономит место на диске)
          </label>
        </div>
      </Modal>

      <Modal
        open={dialog.kind === 'newProject'}
        title="Новая папка"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void createProject()}>
              Создать
            </button>
          </>
        }
      >
        <div className="field">
          <span className="field__label">Название проекта</span>
          <input
            className="input"
            autoFocus
            value={draft}
            placeholder="Например, Воркшоп"
            onChange={(event) => setDraft(event.target.value)}
          />
          <span className="field__hint">Папки живут в боковом меню слева: там же значок, цвет, закрепление и список досок.</span>
        </div>
      </Modal>

      <Modal
        open={dialog.kind === 'renameProject'}
        title="Переименовать папку"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => void renameProject((dialog as { project: Project }).project)}
            >
              Сохранить
            </button>
          </>
        }
      >
        <div className="field">
          <span className="field__label">Название проекта</span>
          <input className="input" autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
        </div>
      </Modal>

      <Modal
        open={dialog.kind === 'deleteProject'}
        title="Удалить папку"
        onClose={close}
        footer={
          <>
            <button type="button" className="btn" onClick={close}>
              Отмена
            </button>
            <button
              type="button"
              className="btn btn--danger"
              disabled={busy}
              onClick={() => void deleteProject((dialog as { project: Project }).project)}
            >
              <Trash2 size={14} />
                Удалить папку
            </button>
          </>
        }
      >
        <div className="stack">
          <div>Папка «{(dialog as { project: Project }).project?.name}» будет удалён. Выберите, что делать с досками.</div>
          <label className="check">
            <input
              type="checkbox"
              checked={deleteMode === 'deleteBoards'}
              onChange={(event) => setDeleteMode(event.target.checked ? 'deleteBoards' : 'unassign')}
            />
            Удалить также все доски проекта
          </label>
          <div className="field__hint">
            {deleteMode === 'deleteBoards'
              ? 'Доски и их файлы будут удалены с диска без возможности восстановления.'
              : 'Доски останутся в библиотеке без проекта.'}
          </div>
        </div>
      </Modal>
    </div>
  )
}
