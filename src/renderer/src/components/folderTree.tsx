import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ChevronDown, ChevronRight, Copy, FolderInput, LayoutGrid, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2 } from 'lucide-react'
import type { BoardMeta, LibraryIndex, Project } from '@shared/types'
import type { ToastKind } from '../lib/store'
import { api } from '../lib/api'
import { navigate, type Route } from '../router'
import { FOLDER_COLORS, FOLDER_ICONS, FolderIcon, folderIconImageUrl } from './folderIcon'
import type { MenuItem } from './menu'
import { ContextMenu, Menu } from './menu'
import { Modal } from './ui'

const NONE = 'none'
const ROOT = 'root'
const REACH = 5

interface Row {
  id: string
  top: number
  height: number
}

interface Snapshot {
  root: Row[]
  groups: Record<string, Row[]>
}

interface Drag {
  kind: 'folder' | 'board'
  id: string
  group: string
  label: string
  size: number
  slotGroup: string
  slot: number
  pointerY: number
  left: number
  width: number
}

type Pop =
  | { kind: 'board'; board: BoardMeta; x: number; y: number }
  | { kind: 'folder'; project: Project; x: number; y: number }
  | { kind: 'none'; x: number; y: number }
  | null

interface TreeProps {
  library: LibraryIndex
  route: Route
  onFail: (text: string) => void
  onToast: (text: string, kind?: ToastKind) => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function FolderTree(props: TreeProps): ReactNode {
  const [editing, setEditing] = useState<Project | 'new' | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ project: Project; count: number } | null>(null)
  const [renaming, setRenaming] = useState<BoardMeta | null>(null)
  const [removing, setRemoving] = useState<BoardMeta | null>(null)
  const [draft, setDraft] = useState('')
  const [keepFiles, setKeepFiles] = useState(true)
  const [pop, setPop] = useState<Pop>(null)
  const [dragging, setDragging] = useState<Drag | null>(null)
  const [open, setOpen] = useState<Set<string>>(() => new Set([NONE]))
  const [shiftHeld, setShiftHeld] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const blocks = useRef(new Map<string, HTMLElement>())
  const rows = useRef(new Map<string, HTMLElement>())
  const snap = useRef<Snapshot | null>(null)
  const drag = useRef<{ kind: 'folder' | 'board'; id: string; group: string; label: string; x: number; y: number; live: boolean } | null>(null)
  const state = useRef<Drag | null>(null)
  const draggedAt = useRef(0)
  const watchers = useRef<{ move: (event: PointerEvent) => void; up: () => void } | null>(null)

  useEffect(() => () => stopWatch(), [])

