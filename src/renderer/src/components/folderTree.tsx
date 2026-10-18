import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, ChevronRight, LayoutGrid, Pencil, Pin, Plus, Trash2 } from 'lucide-react'
import type { BoardMeta, LibraryIndex, Project } from '@shared/types'
import { api } from '../lib/api'
import { navigate, type Route } from '../router'
import { FOLDER_COLORS, FOLDER_ICONS, FolderIcon, folderIconImageUrl } from './folderIcon'
import { Modal } from './ui'

const NONE = 'none'

interface TreeProps {
  library: LibraryIndex
  route: Route
  onFail: (text: string) => void
  onToast: (text: string, kind?: 'info' | 'success' | 'error') => void
}

export function FolderTree(props: TreeProps): ReactNode {
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set([NONE]))
  const [pendingDelete, setPendingDelete] = useState<{ project: Project; count: number } | null>(null)

  const boards = useMemo(
    () => props.library.boards.filter((board) => !board.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [props.library.boards]
  )
  const projects = useMemo(() => {
    const list = [...props.library.projects].sort((left, right) => left.order - right.order)
    return [...list.filter((project) => project.pinned), ...list.filter((project) => !project.pinned)]
  }, [props.library.projects])

  const boardsOf = (id: string): BoardMeta[] => (id === NONE ? boards.filter((board) => !board.projectId) : boards.filter((board) => board.projectId === id))

  const toggle = (id: string): void => {
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const active = props.route.name === 'project' ? props.route.projectId : NONE

  const saveProject = async (patch: Partial<Project>, photo?: string | null): Promise<void> => {
    try {
      let targetId = ''
      if (editing === 'new') {
        const project = await api.project.create(patch.name ?? 'Новая папка')
        await api.project.update(project.id, patch)
        targetId = project.id
        setOpen((current) => new Set(current).add(project.id))
      } else if (editing) {
        await api.project.update(editing.id, patch)
        targetId = editing.id
      }
      if (targetId && photo !== undefined) await api.project.setIconImage(targetId, photo ?? undefined)
      setEditing(null)
    } catch (error) {
      props.onFail(error instanceof Error ? error.message : String(error))
    }
  }

  const togglePin = async (project: Project): Promise<void> => {
    try {
      await api.project.update(project.id, { pinned: !project.pinned })
    } catch (error) {
      props.onFail(error instanceof Error ? error.message : String(error))
    }
  }

  const removeProject = async (project: Project): Promise<void> => {
    const count = props.library.boards.filter((board) => board.projectId === project.id).length
    setPendingDelete({ project, count })
  }

  const confirmDelete = async (withBoards: boolean): Promise<void> => {
    if (!pendingDelete) return
    try {
      await api.project.remove(pendingDelete.project.id, withBoards && pendingDelete.count > 0 ? 'deleteBoards' : 'unassign')
      setPendingDelete(null)
      props.onToast(
        withBoards && pendingDelete.count > 0 ? 'Папка удалена вместе с досками' : 'Папка удалена, доски остались в «Без папки»',
        'success'
      )
    } catch (error) {
      props.onFail(error instanceof Error ? error.message : String(error))
    }
  }

  const drop = (targetId: string): void => {
    if (!dragId || dragId === targetId) {
      setDragId(null)
      setOverId(null)
      return
    }
    const ids = props.library.projects.map((project) => project.id).filter((id) => id !== dragId)
    const at = ids.indexOf(targetId)
    ids.splice(at < 0 ? ids.length : at, 0, dragId)
    void api.project.reorder(ids).catch((error: unknown) => props.onFail(String(error)))
    setDragId(null)
    setOverId(null)
  }

  const renderRow = (id: string, project: Project | null): ReactNode => {
    const list = boardsOf(id)
    const name = project?.name ?? 'Без папки'
    const expanded = open.has(id)
    const classes = ['tree']
    if (active === id) classes.push('tree--active')
    if (overId === id) classes.push('tree--over')
    return (
      <div
        key={id}
        className={classes.join(' ')}
        draggable={Boolean(project)}
        onDragStart={() => setDragId(id)}
        onDragEnd={() => {
          setDragId(null)
          setOverId(null)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setOverId(id)
        }}
        onDrop={(event) => {
          event.preventDefault()
          drop(id)
        }}
      >
        <div className="tree__row">
          <button
            type="button"
            className="tree__toggle"
            onClick={() => toggle(id)}
            title={expanded ? 'Свернуть список досок' : 'Развернуть список досок'}
            aria-label={expanded ? 'Свернуть список досок' : 'Развернуть список досок'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            type="button"
            className="tree__main"
            onClick={() => navigate(id === NONE ? { name: 'home' } : { name: 'project', projectId: id })}
            title={name}
          >
            <FolderIcon project={project ?? undefined} size={16} />
            <span className="truncate">{name}</span>
            <span className="tree__count">{list.length}</span>
          </button>
          {project ? (
            <div className="tree__tools">
              <button type="button" title={project.pinned ? 'Открепить' : 'Закрепить'} onClick={() => void togglePin(project)}>
                {project.pinned ? <Pin size={13} /> : <ChevronRight size={13} style={{ opacity: 0 }} />}
              </button>
              <button type="button" title="Настроить папку" onClick={() => setEditing(project)}>
                <Pencil size={13} />
              </button>
              <button type="button" title="Удалить папку" onClick={() => void removeProject(project)}>
                <Trash2 size={13} />
              </button>
            </div>
          ) : null}
        </div>
        {expanded ? (
          <div className="tree__boards">
            {list.length === 0 ? (
              <div className="tree__hint">Пока нет досок</div>
            ) : (
              list.map((board) => (
                <button
                  key={board.id}
                  type="button"
                  className={
                    props.route.name === 'board' && props.route.docId === board.id ? 'tree__board tree__board--active' : 'tree__board'
                  }
                  onClick={() => navigate({ name: 'board', docId: board.id })}
                  title={board.title}
                >
                  <LayoutGrid size={12} />
                  <span className="truncate">{board.title}</span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <>
      <div className="sidebar__label sidebar__label--row">
        <span>Папки</span>
        <button type="button" className="sidebar__add" onClick={() => setEditing('new')} title="Новая папка" aria-label="Новая папка">
          <Plus size={14} />
        </button>
      </div>
      <div className="tree__list">{renderRow(NONE, null)}{projects.map((project) => renderRow(project.id, project))}</div>
      {editing ? (
        <FolderModal
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onFail={props.onFail}
          onSave={(patch, photo) => void saveProject(patch, photo)}
        />
      ) : null}
      {pendingDelete ? (
        <Modal open title="Удалить папку" onClose={() => setPendingDelete(null)}>
          <div className="field__hint">
            Папка «{pendingDelete.project.name}» будет удалена.{' '}
            {pendingDelete.count > 0
              ? `В ней ${pendingDelete.count} досок. Выберите, что с ними сделать.`
              : 'В папке нет досок.'}
          </div>
          <div className="field__row" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
            {pendingDelete.count > 0 ? (
              <>
                <button type="button" className="btn" onClick={() => void confirmDelete(false)}>
                  Оставить доски
                </button>
                <button type="button" className="btn btn--danger" onClick={() => void confirmDelete(true)}>
                  Удалить вместе с досками
                </button>
              </>
            ) : (
              <button type="button" className="btn btn--danger" onClick={() => void confirmDelete(false)}>
                Удалить папку
              </button>
            )}
          </div>
        </Modal>
      ) : null}
    </>
  )
}

function FolderModal(props: {
  project: Project | null
  onClose: () => void
  onFail: (text: string) => void
  onSave: (patch: Partial<Project>, photo?: string | null) => void
}): ReactNode {
  const [name, setName] = useState(props.project?.name ?? '')
  const [icon, setIcon] = useState(props.project?.icon ?? 'folder')
  const [iconColor, setIconColor] = useState(props.project?.iconColor ?? '#0d0d0f')
  const [glyph, setGlyph] = useState(props.project?.glyph ?? '')
  const [custom, setCustom] = useState(Boolean(props.project?.glyph))
  const [photo, setPhoto] = useState<string | null>(null)
  const [dropped, setDropped] = useState(false)
  const [tab, setTab] = useState<'icon' | 'photo'>(props.project?.hasIconImage ? 'photo' : 'icon')

  const choosePhoto = async (): Promise<void> => {
    try {
      const dataUrl = await api.dialog.pickImage()
      if (!dataUrl) return
      setPhoto(dataUrl)
      setDropped(false)
    } catch (error) {
      props.onFail(error instanceof Error ? error.message : String(error))
    }
  }

  const storedPhoto = Boolean(props.project?.hasIconImage) && !dropped
  const previewSrc = photo || (storedPhoto ? folderIconImageUrl(props.project?.id) ?? '' : '')

  const preview: Project = {
    id: '',
    name,
    createdAt: '',
    updatedAt: '',
    order: 0,
    icon,
    iconColor,
    glyph: custom ? glyph : undefined
  }

  return (
    <Modal open title={props.project ? 'Папка' : 'Новая папка'} onClose={props.onClose}>
      <div className="field">
        <span className="field__label">Название</span>
        <input className="input" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </div>
      <div className="foldertabs">
        <button type="button" className="foldertabs__btn" data-active={tab === 'icon'} onClick={() => setTab('icon')}>
          Значок
        </button>
        <button type="button" className="foldertabs__btn" data-active={tab === 'photo'} onClick={() => setTab('photo')}>
          Своя картинка
        </button>
      </div>
      {tab === 'icon' ? (
        <>
          <div className="field">
            <span className="field__label">Значок</span>
            <div className="folderpick">
              {FOLDER_ICONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="folderpick__item"
                  data-active={!custom && icon === entry.id}
                  onClick={() => {
                    setIcon(entry.id)
                    setCustom(false)
                  }}
                  title={entry.label}
                  aria-label={entry.label}
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d={entry.path} />
                  </svg>
                </button>
              ))}
              <button
                type="button"
                className="folderpick__item"
                data-active={custom}
                onClick={() => setCustom(true)}
                title="Свой символ"
                aria-label="Свой символ"
              >
                <span style={{ fontSize: 15 }}>{glyph || '★'}</span>
              </button>
            </div>
          </div>
          {custom ? (
            <div className="field">
              <span className="field__label">Свой символ (1–2 знака)</span>
              <input className="input" value={glyph} maxLength={2} placeholder="Например: КТ" onChange={(event) => setGlyph(event.target.value)} />
            </div>
          ) : null}
          <div className="field">
            <span className="field__label">Цвет значка</span>
            <div className="folderpick folderpick--colors">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="folderswatch"
                  style={{ background: color }}
                  data-active={iconColor.toLowerCase() === color.toLowerCase()}
                  onClick={() => setIconColor(color)}
                  title={color}
                  aria-label={`Цвет ${color}`}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <span className="field__label">Картинка для значка</span>
          <div className="folderphoto">
            {previewSrc ? (
              <img className="folderphoto__img" src={previewSrc} alt="" />
            ) : (
              <div className="folderphoto__empty">Нет картинки</div>
            )}
            <div className="folderphoto__tools">
              <button type="button" className="btn" onClick={() => void choosePhoto()}>
                {previewSrc ? 'Заменить' : 'Выбрать картинку'}
              </button>
              {previewSrc ? (
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setPhoto(null)
                    setDropped(true)
                  }}
                >
                  Убрать
                </button>
              ) : null}
            </div>
          </div>
          <div className="field__hint">Картинка обрезается по центру и скругляется по краям. Подойдёт любой квадратный файл.</div>
        </div>
      )}
      <div className="folderpreview">
        {tab === 'photo' && previewSrc ? (
          <img className="foldericon foldericon--photo" width={18} height={18} src={previewSrc} alt="" />
        ) : (
          <FolderIcon project={preview} size={18} />
        )}
        <span className="truncate">{name || 'Название папки'}</span>
      </div>
      <div className="field__row" style={{ justifyContent: 'flex-end', marginTop: 14 }}>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            const patch: Partial<Project> = {
              name: name.trim() || 'Новая папка',
              icon,
              iconColor,
              glyph: custom ? glyph : undefined
            }
            let next: string | null | undefined = undefined
            if (tab === 'photo') {
              if (photo) next = photo
              else if (storedPhoto) next = null
            } else if (storedPhoto || photo) {
              next = null
            }
            props.onSave(patch, next)
          }}
        >
          Сохранить
        </button>
      </div>
    </Modal>
  )
}