  useEffect(() => {
    const press = (event: KeyboardEvent): void => setShiftHeld(event.shiftKey || event.key === 'Shift')
    const release = (event: KeyboardEvent): void => setShiftHeld(event.shiftKey)
    const reset = (): void => setShiftHeld(false)
    window.addEventListener('keydown', press)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('keydown', press)
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', reset)
    }
  }, [])

  const boards = useMemo(
    () => props.library.boards.filter((board) => !board.archived).sort(byOrder),
    [props.library.boards]
  )
  const projects = useMemo(() => {
    const list = [...props.library.projects].sort((left, right) => left.order - right.order)
    return [...list.filter((project) => project.pinned), ...list.filter((project) => !project.pinned)]
  }, [props.library.projects])

  const boardsOf = (id: string): BoardMeta[] =>
    id === NONE ? boards.filter((board) => !board.projectId) : boards.filter((board) => board.projectId === id)

  const groups = [NONE, ...projects.map((project) => project.id)]

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
      props.onFail(message(error))
    }
  }

  const togglePin = async (project: Project): Promise<void> => {
    try {
      await api.project.update(project.id, { pinned: !project.pinned })
    } catch (error) {
      props.onFail(message(error))
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
      props.onFail(message(error))
    }
  }

  const newBoard = async (projectId?: string): Promise<void> => {
    try {
      const doc = await api.board.create('Новая доска', projectId)
      props.onToast('Создана новая пустая доска', 'board')
      navigate({ name: 'board', docId: doc.id })
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const duplicateBoard = async (board: BoardMeta): Promise<void> => {
    try {
      await api.board.duplicate(board.id)
      props.onToast('Копия доски создана', 'copy')
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const renameBoard = async (board: BoardMeta): Promise<void> => {
    const title = draft.trim()
    if (!title) return
    try {
      await api.board.rename(board.id, title)
      setRenaming(null)
      setDraft('')
      props.onToast('Доска переименована', 'board')
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const deleteBoard = async (board: BoardMeta): Promise<void> => {
    try {
      await api.board.remove(board.id, !keepFiles)
      setRemoving(null)
      props.onToast('Доска удалена', 'delete')
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const eraseBoard = async (board: BoardMeta): Promise<void> => {
    try {
      await api.board.remove(board.id, true)
      props.onToast('Доска удалена', 'delete')
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const moveTo = async (board: BoardMeta, groupId: string): Promise<void> => {
    try {
      await api.board.update(board.id, { projectId: groupId === NONE ? undefined : groupId })
      const name = groupId === NONE ? 'Без папки' : projects.find((project) => project.id === groupId)?.name ?? ''
      props.onToast(`Доска перенесена в «${name}»`, 'folder')
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const toggle = (id: string): void => {
    if (dragging) return
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const measure = (): Snapshot => {
    const root: Row[] = []
    const groupRows: Record<string, Row[]> = {}
    for (const id of groups) {
      const block = blocks.current.get(id)
      if (block) root.push({ id, top: block.offsetTop, height: block.offsetHeight })
      groupRows[id] = []
      for (const board of boardsOf(id)) {
        const el = rows.current.get(`${id}/${board.id}`)
        if (el) groupRows[id].push({ id: board.id, top: el.offsetTop, height: el.offsetHeight })
      }
    }
    return { root, groups: groupRows }
  }

  const put = (next: Drag | null): void => {
    state.current = next
    setDragging(next)
  }

  const begin = (kind: 'folder' | 'board', id: string, group: string, label: string, event: ReactPointerEvent<HTMLElement>): void => {
    if (event.button !== 0 || dragging) return
    stopWatch()
    drag.current = { kind, id, group, label, x: event.clientX, y: event.clientY, live: false }
    const move = (native: PointerEvent): void => track(native.clientX, native.clientY)
    const up = (): void => finish()
    watchers.current = { move, up }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const track = (x: number, y: number): void => {
    const current = drag.current
    if (!current) return
    if (!current.live) {
      if (Math.abs(x - current.x) + Math.abs(y - current.y) < REACH) return
      const snapshot = measure()
      const source = sourceRow(snapshot, current)
      if (!source) return
      const box = listRef.current?.getBoundingClientRect()
      current.live = true
      snap.current = snapshot
      put({
        kind: current.kind,
        id: current.id,
        group: current.group,
        label: current.label,
        size: source.height + 1,
        slotGroup: current.kind === 'folder' ? ROOT : current.group,
        slot: source.index,
        pointerY: y,
        left: box?.left ?? 0,
        width: box?.width ?? 220
      })
    }
    place(x, y)
  }

  const place = (x: number, y: number): void => {
    const current = state.current
    const snapshot = snap.current
    if (!current || !snapshot) return
    const next = { ...current, pointerY: y }
    const node = document.elementFromPoint(x, y)
    const block = node?.closest('[data-block-id]')
    const group = block ? block.getAttribute('data-block-id') ?? '' : ''
    if (current.kind === 'board') {
      if (!group) return put(next)
      next.slotGroup = group
      const list = snapshot.groups[group] ?? []
      const boards = block?.querySelector<HTMLElement>('.tree__boards')
      const inside = Boolean(boards) && node?.closest('.tree__boards') === boards
      next.slot = inside ? nearest(list, y - (boards as HTMLElement).getBoundingClientRect().top) : list.length
    } else {
      const at = group ? snapshot.root.findIndex((row) => row.id === group) : -1
      if (at < 0) return put(next)
      const list = snapshot.root
      const pinned = props.library.projects.find((project) => project.id === current.id)?.pinned === true
      const run = sameRun(list, pinned, props.library.projects)
      const rootTop = (listRef.current?.getBoundingClientRect().top ?? 0) - (listRef.current?.scrollTop ?? 0)
      next.slot = clamp(nearest(list, y - rootTop), run.from, run.to + 1)
    }
    put(next)
  }

  const finish = (): void => {
    const current = drag.current
    const dropped = state.current
    const snapshot = snap.current
    stopWatch()
    drag.current = null
    snap.current = null
    put(null)
    if (!current?.live || !dropped || !snapshot) return
    draggedAt.current = Date.now()
    if (dropped.kind === 'folder') void reorderFolders(dropped, snapshot)
    else void reorderBoards(dropped, snapshot)
  }

  const reorderFolders = async (dropped: Drag, snapshot: Snapshot): Promise<void> => {
    const at = snapshot.root.findIndex((row) => row.id === dropped.id)
    if (at < 0 || dropped.slot === at || dropped.slot === at + 1) return
    const ids = snapshot.root.map((row) => row.id).filter((id) => id !== NONE && id !== dropped.id)
    const insertAt = clamp(dropped.slot - 1 - (dropped.slot > at ? 1 : 0), 0, ids.length)
    const next = [...ids.slice(0, insertAt), dropped.id, ...ids.slice(insertAt)]
    const hidden = props.library.projects.map((project) => project.id).filter((id) => !next.includes(id))
    try {
      await api.project.reorder([...next, ...hidden])
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const reorderBoards = async (dropped: Drag, snapshot: Snapshot): Promise<void> => {
    const source = snapshot.groups[dropped.group] ?? []
    const at = source.findIndex((row) => row.id === dropped.id)
    if (dropped.slotGroup === dropped.group && (dropped.slot === at || dropped.slot === at + 1)) return
    const ids = boardsOf(dropped.slotGroup).map((board) => board.id).filter((id) => id !== dropped.id)
    const insertAt = clamp(dropped.slot - (dropped.slotGroup === dropped.group && dropped.slot > at ? 1 : 0), 0, ids.length)
    const next = [...ids.slice(0, insertAt), dropped.id, ...ids.slice(insertAt)]
    const board = props.library.boards.find((item) => item.id === dropped.id)
    if (!board) return
    try {
      if ((board.projectId ?? NONE) !== dropped.slotGroup) {
        await api.board.update(dropped.id, { projectId: dropped.slotGroup === NONE ? undefined : dropped.slotGroup })
      }
      await api.board.reorder(next)
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const stopWatch = (): void => {
    const pair = watchers.current
    if (!pair) return
    window.removeEventListener('pointermove', pair.move)
    window.removeEventListener('pointerup', pair.up)
    window.removeEventListener('pointercancel', pair.up)
    watchers.current = null
  }

  const swallowClick = (event: ReactMouseEvent<HTMLElement>): void => {
    if (Date.now() - draggedAt.current > 350) return
    event.preventDefault()
    event.stopPropagation()
  }

  const shift = (container: string, id: string): number => {
    const current = dragging
    const snapshot = snap.current
    if (!current || !snapshot) return 0
    const list = container === ROOT ? snapshot.root : snapshot.groups[container] ?? []
    const index = list.findIndex((row) => row.id === id)
    if (index < 0) return 0
    if (current.kind === 'folder') {
      if (container !== ROOT) return 0
      const at = list.findIndex((row) => row.id === current.id)
      return (index > at ? -current.size : 0) + (index >= current.slot ? current.size : 0)
    }
    if (container === ROOT) {
      if (current.slotGroup === current.group) return 0
      const from = list.findIndex((row) => row.id === current.group)
      const to = list.findIndex((row) => row.id === current.slotGroup)
      return (index > from ? -current.size : 0) + (index > to ? current.size : 0)
    }
    const at = list.findIndex((row) => row.id === current.id)
    const slot = current.slotGroup === container ? current.slot : -1
    return (at >= 0 && index > at ? -current.size : 0) + (slot >= 0 && index >= slot ? current.size : 0)
  }

  const slotTop = (container: string): number => {
    const current = dragging
    const snapshot = snap.current
    if (!current || !snapshot) return 0
    const list = container === ROOT ? snapshot.root : snapshot.groups[container] ?? []
    const at = list.findIndex((row) => row.id === current.id)
    if (!list.length) return 2
    const base = current.slot < list.length ? list[current.slot].top : list[list.length - 1].top + list[list.length - 1].height
    return at >= 0 && current.slot > at ? base - current.size : base
  }

  const boardItems = (board: BoardMeta): MenuItem[] => {
    const folders: MenuItem[] = [
      {
        id: 'to-none',
        label: 'Без папки',
        radio: true,
        active: !board.projectId,
        run: () => void moveTo(board, NONE)
      }
    ]
    for (const project of projects) {
      folders.push({
        id: `to-${project.id}`,
        label: project.name,
        radio: true,
        active: board.projectId === project.id,
        run: () => void moveTo(board, project.id)
      })
    }
    return [
      {
        id: 'open',
        label: 'Открыть',
        icon: <ChevronRight size={14} />,
        section: 'Доска',
        run: () => navigate({ name: 'board', docId: board.id })
      },
      {
        id: 'rename',
        label: 'Переименовать',
        icon: <Pencil size={14} />,
        hint: 'F2',
        run: () => {
          setDraft(board.title)
          setRenaming(board)
        }
      },
      { id: 'copy', label: 'Дублировать', icon: <Copy size={14} />, run: () => void duplicateBoard(board) },
      { id: 'move', label: 'В папку', icon: <FolderInput size={14} />, submenu: folders },
      { id: 'archive', label: 'В архив', icon: <Archive size={14} />, line: true, run: () => void archive(board) },
      {
        id: 'delete',
        label: 'Удалить',
        icon: <Trash2 size={14} />,
        danger: true,
        run: () => {
          setKeepFiles(true)
          setRemoving(board)
        }
      }
    ]
  }

  const archive = async (board: BoardMeta): Promise<void> => {
    try {
      await api.board.update(board.id, { archived: true })
      props.onToast('Доска в архиве', 'archive')
    } catch (error) {
      props.onFail(message(error))
    }
  }

  const folderItems = (project: Project): MenuItem[] => [
    { id: 'new', label: 'Новая доска', icon: <Plus size={14} />, run: () => void newBoard(project.id) },
    { id: 'rename', label: 'Переименовать', icon: <Pencil size={14} />, run: () => setEditing(project) },
    {
      id: 'pin',
      label: project.pinned ? 'Открепить' : 'Закрепить',
      icon: project.pinned ? <PinOff size={14} /> : <Pin size={14} />,
      active: project.pinned,
      run: () => void togglePin(project)
    },
    { id: 'delete', label: 'Удалить папку', icon: <Trash2 size={14} />, danger: true, line: true, run: () => void removeProject(project) }
  ]

  const folderMenu = (project: Project): MenuItem[] => [
    {
      id: 'pin',
      label: project.pinned ? 'Открепить' : 'Закрепить',
      icon: project.pinned ? <PinOff size={14} /> : <Pin size={14} />,
      active: project.pinned,
      run: () => void togglePin(project)
    },
    { id: 'rename', label: 'Настроить папку', icon: <Pencil size={14} />, run: () => setEditing(project) },
    { id: 'delete', label: 'Удалить папку', icon: <Trash2 size={14} />, danger: true, line: true, run: () => void removeProject(project) }
  ]

  const rowStyle = (container: string, id: string): CSSProperties | undefined => {
    const offset = shift(container, id)
    return offset ? { transform: `translateY(${offset}px)` } : undefined
  }

  const renderBoards = (group: string): ReactNode => {
    const list = boardsOf(group)
    const host = dragging?.kind === 'board' && dragging.slotGroup === group && open.has(group) ? dragging : null
    return (
      <div className="tree__boards" style={host && !list.length ? { minHeight: host.size } : undefined}>
        {host ? <div className="tree__slot" style={{ top: slotTop(group), height: host.size }} /> : null}
        {list.length === 0 && !host ? <div className="tree__hint">Пока нет досок</div> : null}
        {list.map((board) => {
          const gone = dragging?.kind === 'board' && dragging.id === board.id
          const classes = ['tree__board']
          if (props.route.name === 'board' && props.route.docId === board.id) classes.push('tree__board--active')
          if (gone) classes.push('tree__gone')
          return (
            <button
              key={board.id}
              type="button"
              className={classes.join(' ')}
              style={rowStyle(group, board.id)}
              ref={(el) => {
                if (el) rows.current.set(`${group}/${board.id}`, el)
                else rows.current.delete(`${group}/${board.id}`)
              }}
              data-board-id={board.id}
              onClick={() => navigate({ name: 'board', docId: board.id })}
              onClickCapture={swallowClick}
              onPointerDown={(event) => begin('board', board.id, group, board.title, event)}
              onContextMenu={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setPop({ kind: 'board', board, x: event.clientX, y: event.clientY })
              }}
              title={board.title}
            >
              <LayoutGrid size={12} />
              <span className="truncate">{board.title}</span>
              {shiftHeld ? (
                <span
                  className="tree__kill"
                  aria-hidden="true"
                  title="Удалить доску и её файлы"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void eraseBoard(board)
                  }}
                >
                  <Trash2 size={12} />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  const renderBlock = (group: string, project: Project | null): ReactNode => {
    const list = boardsOf(group)
    const expanded = open.has(group)
    const name = project?.name ?? 'Без папки'
    const classes = ['tree']
    if (active === group) classes.push('tree--active')
    if (dragging?.kind === 'folder' && dragging.id === group) classes.push('tree__gone')
    const target = dragging?.kind === 'board' && dragging.slotGroup === group && !open.has(group)
    return (
      <div
        key={group}
        className={classes.join(' ')}
        data-block-id={group}
        style={rowStyle(ROOT, group)}
        ref={(el) => {
          if (el) blocks.current.set(group, el)
          else blocks.current.delete(group)
        }}
        onClickCapture={swallowClick}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setPop(project ? { kind: 'folder', project, x: event.clientX, y: event.clientY } : { kind: 'none', x: event.clientX, y: event.clientY })
        }}
      >
        <div className={target ? 'tree__row tree__row--target' : 'tree__row'}>
          <button
            type="button"
            className="tree__toggle"
            onClick={() => toggle(group)}
            title={expanded ? 'Свернуть список досок' : 'Развернуть список досок'}
            aria-label={expanded ? 'Свернуть список досок' : 'Развернуть список досок'}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <button
            type="button"
            className="tree__main"
            onClick={() => navigate(group === NONE ? { name: 'home' } : { name: 'project', projectId: group })}
            onPointerDown={(event) => begin('folder', group, group, name, event)}
            title={name}
            aria-label={name}
          >
            <FolderIcon project={project ?? undefined} size={16} />
            <span className="truncate">{name}</span>
            <span className="tree__count">{list.length}</span>
          </button>
          {project ? (
            <div className="tree__tools">
              <button type="button" title="Новая доска в папке"
aria-label="Новая доска в папке" onClick={() => void newBoard(project.id)}>
                <Plus size={13} />
              </button>
              <Menu label="Папка" align="left" items={folderMenu(project)}>
                <MoreHorizontal size={13} />
              </Menu>
            </div>
          ) : null}
        </div>
        {expanded ? renderBoards(group) : null}
      </div>
    )
  }

  const rootSlot =
    dragging && dragging.kind === 'folder' ? (
      <div className="tree__slot tree__slot--root" style={{ top: slotTop(ROOT), height: dragging.size }} />
    ) : null

  const ghost =
    dragging && drag.current?.live
      ? createPortal(
          <div className="tree__ghost" style={{ left: dragging.left, top: dragging.pointerY - dragging.size / 2, width: dragging.width }}>
            {dragging.kind === 'folder' ? (
              <FolderIcon project={projects.find((project) => project.id === dragging.id) ?? undefined} size={16} />
            ) : (
              <LayoutGrid size={12} />
            )}
            <span className="truncate">{dragging.label}</span>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div className="sidebar__label sidebar__label--row">
        <span>Папки</span>
        <button type="button" className="sidebar__add" onClick={() => setEditing('new')} title="Новая папка" aria-label="Новая папка">
          <Plus size={14} />
        </button>
      </div>
      <div className={dragging ? 'tree__list tree__list--drag' : 'tree__list'} ref={listRef}>
        {rootSlot}
        {renderBlock(NONE, null)}
        {projects.map((project) => renderBlock(project.id, project))}
      </div>
      {pop ? (
        <ContextMenu
          title={pop.kind === 'board' ? pop.board.title : pop.kind === 'folder' ? pop.project.name : 'Без папки'}
          items={pop.kind === 'board' ? boardItems(pop.board) : pop.kind === 'folder' ? folderItems(pop.project) : [{ id: 'new', label: 'Новая доска', icon: <Plus size={14} />, run: () => void newBoard() }]}
          x={pop.x}
          y={pop.y}
          onClose={() => setPop(null)}
        />
      ) : null}
      {ghost}
      {editing ? (
        <FolderModal
          project={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onFail={props.onFail}
          onSave={(patch, photo) => void saveProject(patch, photo)}
        />
      ) : null}
      {renaming ? (
        <Modal
          open
          title="Переименовать доску"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setRenaming(null)}>
                Отмена
              </button>
              <button type="button" className="btn btn--primary" onClick={() => void renameBoard(renaming)}>
                Сохранить
              </button>
            </>
          }
        >
          <div className="field">
            <input className="input" aria-label="Название папки" value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus />
          </div>
        </Modal>
      ) : null}
      {removing ? (
        <Modal
          open
          title="Удалить доску"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setRemoving(null)}>
                Отмена
              </button>
              <button type="button" className="btn btn--danger" onClick={() => void deleteBoard(removing)}>
                <Trash2 size={14} />
                Удалить
              </button>
            </>
          }
        >
          <div className="stack">
            <div>
              Доска «{removing.title}» будет убрана из библиотеки. Отменить это действие нельзя.
            </div>
            <label className="check">
              <input type="checkbox" checked={keepFiles} onChange={(event) => setKeepFiles(event.target.checked)} />
              Оставить файлы доски на диске
            </label>
          </div>
        </Modal>
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

function sourceRow(snapshot: Snapshot, current: { kind: 'folder' | 'board'; id: string; group: string }): (Row & { index: number }) | null {
  const list = current.kind === 'folder' ? snapshot.root : snapshot.groups[current.group] ?? []
  const index = list.findIndex((row) => row.id === current.id)
  if (index < 0) return null
  return { ...list[index], index }
}

function nearest(list: Row[], y: number): number {
  for (let i = 0; i < list.length; i += 1) {
    if (y < list[i].top + list[i].height / 2) return i
  }
  return list.length
}

function sameRun(root: Row[], pinned: boolean, projects: Project[]): { from: number; to: number } {
  let from = -1
  let to = -1
  root.forEach((row, index) => {
    if (index === 0) return
    const isPinned = projects.find((project) => project.id === row.id)?.pinned === true
    if (isPinned !== pinned) return
    if (from < 0) from = index
    to = index
  })
  return from < 0 ? { from: 1, to: 1 } : { from, to }
}

function byOrder(left: BoardMeta, right: BoardMeta): number {
  const delta = (left.order ?? 0) - (right.order ?? 0)
  if (delta !== 0) return delta
  return left.updatedAt < right.updatedAt ? 1 : -1
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
