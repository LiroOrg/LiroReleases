import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowLeft,
  Box,
  BringToFront,
  ClipboardPaste,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  ExternalLink,
  Grid3x3,
  Hand,
  Image,
  ImageOff,
  ImagePlus,
  Info,
  Layers,
  LineChart,
  Link2,
  List,
  Lock,
  LockOpen,
  Maximize,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  MoveUpRight,
  Magnet,
  PaintBucket,
  PenLine,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Search,
  SendToBack,
  SlidersHorizontal,
  Square,
  StickyNote,
  Trash2,
  Type,
  Undo2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { AssetRef, BoardDoc, BoardItem, GraphExpr, GraphItem, GridMode, Rect, ShapeName, SolidFace, SolidItem, SolidKind } from '@shared/types'
import { solidBounds, solidFaceAt, solidPolygons } from '@shared/three'
import { compileFormula } from '@shared/graph'
import { shadesOf } from '@shared/color'
import { faceFromScreen, solidFaceMap } from './faceMap'
import { alignDelta, snapBox, unionBox } from './align'
import type { AlignMode, Guide, Placed } from './align'
import { clamp, fitTextBox, smoothPoints, uid } from '@shared/util'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { navigate } from '../router'
import { ItemView, itemBounds, visibleItems } from './scene'
import { ConnectorLayer } from './connectors'
import { BoardDetails } from './boardDetails'
import { BoardSettings } from './boardSettings'
import { Inspector } from './inspector'
import { ObjectsPanel, isUnsupported, kindLabel } from './objectsPanel'
import { ExportDialog } from './exportDialog'
import { Spinner } from '../components/ui'
import { parseClipboardHtml, parseClipboardText, payloadFromEvent } from '../lib/paste'

interface Viewport {
  x: number
  y: number
  zoom: number
}

type DragMode =
  | { kind: 'idle' }
  | {
      kind: 'pan'
      startX: number
      startY: number
      originX: number
      originY: number
      velocityX: number
      velocityY: number
      movedAt: number
      button: number
      moved: boolean
    }
  | { kind: 'rubber'; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: 'move'; startX: number; startY: number; ids: string[]; origins: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'draw'; points: Array<{ x: number; y: number }>; straight: boolean }
  | { kind: 'erase'; removed: Set<string> }
  | { kind: 'create'; startX: number; startY: number; currentX: number; currentY: number; tool: CreateTool; shape: ShapeName }
  | { kind: 'link'; fromId: string; point: { x: number; y: number } }
  | { kind: 'rotate'; id: string; startX: number; startY: number; pitch: number; yaw: number }
  | { kind: 'face'; id: string; face: string; points: Array<{ x: number; y: number }>; straight: boolean }

type Tool = 'select' | 'pan' | 'draw' | 'erase' | 'create' | 'link' | 'text' | 'sticky' | 'image' | 'solid' | 'graph'

type CreateTool = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow'

type SolidMode = 'rotate' | 'move' | 'paint' | 'draw'

type OrderAction = 'front' | 'back'

const CREATE_SHAPES: Array<{ id: CreateTool; label: string; shape: ShapeName }> = [
  { id: 'rect', label: 'Прямоугольник', shape: 'rectangle' },
  { id: 'rect', label: 'Скруглённый', shape: 'round_rectangle' },
  { id: 'ellipse', label: 'Круг', shape: 'circle' },
  { id: 'triangle', label: 'Треугольник', shape: 'triangle' },
  { id: 'rect', label: 'Ромб', shape: 'diamond' },
  { id: 'rect', label: 'Звезда', shape: 'star' },
  { id: 'rect', label: 'Шестиугольник', shape: 'hexagon' },
  { id: 'rect', label: 'Пятиугольник', shape: 'pentagon' },
  { id: 'rect', label: 'Облако', shape: 'cloud' },
  { id: 'rect', label: 'Стрелка', shape: 'arrow_right' },
  { id: 'rect', label: 'Процесс', shape: 'flowchart_process' },
  { id: 'rect', label: 'Решение', shape: 'flowchart_decision' },
  { id: 'line', label: 'Линия', shape: 'rectangle' },
  { id: 'arrow', label: 'Стрелка', shape: 'rectangle' }
]

const CREATE_STROKES = new Set<CreateTool>(['line', 'arrow'])

function solidIcon(kind: SolidKind): ReactNode {
  const paths: Record<SolidKind, string> = {
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v9m0 0l8-4.5M12 12L4 7.5M12 12v9',
    pyramid: 'M12 3l8 14H4zM12 3v14',
    prism: 'M4 7l8 4 8-4v10l-8 4-8-4zM12 11v10',
    cylinder: 'M5 6h14v12H5zM5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z',
    cone: 'M12 3l7 15H5zM12 3c3.9 0 7 1.3 7 3',
    sphere: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18'
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d={paths[kind]} />
    </svg>
  )
}

function AlignIcon(props: { align: 'left' | 'center' | 'right' }): ReactNode {
  const lines =
    props.align === 'left'
      ? 'M4 6h16M4 12h10M4 18h14'
      : props.align === 'center'
        ? 'M4 6h16M7 12h10M5 18h14'
        : 'M4 6h16M10 12h10M6 18h14'
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d={lines} />
    </svg>
  )
}

function fontSizeOf(item: BoardItem): number {
  if (item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape') return item.fontSize || 16
  return 16
}

function alignOf(item: BoardItem): 'left' | 'center' | 'right' {
  if (item.kind === 'text') return item.align
  if (item.kind === 'sticky') return item.textAlign
  if (item.kind === 'shape') return item.textAlign
  return 'left'
}

function textColorOf(item: BoardItem): string {
  if (item.kind === 'text') return item.color
  if (item.kind === 'sticky') return '#1a1a1a'
  if (item.kind === 'shape') return item.textColor ?? '#1a1a1a'
  return '#1a1a1a'
}

function shapeIcon(shape: ShapeName): ReactNode {
  const path: Record<string, string> = {
    rectangle: 'M3 5h18v14H3z',
    round_rectangle: 'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
    circle: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
    triangle: 'M12 4l9 16H3z',
    diamond: 'M12 3l9 9-9 9-9-9z',
    star: 'M12 3l2.7 5.9 6.3.7-4.7 4.3 1.3 6.1L12 17l-5.6 3 1.3-6.1L3 9.6l6.3-.7z',
    hexagon: 'M12 3l7 4.5v9L12 21l-7-4.5v-9z',
    pentagon: 'M12 3l8 6-3 10H7L4 9z',
    cloud: 'M7 17a4 4 0 0 1 .5-8 5 5 0 0 1 9.6-1.2A3.8 3.8 0 0 1 18 17z',
    arrow_right: 'M3 9h11V5l7 7-7 7v-4H3z',
    flowchart_process: 'M4 7h16v10H4z',
    flowchart_decision: 'M12 4l8 8-8 8-8-8z'
  }
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d={path[shape] ?? path.rectangle} />
    </svg>
  )
}

function imageSizeOf(dataUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image()
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
    image.onerror = () => resolve(null)
    image.src = dataUrl
  })
}

const MIN_ZOOM = 0.02
const MAX_ZOOM = 6
const CULL_MARGIN = 320
const ERASER_RADIUS = 14
const QUICK_COLORS = ['#1a1a1a', '#7f1d1d', '#1d4ed8', '#15803d', '#b45309']
const QUICK_WIDTHS = [2, 4, 7]
const GRAPH_DIVISIONS = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]
const GRAPH_STROKES = [1, 2, 3, 5, 8]
const SOLID_KINDS: Array<{ id: SolidKind; label: string }> = [
  { id: 'cube', label: 'Куб' },
  { id: 'pyramid', label: 'Пирамида' },
  { id: 'prism', label: 'Призма' },
  { id: 'cylinder', label: 'Цилиндр' },
  { id: 'cone', label: 'Конус' },
  { id: 'sphere', label: 'Шар' }
]
const SOLID_FACE_ORDER: Record<SolidKind, string[]> = {
  cube: ['top', 'front', 'right', 'left', 'back', 'bottom'],
  pyramid: ['front', 'right', 'left', 'back', 'base'],
  prism: ['top', 'left', 'front', 'right', 'back', 'bottom'],
  cylinder: ['top', 'side-0', 'side-6', 'side-12', 'side-18', 'bottom'],
  cone: ['side-0', 'side-6', 'side-12', 'side-18', 'bottom'],
  sphere: ['ball']
}
const SOLID_FACE_COLORS = SOLID_FACE_ORDER
const SOLID_TINTS = ['#8b95a1', '#5f7d8c', '#7a8a6d', '#94795f', '#8a7f95', '#6f7f95']
const SOLID_DEFAULT_TINT = '#8b95a1'

function tintFaces(tint: string, ids: string[]): SolidFace[] {
  const shades = shadesOf(tint, ids.length)
  return ids.map((id, index) => ({ id, color: shades[index] ?? tint }))
}
const NEW_SHAPE_COLOR = '#ffffff'
const NEW_SHAPE_STROKE = '#1a1a1a'

const GRID_MODES: Array<{ id: GridMode; label: string }> = [
  { id: 'none', label: 'Без сетки' },
  { id: 'lines', label: 'Линии' },
  { id: 'dots', label: 'Точки' }
]

const ALIGN_BUTTONS: Array<{ mode: AlignMode; title: string; icon: ReactNode }> = [
  { mode: 'left', title: 'По левому краю', icon: <AlignStartVertical size={16} /> },
  { mode: 'hcenter', title: 'По центру по горизонтали', icon: <AlignCenterVertical size={16} /> },
  { mode: 'right', title: 'По правому краю', icon: <AlignEndVertical size={16} /> },
  { mode: 'top', title: 'По верхнему краю', icon: <AlignStartHorizontal size={16} /> },
  { mode: 'vcenter', title: 'По центру по вертикали', icon: <AlignCenterHorizontal size={16} /> },
  { mode: 'bottom', title: 'По нижнему краю', icon: <AlignEndHorizontal size={16} /> },
  { mode: 'distribute-h', title: 'Распределить по горизонтали', icon: <AlignVerticalDistributeCenter size={16} /> },
  { mode: 'distribute-v', title: 'Распределить по вертикали', icon: <AlignHorizontalDistributeCenter size={16} /> }
]

const ORDER_BUTTONS: Array<{ action: OrderAction; title: string; icon: ReactNode }> = [
  { action: 'front', title: 'На передний план', icon: <BringToFront size={16} /> },
  { action: 'back', title: 'На задний план', icon: <SendToBack size={16} /> }
]

const SOLID_MODES: Array<{ id: SolidMode; title: string; icon: ReactNode }> = [
  { id: 'rotate', title: 'Вращение: тяните по фигуре', icon: <RotateCw size={16} /> },
  { id: 'move', title: 'Перемещение: тяните по фигуре', icon: <Move size={16} /> },
  { id: 'paint', title: 'Заливка грани: щёлкните по грани', icon: <PaintBucket size={16} /> },
  { id: 'draw', title: 'Рисование по грани: тяните по поверхности', icon: <PenLine size={16} /> }
]

const SOLID_VIEWS: Array<{ label: string; short: string; pitch: number; yaw: number }> = [
  { label: 'Спереди', short: 'Фронт', pitch: 0, yaw: 0 },
  { label: 'Сбоку', short: 'Бок', pitch: 0, yaw: 90 },
  { label: 'Сверху', short: 'Сверху', pitch: 80, yaw: 0 },
  { label: 'Изометрия', short: 'Изо', pitch: 24, yaw: 36 }
]

const SOLID_MODE_HINTS: Record<SolidMode, string> = {
  rotate: 'Тяните по фигуре, чтобы повернуть. За границей фигуры — перенос.',
  move: 'Тяните по фигуре, чтобы переместить. Удерживайте Alt для переноса в любом режиме.',
  paint: 'Выберите цвет выше и щёлкните по грани, чтобы её залить.',
  draw: 'Тяните по поверхности, чтобы рисовать прямо на грани.'
}

export function BoardView(props: { docId: string }): ReactNode {
  const toast = useApp((state) => state.toast)
  const fail = useApp((state) => state.fail)
  const setLibrary = useApp((state) => state.setLibrary)
  const settings = useApp((state) => state.settings)
  const setSettings = useApp((state) => state.setSettings)

  const [doc, setDoc] = useState<BoardDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [shownItems, setShownItems] = useState(0)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 0.4 })
  const [size, setSize] = useState({ width: 1200, height: 800 })
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<DragMode>({ kind: 'idle' })
  const [readOnly, setReadOnly] = useState(false)
  const [showInspector, setShowInspector] = useState(false)
  const [objectsOpen, setObjectsOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [gridMode, setGridMode] = useState<GridMode>(settings?.gridMode ?? 'dots')
  const [gridSize, setGridSize] = useState(settings?.gridSize ?? 40)
  const [snapGrid, setSnapGrid] = useState(settings?.snapGrid ?? false)
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  
  const [createTool, setCreateTool] = useState<CreateTool>('rect')
  const [createShape, setCreateShape] = useState<ShapeName>('rectangle')
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [solidKind, setSolidKind] = useState<SolidKind>('cube')
  const [strokeColor, setStrokeColor] = useState('#1a1a1a')
  const [strokeWidth, setStrokeWidth] = useState(3)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [dirty, setDirty] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIndex, setFindIndex] = useState(0)
  const [liveZoom, setLiveZoom] = useState(40)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 8, y: 8 })
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 })
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number; size: number } | null>(null)
  const eraseBaseRef = useRef<BoardItem[] | null>(null)
  const itemNodesRef = useRef(new Map<string, HTMLDivElement>())
  const moveDeltaRef = useRef({ x: 0, y: 0 })
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [dropActive, setDropActive] = useState(false)
  const [alignOpen, setAlignOpen] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const guidesKeyRef = useRef('')
  const snapTargetsRef = useRef<Placed[]>([])
  const [solidMode, setSolidMode] = useState<SolidMode>('rotate')
  const [linkPreview, setLinkPreview] = useState('')
  const [graphDraft, setGraphDraft] = useState<Record<string, string>>({})

  const showGuides = useCallback((next: Guide[]): void => {
    const key = next.map((guide) => `${guide.axis}${Math.round(guide.at)}`).join('|')
    if (key === guidesKeyRef.current) return
    guidesKeyRef.current = key
    setGuides(next)
  }, [])

  const registerNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) itemNodesRef.current.set(id, node)
    else itemNodesRef.current.delete(id)
  }, [])

  const wrapRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    if (!menu) return
    setMenuPos(menu)
    const node = menuRef.current
    const wrap = wrapRef.current
    if (!node || !wrap) return
    const limitY = wrap.clientHeight - node.offsetHeight - 8
    const limitX = wrap.clientWidth - node.offsetWidth - 8
    setMenuPos({
      x: Math.min(menu.x, Math.max(8, limitX)),
      y: Math.min(menu.y, Math.max(8, limitY))
    })
  }, [menu])
  const worldRef = useRef<HTMLDivElement | null>(null)
  const zoomLabelRef = useRef<HTMLSpanElement | null>(null)
  const viewRef = useRef<Viewport>(viewport)
  const targetRef = useRef<Viewport>(viewport)
  const smoothRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastSyncRef = useRef(0)
  const inertiaRef = useRef<number | null>(null)
  const undoRef = useRef<BoardItem[][]>([])
  const redoRef = useRef<BoardItem[][]>([])
  const dragBaseRef = useRef<BoardItem[] | null>(null)
  const spaceRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)
  const thumbTimerRef = useRef<number | null>(null)
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  const applyDom = useCallback((next: Viewport): void => {
    viewRef.current = next
    const world = worldRef.current
    if (world) {
      world.style.transform = `translate3d(${size.width / 2 - next.x * next.zoom}px, ${
        size.height / 2 - next.y * next.zoom
      }px, 0) scale(${next.zoom})`
    }
    if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(next.zoom * 100)}%`
  }, [size])

  const commitViewport = useCallback((next: Viewport, force = false): void => {
    applyDom(next)
    const now = performance.now()
    if (force || now - lastSyncRef.current > 140) {
      lastSyncRef.current = now
      setViewport(next)
      setLiveZoom(next.zoom)
    }
  }, [applyDom])

  const applyView = useCallback(
    (next: Viewport, force = false): void => {
      targetRef.current = next
      if (smoothRef.current !== null) {
        cancelAnimationFrame(smoothRef.current)
        smoothRef.current = null
      }
      commitViewport(next, force)
    },
    [commitViewport]
  )

  const smoothStep = useCallback((): void => {
    if (smoothRef.current !== null) return
    const step = (): void => {
      const target = targetRef.current
      const current = viewRef.current
      const dx = target.x - current.x
      const dy = target.y - current.y
      const dzoom = target.zoom - current.zoom
      const screenX = Math.abs(dx) * current.zoom
      const screenY = Math.abs(dy) * current.zoom
      if (screenX < 0.02 && screenY < 0.02 && Math.abs(dzoom) < current.zoom * 0.0002) {
        smoothRef.current = null
        commitViewport(target, true)
        return
      }
      const ease = Math.max(0.18, 1 - screenX * 0.02)
      commitViewport({
        x: current.x + dx * ease,
        y: current.y + dy * ease,
        zoom: current.zoom + dzoom * ease
      })
      smoothRef.current = requestAnimationFrame(step)
    }
    smoothRef.current = requestAnimationFrame(step)
  }, [commitViewport])

  useEffect(() => {
    if (smoothRef.current === null && inertiaRef.current === null && frameRef.current === null) {
      viewRef.current = viewport
      targetRef.current = viewport
    }
  }, [viewport])

  useEffect(() => {
    applyDom(viewRef.current)
  }, [size, applyDom])

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.board
      .open(props.docId)
      .then((loaded) => {
        if (!alive) return
        setDoc(loaded)
        setTitleDraft(loaded.title)
        setLoading(false)
        const initial = loaded.viewport.zoom
          ? loaded.viewport
          : { x: loaded.bounds.x, y: loaded.bounds.y, zoom: 0.4 }
        viewRef.current = initial
        targetRef.current = initial
        applyDom(initial)
        setViewport(initial)
        setLiveZoom(initial.zoom)
      })
      .catch((error) => {
        if (!alive) return
        setLoading(false)
        fail(error instanceof Error ? error.message : String(error))
        navigate({ name: 'library' })
      })
    return () => {
      alive = false
    }
  }, [props.docId, fail, applyDom])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const measure = (): void => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (!width || !height) return
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
      applyDom(viewRef.current)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [doc, applyDom])

  useEffect(() => {
    if (loading || !doc) return
    const timer = window.setTimeout(() => setReady(true), 30)
    return () => window.clearTimeout(timer)
  }, [loading, doc])

  const visible = useMemo<Rect>(() => {
    const current = viewRef.current
    const halfW = size.width / current.zoom / 2
    const halfH = size.height / current.zoom / 2
    return { x: current.x - halfW, y: current.y - halfH, width: halfW * 2, height: halfH * 2 }
  }, [viewport, size])

  const items = useMemo(() => (doc ? visibleItems(doc, visible) : []), [doc, visible])
  const rendered = useMemo(() => (shownItems > 0 ? items.slice(0, shownItems) : items), [items, shownItems])

  useEffect(() => {
    if (shownItems >= items.length) return
    const step = 260
    const timer = window.setTimeout(() => setShownItems((current) => Math.min(items.length, current + step)), 16)
    return () => window.clearTimeout(timer)
  }, [items.length, shownItems])
  const byId = useMemo(() => new Map((doc?.items ?? []).map((item) => [item.id, item])), [doc])
  const selectedItems = useMemo(() => (doc ? doc.items.filter((item) => selection.has(item.id)) : []), [doc, selection])
  const solidSelection = useMemo(() => selectedItems.filter((item): item is SolidItem => item.kind === 'solid'), [selectedItems])
  const imageSelection = useMemo(() => selectedItems.filter((item) => item.kind === 'image'), [selectedItems])
  const graphSelection = useMemo(() => selectedItems.filter((item): item is GraphItem => item.kind === 'graph'), [selectedItems])
  const selectionLocked = selectedItems.length > 0 && selectedItems.every((item) => item.locked)
  const panelKind: 'none' | 'selection' | 'solid' | 'graph' | 'create' | 'draw' | 'erase' | 'link' | 'text' | 'sticky' | 'image' = (() => {
    if (tool === 'graph') return 'graph'
    if (tool === 'solid') return 'solid'
    if (tool === 'select') {
      if (graphSelection.length > 0) return 'graph'
      if (solidSelection.length > 0) return 'solid'
      return selection.size > 0 && alignOpen ? 'selection' : 'none'
    }
    if (tool === 'pan') return 'none'
    return tool
  })()
  const graphPanel = useMemo(() => {
    const source = graphSelection[0]
    if (!source) return null
    const perUnit = source.scale > 0 ? source.scale : 1
    return {
      w: source.w,
      h: source.h,
      scale: source.scale,
      gridStep: source.gridStep,
      originUnitsX: Math.round((((source.originX - 0.5) * source.w) / perUnit) * 100) / 100,
      originUnitsY: Math.round((((source.originY - 0.5) * source.h) / perUnit) * 100) / 100,
      showGrid: source.showGrid,
      showLabels: source.showLabels,
      expressions: source.expressions
    }
  }, [graphSelection])

  const solidPanel = useMemo(() => {
    const source = solidSelection[0]
    return {
      target: source ?? null,
      targetId: source?.id ?? '',
      edge: source?.edge ?? 240,
      pitch: source?.pitch ?? 24,
      yaw: source?.yaw ?? 36,
      showEdges: source?.showEdges,
      showHidden: source?.showHidden,
      showAxes: source?.showAxes,
      showFaceGrid: source?.showFaceGrid,
      color: source?.color ?? strokeColor,
      lineWidth: source?.lineWidth ?? 2,
      faces: source?.faces ?? [],
      tint: source?.tint ?? SOLID_DEFAULT_TINT,
      hint: SOLID_MODE_HINTS[solidMode]
    }
  }, [solidSelection, solidMode, strokeColor])

  const missingImageItems = useMemo(() => {
    if (!doc) return [] as BoardItem[]
    return doc.items.filter((item) => item.kind === 'image' && !item.asset?.file)
  }, [doc])

  const missingImages = missingImageItems.length

  const selectMissingImages = useCallback(() => {
    if (missingImageItems.length === 0) {
      toast('Заглушек больше нет', 'image')
      return
    }
    setSelection(new Set(missingImageItems.map((item) => item.id)))
    setAlignOpen(true)
    toast(`Выбрано заглушек: ${missingImageItems.length}`, 'select')
  }, [missingImageItems, toast])

  const assetUrl = useCallback(
    (file: string) => (file ? `lirofile://${encodeURIComponent(props.docId)}/${encodeURIComponent(file)}` : ''),
    [props.docId]
  )

  const toWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = wrapRef.current?.getBoundingClientRect()
      const left = rect ? rect.left : 0
      const top = rect ? rect.top : 0
      const current = viewRef.current
      return {
        x: (clientX - left - size.width / 2) / current.zoom + current.x,
        y: (clientY - top - size.height / 2) / current.zoom + current.y
      }
    },
    [size]
  )

  const toScreen = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = wrapRef.current?.getBoundingClientRect()
    return { x: clientX - (rect ? rect.left : 0), y: clientY - (rect ? rect.top : 0) }
  }, [])

  const fitTo = useCallback(
    (rect: Rect, maxZoom = 1.6): void => {
      if (!rect.width || !rect.height) return
      const zoom = clamp(Math.min(size.width / rect.width, size.height / rect.height) * 0.92, MIN_ZOOM, maxZoom)
      applyView({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, zoom }, true)
    },
    [size, applyView]
  )

  const fitAll = useCallback(() => {
    if (doc) fitTo(doc.bounds)
  }, [doc, fitTo])

  const animateTo = useCallback(
    (target: Viewport, duration = 220): void => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (smoothRef.current !== null) {
        cancelAnimationFrame(smoothRef.current)
        smoothRef.current = null
      }
      const from = viewRef.current
      const start = performance.now()
      const step = (): void => {
        const progress = Math.min(1, (performance.now() - start) / duration)
        const eased = 1 - Math.pow(1 - progress, 3)
        const next = {
          zoom: from.zoom + (target.zoom - from.zoom) * eased,
          x: from.x + (target.x - from.x) * eased,
          y: from.y + (target.y - from.y) * eased
        }
        commitViewport(next, true)
        if (progress < 1) {
          frameRef.current = requestAnimationFrame(step)
        } else {
          targetRef.current = target
          frameRef.current = null
        }
      }
      frameRef.current = requestAnimationFrame(step)
    },
    [commitViewport]
  )

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }): void => {
      const current = viewRef.current
      const next = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (!anchor) {
        animateTo({ ...current, zoom: next }, 160)
        return
      }
      const ratio = next / current.zoom
      animateTo({ zoom: next, x: current.x + (anchor.x - current.x) * (1 - ratio), y: current.y + (anchor.y - current.y) * (1 - ratio) }, 140)
    },
    [animateTo]
  )

  useEffect(() => {
    if (!doc) return
    const timer = window.setTimeout(() => {
      const current = viewRef.current
      void api.board.saveViewport(props.docId, current)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [viewport, props.docId, doc])

  useEffect(
    () => () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
      if (inertiaRef.current) cancelAnimationFrame(inertiaRef.current)
      if (smoothRef.current !== null) cancelAnimationFrame(smoothRef.current)
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      if (thumbTimerRef.current !== null) window.clearTimeout(thumbTimerRef.current)
    },
    []
  )

  const changeGrid = useCallback(
    (patch: { gridMode?: GridMode; gridSize?: number; snapGrid?: boolean }): void => {
      if (patch.gridMode !== undefined) setGridMode(patch.gridMode)
      if (patch.gridSize !== undefined) setGridSize(patch.gridSize)
      if (patch.snapGrid !== undefined) setSnapGrid(patch.snapGrid)
      void api.settings
        .set(patch)
        .then((next) => setSettings(next))
        .catch(() => undefined)
    },
    [setSettings]
  )

  const scheduleThumb = useCallback(() => {
    if (thumbTimerRef.current !== null) window.clearTimeout(thumbTimerRef.current)
    thumbTimerRef.current = window.setTimeout(() => {
      thumbTimerRef.current = null
      void api.board.thumbnail(props.docId).catch(() => undefined)
    }, 4000)
  }, [props.docId])

  const remember = useCallback((items: BoardItem[]) => {
    undoRef.current.push(items)
    redoRef.current.length = 0
    setHistoryState({ undo: undoRef.current.length, redo: 0 })
  }, [])

  const persist = useCallback(
    (next: BoardItem[]) => {
      if (!doc) return
      setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
      setDirty(true)
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        void api.board
          .saveItems(props.docId, next)
          .then(() => {
            setDirty(false)
            scheduleThumb()
          })
          .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
      }, 700)
    },
    [doc, props.docId, fail, scheduleThumb]
  )

  const saveNow = useCallback(
    (items: BoardItem[]) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      void api.board.saveItems(props.docId, items).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    },
    [props.docId, fail]
  )

  const commit = useCallback(
    (next: BoardItem[]) => {
      if (!doc) return
      if (next === doc.items) return
      remember(doc.items)
      persist(next)
    },
    [doc, remember, persist]
  )

  const undo = useCallback(() => {
    if (!doc || readOnly) return
    const previous = undoRef.current.pop()
    if (!previous) {
      toast('Отменять нечего', 'undo')
      return
    }
    redoRef.current.push(doc.items)
    setDoc({ ...doc, items: previous, stats: { ...doc.stats, items: previous.length } })
    setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length })
    saveNow(previous)
    toast('Отменено', 'undo')
  }, [doc, readOnly, saveNow, toast])

  const redo = useCallback(() => {
    if (!doc || readOnly) return
    const next = redoRef.current.pop()
    if (!next) {
      toast('Возвращать нечего', 'redo')
      return
    }
    undoRef.current.push(doc.items)
    setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
    setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length })
    saveNow(next)
    toast('Возвращено', 'redo')
  }, [doc, readOnly, saveNow, toast])

  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      event.preventDefault()
      const rect = wrapRef.current?.getBoundingClientRect()
      const left = rect ? rect.left : 0
      const top = rect ? rect.top : 0
      const offsetX = event.clientX - left - size.width / 2
      const offsetY = event.clientY - top - size.height / 2
      const view = viewRef.current
      const step = event.deltaMode === 1 ? event.deltaY * 18 : event.deltaY
      const next = clamp(view.zoom * Math.exp(-step * 0.0016), MIN_ZOOM, MAX_ZOOM)
      if (Math.abs(next - view.zoom) < 1e-9) return
      targetRef.current = {
        zoom: next,
        x: view.x + offsetX / view.zoom - offsetX / next,
        y: view.y + offsetY / view.zoom - offsetY / next
      }
      smoothStep()
    },
    [size, smoothStep]
  )

  const eraseAt = useCallback(
    (point: { x: number; y: number }, already: Set<string>): Set<string> => {
      if (!doc) return already
      const removed = new Set(already)
      const radius = Math.max(6, ERASER_RADIUS / Math.max(0.05, viewRef.current.zoom))
      for (const item of doc.items) {
        if (removed.has(item.id) || item.kind === 'connector' || item.locked) continue
        const box = itemBounds(item)
        if (
          point.x >= box.x - radius &&
          point.x <= box.x + box.width + radius &&
          point.y >= box.y - radius &&
          point.y <= box.y + box.height + radius
        ) {
          removed.add(item.id)
        }
      }
      if (removed.size > already.size) {
        const next = doc.items.filter((item) => !removed.has(item.id))
        setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
        setSelection(new Set())
      }
      return removed
    },
    [doc]
  )

  const [linkFrom, setLinkFrom] = useState<string | null>(null)

  const itemAt = useCallback(
    (point: { x: number; y: number }): string | null => {
      if (!doc) return null
      let best: { id: string; area: number } | null = null
      for (const item of doc.items) {
        if (item.kind === 'connector' || item.locked) continue
        const box = itemBounds(item)
        if (point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height) continue
        const area = box.width * box.height
        if (!best || area < best.area) best = { id: item.id, area }
      }
      return best?.id ?? null
    },
    [doc]
  )

  const createAt = useCallback(
    async (point: { x: number; y: number }, kind: 'text' | 'sticky' | 'image' | 'solid' | 'graph'): Promise<void> => {
      if (!doc || readOnly) return
      if (kind === 'graph') {
        const id = uid('graph_')
        const current = viewRef.current
        const width = Math.round(clamp((size.width / current.zoom) * 0.72, 420, 1100))
        const height = Math.round(clamp((size.height / current.zoom) * 0.72, 300, 760))
        const item: GraphItem = {
          id,
          kind: 'graph',
          x: Math.round(point.x - width / 2),
          y: Math.round(point.y - height / 2),
          w: width,
          h: height,
          rotation: 0,
          z: doc.items.length,
          scale: 40,
          originX: 0.5,
          originY: 0.5,
          gridStep: 1,
          showGrid: true,
          showLabels: true,
          axisColor: '#1a1a1a',
          lineWidth: 2,
          expressions: [
            { id: uid('ex_'), formula: 'x^2', color: '#1d4ed8', lineWidth: 3, visible: true },
            { id: uid('ex_'), formula: '2*x+1', color: '#15803d', lineWidth: 2, visible: true }
          ]
        }
        commit([...doc.items, item])
        setSelection(new Set([id]))
        setTool('select')
        toast('Плоскость создана, добавьте формулы в панели справа', 'graph')
        return
      }
      if (kind === 'solid') {
        const edge = 240
        const box = solidBounds(solidKind, edge, 24, 36)
        const id = uid('solid_')
        const item: SolidItem = {
          id,
          kind: 'solid',
          x: Math.round(point.x - box.width / 2),
          y: Math.round(point.y - box.height / 2),
          w: Math.round(box.width),
          h: Math.round(box.height),
          rotation: 0,
          z: doc.items.length,
          solid: solidKind,
          edge,
          pitch: 24,
          yaw: 36,
          faces: tintFaces(SOLID_DEFAULT_TINT, SOLID_FACE_ORDER[solidKind]),
          tint: SOLID_DEFAULT_TINT,
          sketch: [],
          lineWidth: 2,
          color: strokeColor,
          showEdges: true
        }
        commit([...doc.items, item])
        setSelection(new Set([id]))
        return
      }
      if (kind === 'image') {
        const dataUrl = await api.dialog.pickImage()
        if (!dataUrl) {
          toast('Картинка не выбрана', 'image')
          return
        }
        await addImageAt(dataUrl, point)
        return
      }
      const id = uid(kind === 'text' ? 'text_' : 'sticky_')
      const base = {
        id,
        x: point.x,
        y: point.y,
        rotation: 0,
        z: doc.items.length,
        parentId: undefined,
        relative: 'canvas_center' as const,
        raw: undefined
      }
      if (kind === 'text') {
        const fitted = fitTextBox('Текст', { width: 320, minHeight: 48, fontSize: 20, padX: 2, padY: 2 })
        const item: BoardItem = {
          ...base,
          kind: 'text',
          w: fitted.width,
          h: fitted.height,
          content: 'Текст',
          plain: 'Текст',
          color: '#1a1a1a',
          align: 'left',
          fontSize: fitted.fontSize,
          fontFamily: "'Open Sans', 'Segoe UI', sans-serif",
          urls: []
        }
        commit([...doc.items, item])
        setSelection(new Set([id]))
        setEditing({ id, value: 'Текст' })
        return
      }
      const stickyFit = fitTextBox('Заметка', { width: 200, minHeight: 200, fontSize: 16, padX: 8, padY: 6 })
      const item: BoardItem = {
        ...base,
        kind: 'sticky',
        w: stickyFit.width,
        h: stickyFit.height,
        content: 'Заметка',
        plain: 'Заметка',
        color: '#fff9b1',
        shape: 'square',
        textAlign: 'center',
        textAlignVertical: 'middle',
        fontSize: stickyFit.fontSize,
        urls: [],
        linkToFrame: false
      }
      commit([...doc.items, item])
      setSelection(new Set([id]))
      setEditing({ id, value: 'Заметка' })
    },
    [doc, readOnly, commit, toast, solidKind, strokeColor]
  )

  const addImageAt = useCallback(
    async (dataUrl: string, point: { x: number; y: number }): Promise<void> => {
      if (!doc || readOnly) return
      const id = uid('img_')
      const size = await imageSizeOf(dataUrl)
      const width = size ? size.width : 480
      const height = size ? size.height : Math.round(width * 0.66)
      const scaled = width > 1200 ? 1200 / width : 1
      const finalWidth = Math.round(width * scaled)
      const finalHeight = Math.round(height * scaled)
      const left = Math.round(point.x - finalWidth / 2)
      const top = Math.round(point.y - finalHeight / 2)
      const rawItem = {
        id,
        type: 'image',
        x: left,
        y: top,
        width: finalWidth,
        height: finalHeight,
        position: { x: left + finalWidth / 2, y: top + finalHeight / 2, origin: 'center', relativeTo: 'canvas_center' },
        geometry: { width: finalWidth, height: finalHeight, rotation: 0 },
        data: { imageUrl: dataUrl, altText: 'Картинка' }
      }
      try {
        await api.board.appendItems({ docId: props.docId, items: [rawItem], images: [{ itemId: id, dataUrl }] })
        const loaded = await api.board.open(props.docId)
        remember(doc.items)
        setDoc(loaded)
        setSelection(new Set([id]))
        toast('Картинка добавлена', 'image')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [doc, readOnly, props.docId, remember, toast, fail]
  )

  const createFromDrag = useCallback(
    (drag: { startX: number; startY: number; currentX: number; currentY: number; tool: CreateTool; shape: ShapeName }): BoardItem | null => {
      if (!doc) return null
      const rawX = drag.currentX - drag.startX
      const rawY = drag.currentY - drag.startY
      const dragged = Math.hypot(rawX, rawY) > 8 / viewRef.current.zoom
      const width = dragged ? Math.abs(rawX) : 220
      const height = dragged ? Math.abs(rawY) : drag.tool === 'line' || drag.tool === 'arrow' ? 1 : 220
      const left = dragged ? Math.min(drag.startX, drag.currentX) : drag.startX - (drag.tool === 'line' || drag.tool === 'arrow' ? 0 : width / 2)
      const top = dragged ? Math.min(drag.startY, drag.currentY) : drag.startY - (drag.tool === 'line' || drag.tool === 'arrow' ? 0 : height / 2)
      const id = uid(`${drag.tool}_`)
      if (drag.tool === 'line' || drag.tool === 'arrow') {
        const x1 = drag.startX
        const y1 = drag.startY
        const x2 = drag.currentX
        const y2 = drag.currentY
        if (Math.hypot(x2 - x1, y2 - y1) < 4) return null
        const box = {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.max(1, Math.abs(x2 - x1)),
          height: Math.max(1, Math.abs(y2 - y1))
        }
        const item: BoardItem = {
          id,
          kind: 'connector',
          x: box.x,
          y: box.y,
          w: box.width,
          h: box.height,
          rotation: 0,
          z: doc.items.length,
          points: [
            { x: x1 - box.x, y: y1 - box.y },
            { x: x2 - box.x, y: y2 - box.y }
          ],
          shape: 'straight',
          color: strokeColor,
          lineWidth: strokeWidth,
          lineStyle: 'normal',
          startStroke: 'none',
          endStroke: drag.tool === 'arrow' ? 'arrow' : 'none'
        }
        return item
      }
      const item: BoardItem = {
        id,
        kind: 'shape',
        x: Math.round(left),
        y: Math.round(top),
        w: Math.max(8, Math.round(width)),
        h: Math.max(8, Math.round(height)),
        rotation: 0,
        z: doc.items.length,
        shape: drag.shape,
        content: '',
        plain: '',
        fillColor: NEW_SHAPE_COLOR,
        borderColor: NEW_SHAPE_STROKE,
        borderWidth: 2,
        borderStyle: 'normal',
        opacity: 1,
        textAlign: 'center',
        textAlignVertical: 'middle',
        fontSize: fitTextBox('', { width: Math.max(8, Math.round(width)), minHeight: Math.max(8, Math.round(height)), fontSize: 16, padX: 6, padY: 5 }).fontSize,
        fontFamily: "'Open Sans', 'Segoe UI', sans-serif",
        urls: [],
        textColor: '#1a1a1a'
      }
      return item
    },
    [doc, strokeColor, strokeWidth]
  )

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
      const target = event.target as HTMLElement
      if (target.closest('.overlay, .statusbar, .inspector, .topbar, .ctxmenu')) return
      try {
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
      } catch {
        void 0
      }
      setMenu(null)
      if (tool === 'pan' || event.button === 1 || event.button === 2 || spaceRef.current) {
        setEraserCursor(null)
        const current = viewRef.current
        setDrag({
          kind: 'pan',
          startX: event.clientX,
          startY: event.clientY,
          originX: current.x,
          originY: current.y,
          velocityX: 0,
          velocityY: 0,
          movedAt: performance.now(),
          button: event.button,
          moved: false
        })
        return
      }
      const point = toWorld(event.clientX, event.clientY)
      if (tool === 'draw') {
        event.preventDefault()
        setDrag({ kind: 'draw', points: [point, point], straight: event.shiftKey })
        return
      }
      if (tool === 'erase') {
        if (!doc || readOnly) return
        eraseBaseRef.current = doc.items
        const removed = eraseAt(point, new Set())
        const screen = toScreen(event.clientX, event.clientY)
        setEraserCursor({ x: screen.x, y: screen.y, size: ERASER_RADIUS * 2 })
        setDrag({ kind: 'erase', removed })
        return
      }
      if (tool === 'text' || tool === 'sticky' || tool === 'image' || tool === 'solid' || tool === 'graph') {
        if (event.button !== 0) return
        void createAt(point, tool)
        return
      }
      if (tool === 'create') {
        if (!doc || readOnly || event.button !== 0) return
        setDrag({ kind: 'create', startX: point.x, startY: point.y, currentX: point.x, currentY: point.y, tool: createTool, shape: createShape })
        return
      }
      if (tool === 'link') {
        if (!doc || readOnly || event.button !== 0) return
        const under = itemAt(point)
        if (!under) {
          setLinkFrom(null)
          return
        }
        setLinkFrom(under)
        setDrag({ kind: 'link', fromId: under, point })
        return
      }
      setEraserCursor(null)
      if (event.button !== 0) return
      setDrag({ kind: 'rubber', startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
    },
    [toWorld, toScreen, tool, doc, readOnly, eraseAt, createTool, createShape, createAt, itemAt]
  )

  const faceAtLocal = useCallback((item: SolidItem, point: { x: number; y: number }) => {
    const local = { x: point.x - item.x, y: point.y - item.y }
    return solidFaceAt(item, local)
  }, [])

  const facePointOf = useCallback((item: SolidItem, faceId: string, point: { x: number; y: number }): { x: number; y: number } | null => {
    const polygon = solidPolygons(item).find((entry) => entry.id === faceId)
    if (!polygon) return null
    const map = solidFaceMap(polygon, polygon.points)
    if (!map) return null
    return faceFromScreen(map, { x: point.x - item.x, y: point.y - item.y })
  }, [])

  const paintSolidFace = useCallback(
    (items: BoardItem[], id: string, faceId: string, color: string) => {
      commit(
        items.map((entry) => {
          if (entry.id !== id || entry.kind !== 'solid') return entry
          const found = entry.faces.some((face) => face.id === faceId)
          const faces = found
            ? entry.faces.map((face) => (face.id === faceId ? { ...face, color } : face))
            : [...entry.faces, { id: faceId, color }]
          return { ...entry, faces } as SolidItem
        })
      )
    },
    [commit]
  )

  const onItemPointerDown = useCallback(
    (id: string, event: React.PointerEvent) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const item = byId.get(id)
      if (item?.locked) {
        toast('Объект заблокирован', 'lock')
        return
      }
      if (item?.kind === 'solid' && !readOnly && tool === 'select') {
        const point = toWorld(event.clientX, event.clientY)
        setSelection(new Set([id]))
        const hit = faceAtLocal(item, point)
        if (solidMode === 'draw') {
          if (!hit) return
          setDrag({ kind: 'face', id, face: hit.id, points: [], straight: event.shiftKey })
          return
        }
        if (solidMode === 'paint') {
          if (!hit || !doc) return
          paintSolidFace(doc.items, id, hit.id, strokeColor)
          return
        }
        const moveOnly = solidMode === 'move' || event.altKey || !hit
        if (moveOnly) {
          const origins = new Map<string, { x: number; y: number }>([[id, { x: item.x, y: item.y }]])
          dragBaseRef.current = doc?.items ?? null
          if (snapEnabled && doc) {
            snapTargetsRef.current = doc.items
              .filter((entry) => entry.id !== id && entry.kind !== 'connector')
              .map((entry) => {
                const box = itemBounds(entry)
                return { id: entry.id, x: box.x, y: box.y, width: box.width, height: box.height }
              })
          }
          setDrag({ kind: 'move', startX: point.x, startY: point.y, ids: [id], origins, moved: false })
          return
        }
        dragBaseRef.current = doc?.items ?? null
        setDrag({ kind: 'rotate', id, startX: point.x, startY: point.y, pitch: item.pitch, yaw: item.yaw })
        return
      }
      const next = new Set(selection)
      if (event.shiftKey) {
        if (next.has(id)) next.delete(id)
        else next.add(id)
      } else if (!next.has(id)) {
        next.clear()
        next.add(id)
      }
      setSelection(next)
      if (readOnly || tool !== 'select') return
      const point = toWorld(event.clientX, event.clientY)
      const ids = [...next].filter((itemId) => !byId.get(itemId)?.locked)
      const origins = new Map<string, { x: number; y: number }>()
      for (const itemId of ids) {
        const target = byId.get(itemId)
        if (target && target.kind !== 'connector') origins.set(itemId, { x: target.x, y: target.y })
      }
      dragBaseRef.current = doc?.items ?? null
      if (snapEnabled && doc) {
        const movingIds = new Set(origins.keys())
        const near: Placed[] = []
        for (const item of doc.items) {
          if (movingIds.has(item.id) || item.kind === 'connector') continue
          const box = itemBounds(item)
          if (box.x > 4000 || box.y > 4000) continue
          near.push({ id: item.id, x: box.x, y: box.y, width: box.width, height: box.height })
        }
        snapTargetsRef.current = near
      } else {
        snapTargetsRef.current = []
      }
      setDrag({ kind: 'move', startX: point.x, startY: point.y, ids, origins, moved: false })
    },
    [selection, toWorld, byId, readOnly, tool, doc, toast, solidMode, faceAtLocal, snapEnabled, paintSolidFace, strokeColor]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (drag.kind === 'idle') return
      if (drag.kind === 'pan') {
        const current = viewRef.current
        const dx = (event.clientX - drag.startX) / current.zoom
        const dy = (event.clientY - drag.startY) / current.zoom
        const now = performance.now()
        const dt = Math.max(8, now - drag.movedAt)
        setDrag({
          ...drag,
          velocityX: ((drag.originX - dx - current.x) / dt) * 16,
          velocityY: ((drag.originY - dy - current.y) / dt) * 16,
          movedAt: now,
          moved: drag.moved || Math.hypot(dx, dy) * current.zoom > 3
        })
        applyView({ ...current, x: drag.originX - dx, y: drag.originY - dy })
        return
      }
      const point = toWorld(event.clientX, event.clientY)
      if (drag.kind === 'draw') {
        const last = drag.points[drag.points.length - 1]
        const current = viewRef.current
        const straight = drag.straight || event.shiftKey
        if (straight) {
          if (Math.hypot(point.x - last.x, point.y - last.y) < 1) return
          setDrag({ kind: 'draw', points: [drag.points[0], point], straight: true })
          return
        }
        if (Math.hypot(point.x - last.x, point.y - last.y) < Math.max(1.2, 1.6 / current.zoom)) return
        setDrag({ kind: 'draw', points: [...drag.points, point], straight: false })
        return
      }
      if (drag.kind === 'rubber') {
        setDrag({ ...drag, currentX: point.x, currentY: point.y })
        return
      }
      if (drag.kind === 'rotate' && doc) {
        const pitch = clamp(drag.pitch + (point.y - drag.startY) * 0.5, -80, 80)
        const yaw = (drag.yaw + (point.x - drag.startX) * 0.5) % 360
        const item = byId.get(drag.id)
        if (item?.kind !== 'solid') return
        const box = solidBounds(item.solid, item.edge, pitch, yaw)
        setDoc({
          ...doc,
          items: doc.items.map((entry) =>
            entry.id === drag.id && entry.kind === 'solid'
              ? ({ ...entry, pitch, yaw, w: Math.max(1, Math.round(box.width)), h: Math.max(1, Math.round(box.height)) } as SolidItem)
              : entry
          )
        })
        return
      }
      if (drag.kind === 'face' && doc) {
        const item = byId.get(drag.id)
        if (item?.kind !== 'solid') return
        const local = facePointOf(item, drag.face, point)
        if (!local) return
        const last = drag.points[drag.points.length - 1]
        if (drag.straight || event.shiftKey) {
          const anchor = drag.points[0] ?? drag.points[drag.points.length - 1]
          if (!anchor) {
            setDrag({ ...drag, points: [local], straight: true })
            return
          }
          if (Math.hypot(local.x - anchor.x, local.y - anchor.y) < 1) return
          setDrag({ ...drag, points: [anchor, local], straight: true })
          return
        }
        if (last && Math.hypot(local.x - last.x, local.y - last.y) < 2) return
        setDrag({ ...drag, points: [...drag.points, local] })
        return
      }
      if (drag.kind === 'create') {
        setDrag({ ...drag, currentX: point.x, currentY: point.y })
        return
      }
      if (drag.kind === 'link') {
        setDrag({ ...drag, point })
        return
      }
      if (drag.kind === 'erase') {
        const screen = toScreen(event.clientX, event.clientY)
        setEraserCursor({ x: screen.x, y: screen.y, size: ERASER_RADIUS * 2 })
        const next = eraseAt(point, drag.removed)
        if (next.size !== drag.removed.size) setDrag({ ...drag, removed: next })
        return
      }
      if (tool === 'erase') setEraserCursor(null)
      if (drag.kind !== 'move' || !doc) return
      let dx = point.x - drag.startX
      let dy = point.y - drag.startY
      if (snapEnabled && drag.origins.size) {
        const moving = unionBox(
          selectedItems.filter((item) => drag.origins.has(item.id)).map((item) => itemBounds(item))
        )
        const shifted = { ...moving, x: moving.x + dx, y: moving.y + dy }
        const snapped = snapBox(shifted, snapTargetsRef.current, 8 / Math.max(0.05, viewRef.current.zoom))
        dx += snapped.dx
        dy += snapped.dy
        showGuides(snapped.guides)
      }
      if (snapGrid) {
        const step = gridSize
        const origin = drag.origins.values().next().value as { x: number; y: number } | undefined
        if (origin) {
          dx = Math.round((origin.x + dx) / step) * step - origin.x
          dy = Math.round((origin.y + dy) / step) * step - origin.y
        }
      }
      moveDeltaRef.current = { x: dx, y: dy }
      for (const [id, origin] of drag.origins) {
        const node = itemNodesRef.current.get(id)
        if (!node) continue
        node.style.left = `${Math.round(origin.x + dx)}px`
        node.style.top = `${Math.round(origin.y + dy)}px`
      }
      if (!drag.moved) setDrag({ ...drag, moved: true })
    },
    [drag, toWorld, toScreen, applyView, doc, eraseAt, snapEnabled, snapGrid, gridSize, selectedItems, showGuides]
  )

  const startInertia = useCallback(
    (velocityX: number, velocityY: number): void => {
      if (Math.hypot(velocityX, velocityY) < 0.6) return
      let vx = velocityX
      let vy = velocityY
      let last = performance.now()
      const step = (): void => {
        const now = performance.now()
        const dt = Math.min(64, now - last)
        last = now
        const current = viewRef.current
        vx *= Math.pow(0.94, dt / 16)
        vy *= Math.pow(0.94, dt / 16)
        applyView({ ...current, x: current.x + vx, y: current.y + vy })
        if (Math.hypot(vx, vy) > 0.08) inertiaRef.current = requestAnimationFrame(step)
        else applyView(viewRef.current, true)
      }
      inertiaRef.current = requestAnimationFrame(step)
    },
    [applyView]
  )

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (drag.kind === 'create' && doc) {
        const created = createFromDrag(drag)
        setDrag({ kind: 'idle' })
        if (created) {
          commit([...doc.items, created])
          setSelection(new Set([created.id]))
          if (created.kind === 'connector' && !created.startItemId) setLinkFrom(created.id)
        }
        return
      }
      if (drag.kind === 'rotate' && doc) {
        if (dragBaseRef.current) remember(dragBaseRef.current)
        dragBaseRef.current = null
        persist(doc.items)
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'face' && doc) {
        const item = byId.get(drag.id)
        if (item?.kind === 'solid' && drag.points.length >= 2) {
          if (dragBaseRef.current) remember(dragBaseRef.current)
          dragBaseRef.current = null
          commit(
            doc.items.map((entry) =>
              entry.id === drag.id && entry.kind === 'solid'
                ? ({
                    ...entry,
                    sketch: [
                      ...entry.sketch,
                      { face: drag.face, points: drag.points, color: strokeColor, lineWidth: Math.max(1, strokeWidth) }
                    ]
                  } as SolidItem)
                : entry
            )
          )
        }
        dragBaseRef.current = null
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'link') {
        const target = itemAt(drag.point)
        if (doc && target && target !== drag.fromId) {
          const connector: BoardItem = {
            id: uid('conn_'),
            kind: 'connector',
            x: drag.point.x,
            y: drag.point.y,
            w: 1,
            h: 1,
            rotation: 0,
            z: doc.items.length,
            points: [],
            shape: 'curved',
            color: '#1a1a1a',
            lineWidth: 2,
            lineStyle: 'normal',
            startStroke: 'none',
            endStroke: 'arrow',
            startItemId: drag.fromId,
            endItemId: target
          }
          commit([...doc.items, connector])
          setSelection(new Set([connector.id]))
        }
        setDrag({ kind: 'idle' })
        setLinkFrom(null)
        setTool('select')
        return
      }
      if (drag.kind === 'draw' && doc) {
      const points = drag.points
      if (points.length >= 2) {
        const xs = points.map((entry) => entry.x)
        const ys = points.map((entry) => entry.y)
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        const local = drag.straight
          ? points.map((entry) => ({ x: entry.x - minX, y: entry.y - minY }))
          : smoothPoints(points.map((entry) => ({ x: entry.x - minX, y: entry.y - minY })), 2)
        const path: BoardItem = {
          id: uid('path_'),
          kind: 'path',
          x: minX,
          y: minY,
          w: Math.max(2, Math.max(...xs) - minX),
          h: Math.max(2, Math.max(...ys) - minY),
          rotation: 0,
          z: doc.items.length,
          points: local,
          color: strokeColor,
          lineWidth: strokeWidth,
          closed: false
        }
        commit([...doc.items, path])
      }
      setDrag({ kind: 'idle' })
      return
    }
    if (drag.kind === 'erase') {
      const base = eraseBaseRef.current
      eraseBaseRef.current = null
      if (doc && base && drag.removed.size) {
        remember(base)
        persist(doc.items)
      }
      setDrag({ kind: 'idle' })
      setEraserCursor(null)
      return
    }
    if (drag.kind === 'rubber' && doc) {
      const rect: Rect = {
        x: Math.min(drag.startX, drag.currentX),
        y: Math.min(drag.startY, drag.currentY),
        width: Math.abs(drag.currentX - drag.startX),
        height: Math.abs(drag.currentY - drag.startY)
      }
      if (rect.width > 4 && rect.height > 4) {
        const picked = doc.items
          .filter((item) => {
            if (item.locked) return false
            const box = itemBounds(item)
            return box.x < rect.x + rect.width && box.x + box.width > rect.x && box.y < rect.y + rect.height && box.y + box.height > rect.y
          })
          .map((item) => item.id)
        setSelection(new Set(picked))
      } else if (event.button === 0) {
        setSelection(new Set())
      }
      setDrag({ kind: 'idle' })
      return
    }
    if (drag.kind === 'move' && drag.moved && doc) {
      const { x: dx, y: dy } = moveDeltaRef.current
      const moved = new Set(drag.origins.keys())
      const next = doc.items.map((item) =>
        moved.has(item.id) ? ({ ...item, x: Math.round(item.x + dx), y: Math.round(item.y + dy) } as BoardItem) : item
      )
      for (const [id, node] of itemNodesRef.current) {
        if (!moved.has(id)) continue
        const item = next.find((entry) => entry.id === id)
        if (!item || !node) continue
        node.style.left = `${item.x}px`
        node.style.top = `${item.y}px`
      }
      if (dragBaseRef.current) remember(dragBaseRef.current)
      setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
      persist(next)
    }
    dragBaseRef.current = null
    if (drag.kind === 'pan') {
      applyView(viewRef.current, true)
      if (!drag.moved) startInertia(0, 0)
      else startInertia(drag.velocityX, drag.velocityY)
      if (drag.button === 2 && !drag.moved) {
        const rect = wrapRef.current?.getBoundingClientRect()
        const left = rect ? rect.left : 0
        const top = rect ? rect.top : 0
        setMenu({ x: Math.max(8, event.clientX - left), y: Math.max(8, event.clientY - top) })
      }
    }
    setDrag({ kind: 'idle' })
    },
    [drag, doc, persist, remember, commit, strokeColor, strokeWidth, applyView, startInertia, size, itemAt]
  )

  const deleteItems = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly) return
      const remove = new Set(ids.filter((id) => !byId.get(id)?.locked))
      if (!remove.size) {
        toast('Все выбранные объекты заблокированы', 'lock')
        return
      }
      commit(doc.items.filter((item) => !remove.has(item.id)))
      setSelection(new Set())
    },
    [doc, commit, readOnly, byId, toast]
  )

  const duplicateItems = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly) return
      const source = doc.items.filter((item) => ids.includes(item.id))
      const clones = source.map((item, index) => ({
        ...item,
        id: uid(`cp_${index}`),
        x: item.x + 28,
        y: item.y + 28,
        z: doc.items.length + index
      })) as BoardItem[]
      commit([...doc.items, ...clones])
      setSelection(new Set(clones.map((item) => item.id)))
      toast(`Создано копий: ${clones.length}`, 'copy')
    },
    [doc, commit, readOnly, toast]
  )

  const patchItem = useCallback(
    (id: string, patch: Partial<BoardItem>) => {
      if (!doc || readOnly) return
      commit(doc.items.map((item) => (item.id === id ? ({ ...item, ...patch } as BoardItem) : item)))
    },
    [doc, commit, readOnly]
  )

  const applyAlign = useCallback(
    (mode: AlignMode) => {
      if (!doc || readOnly || !selection.size) return
      const boxes: Placed[] = selectedItems.map((item) => ({ id: item.id, ...itemBounds(item) }))
      const deltas = alignDelta(boxes, mode)
      if (!deltas.size) {
        toast('Объекты уже выровнены', 'align')
        return
      }
      commit(
        doc.items.map((item) => {
          const delta = deltas.get(item.id)
          if (!delta) return item
          return { ...item, x: Math.round(item.x + delta.dx), y: Math.round(item.y + delta.dy) } as BoardItem
        })
      )
    },
    [doc, readOnly, selection, selectedItems, commit, toast]
  )

  const orderItems = useCallback(
    (ids: string[], action: 'front' | 'back' | 'up' | 'down'): void => {
      if (!doc || readOnly || !ids.length) return
      const target = new Set(ids)
      const sorted = [...doc.items].sort((left, right) => left.z - right.z)
      if (action === 'front' || action === 'back') {
        const rest = sorted.filter((item) => !target.has(item.id))
        const moved = sorted.filter((item) => target.has(item.id))
        const next = action === 'front' ? [...rest, ...moved] : [...moved, ...rest]
        commit(next.map((item, index) => ({ ...item, z: index }) as BoardItem))
        return
      }
      const list = [...sorted]
      const indices = list.map((item, index) => (target.has(item.id) ? index : -1)).filter((index) => index >= 0)
      if (indices.length !== 1) return
      const at = indices[0]
      const swapWith = action === 'up' ? at + 1 : at - 1
      if (swapWith < 0 || swapWith >= list.length) return
      const current = list[at]
      const other = list[swapWith]
      if (!current || !other) return
      const swapZ = current.z
      current.z = other.z
      other.z = swapZ
      list[at] = other
      list[swapWith] = current
      commit(list as BoardItem[])
    },
    [doc, readOnly, commit]
  )

  const applyOrder = useCallback(
    (action: OrderAction) => {
      if (!doc || readOnly || !selection.size) return
      const target = new Set(selection)
      const top = doc.items.length
      commit(
        doc.items
          .filter((item) => !target.has(item.id))
          .concat(doc.items.filter((item) => target.has(item.id)))
          .map((item, index) => ({ ...item, z: index }) as BoardItem)
      )
      void top
      toast(action === 'front' ? 'Выделено на передний план' : 'Выделено на задний план', 'layer')
    },
    [doc, readOnly, selection, commit, toast]
  )

  const patchSolid = useCallback(
    (patch: Partial<SolidItem>, live = false) => {
      if (!doc || readOnly) return
      const target = new Set(solidSelection.map((item) => item.id))
      if (!target.size) return
      const next = doc.items.map((item) => {
        if (!target.has(item.id) || item.kind !== 'solid') return item
        const merged = { ...item, ...patch } as SolidItem
        if (patch.edge !== undefined || patch.pitch !== undefined || patch.yaw !== undefined) {
          const box = solidBounds(merged.solid, merged.edge, merged.pitch, merged.yaw)
          merged.w = Math.max(1, Math.round(box.width))
          merged.h = Math.max(1, Math.round(box.height))
        }
        return merged
      })
      if (live) {
        setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
        return
      }
      commit(next)
    },
    [doc, readOnly, solidSelection, commit]
  )

const assetOf = (dataUrl: string, size: { width: number; height: number } | null): AssetRef => ({
    file: '',
    mime: dataUrl.slice(5, dataUrl.indexOf(';')),
    bytes: Math.round((dataUrl.length * 3) / 4),
    dataUrl,
    width: size?.width,
    height: size?.height,
    local: true
  })

  const applyImageData = useCallback(
    async (id: string, dataUrl: string): Promise<void> => {
      const size = await imageSizeOf(dataUrl)
      patchItem(id, { asset: assetOf(dataUrl, size), unsupported: false } as unknown as Partial<BoardItem>)
    },
    [patchItem]
  )

  const applyImageFiles = useCallback(
    async (dataUrls: string[], point: { x: number; y: number }, explicit?: BoardItem[]): Promise<void> => {
      if (!doc || readOnly) return
      const files = dataUrls.filter((value) => value.startsWith('data:image/'))
      if (files.length === 0) return
      const targets = [...(explicit ?? imageSelection)].sort((a, b) => a.y - b.y || a.x - b.x)
      if (targets.length === 0) {
        for (const dataUrl of files) await addImageAt(dataUrl, point)
        return
      }
      const count = Math.min(targets.length, files.length)
      const patches = new Map<string, Partial<BoardItem>>()
      for (let index = 0; index < count; index += 1) {
        const dataUrl = files[index]
        const size = await imageSizeOf(dataUrl)
        patches.set(targets[index].id, { asset: assetOf(dataUrl, size), unsupported: false } as unknown as Partial<BoardItem>)
      }
      const next = doc.items.map((item) => (patches.has(item.id) ? ({ ...item, ...patches.get(item.id) } as BoardItem) : item))
      setSelection(new Set(targets.map((item) => item.id)))
      const extra = files.slice(count)
      if (extra.length === 0) {
        commit(next)
        toast(count === 1 ? 'Картинка заменена' : `Картинок заменено: ${count}`, 'image')
        return
      }
      const last = targets[targets.length - 1]
      commit(next)
      for (let index = 0; index < extra.length; index += 1) {
        await addImageAt(extra[index], { x: last.x + last.w + 300, y: last.y + index * 320 })
      }
      toast(`Картинок заменено: ${count}, добавлено: ${extra.length}`, 'image')
    },
    [doc, readOnly, imageSelection, addImageAt, commit, toast]
  )

  const replaceImage = useCallback(
    async (id: string, source: 'clipboard' | 'file' | 'url'): Promise<void> => {
      if (!doc || readOnly) return
      const item = byId.get(id)
      if (!item || item.kind !== 'image') return
      try {
        if (source === 'url') {
          const value = window.prompt('Ссылка на картинку', item.asset?.sourceUrl ?? 'https://')
          if (!value) return
          const url = value.trim()
          patchItem(id, {
            asset: { file: '', mime: 'image/link', bytes: 0, sourceUrl: url },
            unsupported: true
          } as Partial<BoardItem>)
          toast('Картинка заменена ссылкой', 'link')
          return
        }
        const dataUrl = source === 'clipboard' ? await api.clipboard.readImage() : await api.dialog.pickImage()
        if (!dataUrl) {
          toast('Картинка не получена', 'image')
          return
        }
        await applyImageData(id, dataUrl)
        toast('Картинка заменена', 'image')
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error), 'error')
      }
    },
    [doc, readOnly, byId, patchItem, applyImageData, toast]
  )

  const replaceImagesFromFiles = useCallback(async (): Promise<void> => {
    if (!doc || readOnly || imageSelection.length === 0) return
    const files = await api.dialog.pickImages()
    if (files.length === 0) return
    const rect = wrapRef.current?.getBoundingClientRect()
    const center = toWorld((rect ? rect.left : 0) + size.width / 2, (rect ? rect.top : 0) + size.height / 2)
    await applyImageFiles(files, center)
  }, [doc, readOnly, imageSelection, size, toWorld, applyImageFiles])

  const fillMissingImages = useCallback(async (): Promise<void> => {
    if (!doc || readOnly || missingImageItems.length === 0) return
    const files = await api.dialog.pickImages()
    if (files.length === 0) return
    setSelection(new Set(missingImageItems.map((item) => item.id)))
    const rect = wrapRef.current?.getBoundingClientRect()
    const center = toWorld((rect ? rect.left : 0) + size.width / 2, (rect ? rect.top : 0) + size.height / 2)
    await applyImageFiles(files, center, missingImageItems)
  }, [doc, readOnly, missingImageItems, size, toWorld, applyImageFiles])

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setDropActive(true)
  }, [])

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>): Promise<void> => {
      event.preventDefault()
      setDropActive(false)
      const files = Array.from(event.dataTransfer.files).filter((file) => file.type.startsWith('image/'))
      if (files.length === 0) return
      files.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      const dataUrls = await Promise.all(
        files.map(
          (file) =>
            new Promise<string>((resolve) => {
              const reader = new FileReader()
              reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
              reader.onerror = () => resolve('')
              reader.readAsDataURL(file)
            })
        )
      )
      await applyImageFiles(dataUrls, toWorld(event.clientX, event.clientY))
    },
    [applyImageFiles, toWorld]
  )

  const patchGraph = useCallback(
    (patch: Partial<GraphItem>, live = false) => {
      if (!doc || readOnly) return
      const target = new Set(graphSelection.map((item) => item.id))
      if (!target.size) return
      const next = doc.items.map((item) =>
        target.has(item.id) && item.kind === 'graph' ? ({ ...item, ...patch } as GraphItem) : item
      )
      if (live) {
        setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
        return
      }
      commit(next)
    },
    [doc, readOnly, graphSelection, commit]
  )

  const patchExpression = useCallback(
    (id: string, patch: Partial<GraphExpr>, live = false) => {
      if (!graphPanel) return
      patchGraph(
        { expressions: graphPanel.expressions.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)) },
        live
      )
    },
    [graphPanel, patchGraph]
  )

  const fitGraphToView = useCallback((): void => {
    if (!doc || readOnly || !graphPanel) return
    const current = viewRef.current
    const width = Math.round(clamp((size.width / current.zoom) * 0.88, 320, 2600))
    const height = Math.round(clamp((size.height / current.zoom) * 0.88, 240, 1900))
    patchGraph({
      w: width,
      h: height,
      x: Math.round(current.x - width / 2),
      y: Math.round(current.y - height / 2),
      originX: 0.5,
      originY: 0.5
    })
    toast(`Плоскость вписана в окно: ${width}×${height}`, 'zoom')
  }, [doc, readOnly, graphPanel, size, patchGraph, toast])

  const convertToShape = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly) return
      const target = new Set(ids)
      const next = doc.items.map((item) => {
        if (!target.has(item.id) || !isUnsupported(item)) return item
        return {
          id: uid('shape_'),
          kind: 'shape',
          x: item.x,
          y: item.y,
          w: Math.max(24, item.w),
          h: Math.max(24, item.h),
          rotation: item.rotation,
          z: item.z,
          shape: 'rectangle',
          fillColor: '#ffffff',
          color: '#1a1a1a',
          borderStyle: 'solid',
          lineWidth: 2,
          content: '',
          plain: kindLabel(item.kind),
          raw: { replacedFrom: item.sourceType ?? item.kind }
        } as unknown as BoardItem
      })
      commit(next)
      toast('Объекты заменены простыми фигурами', 'shape')
    },
    [doc, readOnly, commit, toast]
  )

const openLinkPreview = useCallback(
    async (preset?: string): Promise<void> => {
      if (preset) {
        await api.preview.open({ kind: 'web', title: preset, src: preset })
        return
      }
      const value = window.prompt('Ссылка или путь к файлу для предпросмотра', linkPreview)
      if (!value) return
      const src = value.trim()
      setLinkPreview(src)
      await api.preview.open({ kind: 'file', title: src.split(/[\\/]/).pop() ?? src, src })
    },
    [linkPreview]
  )

  const openItemPreview = useCallback(
    (item: BoardItem): void => {
      if (item.kind === 'image') {
        const asset = (item as { asset?: { file?: string; src?: string } }).asset
        const file = asset?.file
        const src = file ? assetUrl(file) : asset?.src
        if (!src) {
          toast('У картинки нет файла, предпросмотр недоступен', 'preview')
          return
        }
        void api.preview.open({ kind: 'image', title: item.sourceType ?? 'Картинка', src })
        return
      }
      const raw = (item.raw ?? {}) as { url?: string; link?: string; source?: string; embedUrl?: string }
      const url = raw.url ?? raw.link ?? raw.source ?? raw.embedUrl ?? ''
      if (!url) {
        toast('У объекта нет ссылки', 'link')
        return
      }
      void api.preview.open({ kind: 'web', title: item.sourceType ?? 'Ссылка', src: url })
    },
    [assetUrl, toast]
  )

const navigateTo = useCallback(
    (id: string) => {
      const item = byId.get(id)
      if (!item) return
      fitTo(itemBounds(item), 2)
      setSelection(new Set([id]))
      setShowInspector(true)
    },
    [byId, fitTo]
  )

  const toggleLock = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly || !ids.length) return
      const target = new Set(ids)
      const allLocked = ids.every((id) => byId.get(id)?.locked)
      commit(doc.items.map((item) => (target.has(item.id) ? ({ ...item, locked: !allLocked } as BoardItem) : item)))
      toast(allLocked ? 'Объекты разблокированы' : 'Объекты заблокированы', allLocked ? 'unlock' : 'lock')
    },
    [doc, commit, readOnly, byId, toast]
  )

  const startEditing = useCallback(
    (id: string) => {
      const item = byId.get(id)
      if (!item || readOnly || item.locked) return
      if (item.kind === 'image') {
        setSelection(new Set([id]))
        void replaceImage(id, 'clipboard')
        return
      }
      if (item.kind !== 'text' && item.kind !== 'sticky' && item.kind !== 'shape') return
      setSelection(new Set([id]))
      setEditing({ id, value: item.content ?? '' })
    },
    [byId, readOnly, replaceImage]
  )

  const commitEditing = useCallback(() => {
    if (!editing || !doc) return
    const value = editing.value.replace(/\s+$/g, '')
    setEditing(null)
    const item = byId.get(editing.id)
    if (!item) return
    if ((item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape') && (item.content ?? '') === value) return
    const html = value
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('')
    commit(
      doc.items.map((entry) => {
        if (entry.id !== editing.id) return entry
        if (entry.kind === 'text' || entry.kind === 'sticky' || entry.kind === 'shape') {
          const base = { ...entry, content: html, plain: value }
          if (entry.sourceType) return base as BoardItem
          if (entry.kind === 'sticky') {
            const fit = fitTextBox(value, { width: entry.w, minHeight: entry.h, fontSize: entry.fontSize, padX: 8, padY: 6 })
            return { ...base, h: fit.height, fontSize: fit.fontSize } as BoardItem
          }
          if (entry.kind === 'text') {
            const fit = fitTextBox(value, {
              width: entry.w,
              minHeight: Math.round(entry.fontSize * 1.3),
              fontSize: entry.fontSize,
              padX: 2,
              padY: 2
            })
            return { ...base, h: fit.height, fontSize: fit.fontSize } as BoardItem
          }
          const fit = fitTextBox(value, { width: entry.w, minHeight: entry.h, fontSize: entry.fontSize, padX: 6, padY: 5 })
          return { ...base, fontSize: fit.fontSize } as BoardItem
        }
        return entry
      })
    )
  }, [editing, doc, byId, commit])

  const editingItem = editing ? byId.get(editing.id) : undefined
  const editingBox = editingItem ? itemBounds(editingItem) : null
  const textSelection = selectedItems.filter(
    (item) => item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape'
  )
  const editTargetId = textSelection.length === 1 ? textSelection[0].id : null
  const textPanelBox = textSelection.length ? itemBounds(textSelection[0]) : null
  const textPanelSpot = (() => {
    if (!textPanelBox) return null
    const view = viewRef.current
    const zoom = Math.max(0.05, view.zoom)
    const half = size.width / 2
    const center = size.height / 2
    const screenLeft = (textPanelBox.x - view.x) * zoom + half
    const screenTop = (textPanelBox.y - view.y) * zoom + center
    const screenBottom = screenTop + textPanelBox.height * zoom
    const below = screenBottom + 52 < size.height - 72
    const targetScreenY = below ? screenBottom + 8 : screenTop - 52
    const width = Math.min(392, size.width - 24)
    const screenX = clamp(screenLeft, 12, Math.max(12, size.width - width - 12))
    const screenY = clamp(targetScreenY, 12, Math.max(12, size.height - 56))
    return {
      x: (screenX - half) / zoom + view.x,
      y: (screenY - center) / zoom + view.y
    }
  })()
  const allSelectionLocked = selectedItems.length > 0 && selectedItems.every((item) => item.locked)

  const adjustFontSize = useCallback(
    (step: number) => {
      if (!doc || readOnly) return
      const targets = new Set(textSelection.map((item) => item.id))
      if (!targets.size) return
      commit(
        doc.items.map((item) => {
          if (!targets.has(item.id)) return item
          if (item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape') {
            return { ...item, fontSize: clamp((item.fontSize || 16) + step * 2, 6, 220) }
          }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const setTextAlign = useCallback(
    (align: 'left' | 'center' | 'right') => {
      if (!doc || readOnly) return
      const targets = new Set(textSelection.map((item) => item.id))
      if (!targets.size) return
      commit(
        doc.items.map((item) => {
          if (!targets.has(item.id)) return item
          if (item.kind === 'text') return { ...item, align }
          if (item.kind === 'sticky' || item.kind === 'shape') return { ...item, textAlign: align }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const paintText = useCallback(
    (color: string) => {
      if (!doc || readOnly) return
      const targets = new Set(textSelection.map((item) => item.id))
      if (!targets.size) return
      commit(
        doc.items.map((item) => {
          if (!targets.has(item.id)) return item
          if (item.kind === 'sticky') return { ...item, color }
          if (item.kind === 'text') return { ...item, color }
          if (item.kind === 'shape') return { ...item, textColor: color, fillColor: color }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const pasteIntoBoard = useCallback(
    async (html?: string, text?: string): Promise<void> => {
      const payload = html ? parseClipboardHtml(html) : text ? parseClipboardText(text) : null
      if (!payload || !payload.items.length) {
        toast('В буфере обмена нет объектов для вставки', 'error')
        return
      }
      try {
        const result = await api.board.appendItems({ docId: props.docId, items: payload.items, images: payload.images })
        const loaded = await api.board.open(props.docId)
        if (doc) remember(doc.items)
        setDoc(loaded)
        const rect = loaded.bounds
        const zoom = clamp(Math.min(size.width / rect.width, size.height / rect.height) * 0.92, MIN_ZOOM, 1.6)
        applyView({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, zoom }, true)
        toast(`Добавлено объектов: ${result.added}${result.images ? `, картинок: ${result.images}` : ''}`, 'paste')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [props.docId, toast, fail, size, applyView, doc, remember]
  )

  const insertImages = useCallback(
    async (entries: Array<{ dataUrl: string; name: string }>) => {
      if (!entries.length) return
      const rect = wrapRef.current?.getBoundingClientRect()
      const view = viewRef.current
      const cx = rect ? rect.width / 2 / view.zoom - view.x / view.zoom : 0
      const cy = rect ? rect.height / 2 / view.zoom - view.y / view.zoom : 0
      const stamp = Date.now()
      const width = 420
      const items = entries.map((entry, index) => ({
        id: `img_clip_${stamp}_${index}`,
        type: 'image',
        x: cx + index * 28,
        y: cy + index * 28,
        width,
        height: Math.round(width * 0.66),
        position: { x: cx + index * 28, y: cy + index * 28, origin: 'top-left', relativeTo: 'canvas_center' },
        geometry: { width, height: Math.round(width * 0.66), rotation: 0 },
        style: {},
        data: { title: entry.name || 'Картинка из буфера' }
      }))
      try {
        await api.board.appendItems({
          docId: props.docId,
          items,
          images: entries.map((entry, index) => ({ itemId: items[index].id, dataUrl: entry.dataUrl }))
        })
        const loaded = await api.board.open(props.docId)
        if (doc) remember(doc.items)
        setDoc(loaded)
        const zoom = clamp(Math.min(size.width / loaded.bounds.width, size.height / loaded.bounds.height) * 0.92, MIN_ZOOM, 1.6)
        applyView({ x: loaded.bounds.x + loaded.bounds.width / 2, y: loaded.bounds.y + loaded.bounds.height / 2, zoom }, true)
        toast(`Добавлено картинок: ${entries.length}`, 'paste')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [props.docId, toast, fail, size, applyView, doc, remember]
  )

  const insertImagesFromFiles = useCallback(
    async (files: File[]): Promise<void> => {
      try {
        const entries = await Promise.all(
          files.slice(0, 12).map(
            (file) =>
              new Promise<{ dataUrl: string; name: string }>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve({ dataUrl: String(reader.result ?? ''), name: file.name })
                reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
                reader.readAsDataURL(file)
              })
          )
        )
        await insertImages(entries.filter((entry) => entry.dataUrl))
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [insertImages, fail]
  )

  const insertImagesFromClipboard = useCallback(async (): Promise<void> => {
    try {
      const dataUrl = await api.clipboard.readImage()
      if (!dataUrl) {
        toast('В буфере нет картинки', 'error')
        return
      }
      await insertImages([{ dataUrl, name: 'Картинка из буфера' }])
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }, [insertImages, toast, fail])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const payload = payloadFromEvent(event)
      if (!payload) {
        const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
        if (files.length) {
          event.preventDefault()
          void insertImagesFromFiles(files)
          return
        }
        void insertImagesFromClipboard()
        return
      }
      event.preventDefault()
      void pasteIntoBoard(
        event.clipboardData?.getData('text/html') || undefined,
        event.clipboardData?.getData('text/plain') || undefined
      )
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [pasteIntoBoard, insertImagesFromFiles, insertImagesFromClipboard])

  useEffect(() => {
    const listener = (event: Event): void => {
      const command = (event as CustomEvent<string>).detail
      if (command === 'undo') undo()
      else if (command === 'redo') redo()
      else if (command === 'duplicate' && selection.size) duplicateItems([...selection])
      else if (command === 'delete' && selection.size) deleteItems([...selection])
      else if (command === 'select-all' && doc) {
        setSelection(new Set(doc.items.filter((item) => item.kind !== 'connector').map((item) => item.id)))
      }
    }
    window.addEventListener('liro:board-command', listener)
    return () => window.removeEventListener('liro:board-command', listener)
  }, [undo, redo, duplicateItems, deleteItems, selection, doc])

  const searchResults = useMemo(() => {
    if (!doc || !findQuery.trim()) return [] as BoardItem[]
    const needle = findQuery.trim().toLowerCase()
    return doc.items
      .filter((item) => {
        const plain = 'plain' in item ? String((item as { plain?: string }).plain ?? '') : ''
        const title = 'title' in item ? String((item as { title?: string }).title ?? '') : ''
        const frameTitle = item.kind === 'frame' ? item.title : ''
        return `${plain} ${title} ${frameTitle}`.toLowerCase().includes(needle)
      })
      .slice(0, 200)
  }, [doc, findQuery])

  useEffect(() => {
    if (findIndex >= searchResults.length) setFindIndex(0)
  }, [searchResults.length, findIndex])

  useEffect(() => {
    const item = searchResults[findIndex]
    if (item) navigateTo(item.id)
  }, [findIndex])

  useEffect(() => {
    const listener = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
      if (event.code === 'Space' && !typing) {
        spaceRef.current = event.type === 'keydown'
        if (target === document.body) event.preventDefault()
        return
      }
      if (typing) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && doc) {
        event.preventDefault()
        setSelection(new Set(doc.items.filter((item) => item.kind !== 'connector').map((item) => item.id)))
        setAlignOpen(true)
        return
      }
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey
      if (plain && (event.key.toLowerCase() === 'v' || event.key.toLowerCase() === 'h' || event.key.toLowerCase() === 'p' || event.key.toLowerCase() === 'e')) {
        const mode = event.key.toLowerCase()
        setTool(mode === 'v' ? 'select' : mode === 'h' ? 'pan' : mode === 'e' ? 'erase' : 'draw')
        return
      }
      const toolKeys: Record<string, Tool> = { s: 'create', l: 'create', c: 'link', t: 'text', n: 'sticky', i: 'image', d: 'solid', g: 'graph' }
      const mapped = plain ? toolKeys[event.key.toLowerCase()] : undefined
      if (mapped && !readOnly) {
        if (event.key.toLowerCase() === 'l') setCreateTool((current) => (current === 'line' ? 'arrow' : 'line'))
        setTool(mapped)
        return
      }
      if (event.key === 'Escape') {
        setSelection(new Set())
        setFindOpen(false)
        setMenu(null)
        setTool('select')
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selection.size) {
          event.preventDefault()
          deleteItems([...selection])
        }
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateItems([...selection])
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void api.clipboard
          .readHtml()
          .then((html) => pasteIntoBoard(html || undefined))
          .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
        return
      }
      if (event.key === 'f' && !event.ctrlKey && !event.metaKey) {
        fitAll()
        return
      }
      if (event.key === '0') {
        const center = viewRef.current
        animateTo({ ...center, zoom: 1 }, 200)
        return
      }
      if (event.key === '=' || event.key === '+') zoomBy(1.2)
      if (event.key === '-' || event.key === '_') zoomBy(1 / 1.2)
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        if (!selection.size || readOnly || !doc) return
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        commit(doc.items.map((item) => (selection.has(item.id) ? ({ ...item, x: item.x + dx, y: item.y + dy } as BoardItem) : item)))
      }
    }
    window.addEventListener('keydown', listener)
    window.addEventListener('keyup', listener)
    return () => {
      window.removeEventListener('keydown', listener)
      window.removeEventListener('keyup', listener)
    }
  }, [doc, selection, zoomBy, fitAll, deleteItems, duplicateItems, commit, undo, redo, readOnly, animateTo, pasteIntoBoard, fail])

  const gridStep = useMemo(() => {
    const step = Math.max(4, gridSize)
    return step
  }, [gridSize])

  const gridStyle = useMemo(() => {
    if (gridMode === 'none') return { backgroundImage: 'none', backgroundSize: 'auto' }
    const cell = Math.max(1, gridStep * liveZoom)
    const fade = Math.round(clamp((cell - 9) / 10, 0, 1) * 100) / 100
    if (fade <= 0.01) return { backgroundImage: 'none', backgroundSize: 'auto' }
    const minor = Math.round(cell * 100) / 100
    const major = Math.round(minor * 5 * 100) / 100
    const soft = Math.round(0.05 * fade * 1000) / 1000
    const firm = Math.round(0.095 * fade * 1000) / 1000
    if (gridMode === 'dots') {
      return {
        backgroundImage: `radial-gradient(circle at 0.5px 0.5px, rgba(24,24,30,${Math.round(0.2 * fade * 1000) / 1000}) 0.5px, transparent 0)`,
        backgroundSize: `${minor}px ${minor}px`
      }
    }
    return {
      backgroundImage: [
        `linear-gradient(to right, rgba(24,24,30,${soft}) 0.5px, transparent 0.5px)`,
        `linear-gradient(to bottom, rgba(24,24,30,${soft}) 0.5px, transparent 0.5px)`,
        `linear-gradient(to right, rgba(24,24,30,${firm}) 0.5px, transparent 0.5px)`,
        `linear-gradient(to bottom, rgba(24,24,30,${firm}) 0.5px, transparent 0.5px)`
      ].join(', '),
      backgroundSize: `${minor}px ${minor}px, ${minor}px ${minor}px, ${major}px ${major}px, ${major}px ${major}px`
    }
  }, [gridStep, liveZoom, gridMode])

  const rubberRect =
    drag.kind === 'rubber'
      ? {
          x: Math.min(drag.startX, drag.currentX),
          y: Math.min(drag.startY, drag.currentY),
          width: Math.abs(drag.currentX - drag.startX),
          height: Math.abs(drag.currentY - drag.startY)
        }
      : null

  if (loading) {
    return (
      <div className="boardview boardview--loading">
        <div className="loadbox">
          <Spinner /> <span className="dim">Открываем доску…</span>
        </div>
      </div>
    )
  }

  if (!doc) return null

  const drawBox = (() => {
    if (drag.kind !== 'draw' || drag.points.length < 2) return null
    const xs = drag.points.map((point) => point.x)
    const ys = drag.points.map((point) => point.y)
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const path = drag.points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${(point.x - minX).toFixed(1)} ${(point.y - minY).toFixed(1)}`)
      .join(' ')
    return {
      x: minX,
      y: minY,
      width: Math.max(1, Math.max(...xs) - minX),
      height: Math.max(1, Math.max(...ys) - minY),
      path
    }
  })()

  return (
    <div className={ready ? 'boardview boardview--ready' : 'boardview'}>
      <div className="topbar topbar--floating">
        <div className="bfcol">
          <div className="bbar">
          <button type="button" className="toolbtn" onClick={() => navigate({ name: 'library' })} aria-label="К библиотеке" title="К библиотеке">
            <ArrowLeft size={17} />
          </button>
          <div className="bbar__sep" />
          <div style={{ minWidth: 0 }}>
            {renaming ? (
              <input
                className="input"
                autoFocus
                value={titleDraft}
                style={{ width: 260, height: 30 }}
                onChange={(event) => setTitleDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === 'Escape') setRenaming(false)
                }}
                onBlur={async () => {
                  setRenaming(false)
                  if (!titleDraft.trim() || titleDraft === doc.title) return
                  setDoc({ ...doc, title: titleDraft.trim() })
                  try {
                    await api.board.rename(doc.id, titleDraft.trim())
                    setLibrary(await api.library.get())
                  } catch (error) {
                    fail(error instanceof Error ? error.message : String(error))
                  }
                }}
              />
            ) : (
              <div className="bbar__title truncate" onDoubleClick={() => !readOnly && setRenaming(true)} title={doc.title}>
                {doc.title}
              </div>
            )}
            {dirty ? <div className="bbar__sub">Сохраняем…</div> : null}
          </div>
          <div className="bbar__sep" />
          <button
            type="button"
            className="seg"
            data-active={!readOnly}
            onClick={() => setReadOnly(false)}
            title="Редактирование"
          >
            <Pencil size={14} /> Правка
          </button>
          <button type="button" className="seg" data-active={readOnly} onClick={() => setReadOnly(true)} title="Только просмотр">
            Просмотр
          </button>
          </div>
        </div>

        <div className="bfcol bfcol--right">
          <div className="bbar">
            <button
              type="button"
              className="toolbtn"
              onClick={undo}
              disabled={readOnly || !historyState.undo}
              aria-label="Отменить"
              title={`Отменить (Ctrl+Z)${historyState.undo ? ` — в истории ${historyState.undo}` : ''}`}
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={redo}
              disabled={readOnly || !historyState.redo}
              aria-label="Вернуть"
              title={`Вернуть (Ctrl+Y)${historyState.redo ? ` — в истории ${historyState.redo}` : ''}`}
            >
              <Redo2 size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={() => setFindOpen((value) => !value)}
              aria-label="Найти"
              title="Найти (Ctrl+F)"
              data-active={findOpen}
            >
              <Search size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={() => setObjectsOpen((value) => !value)}
              aria-label="Список объектов"
              title="Список объектов и неподдерживаемые"
              data-active={objectsOpen}
            >
              <List size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              data-board-details=""
              data-items={doc.stats.items}
              onClick={() => {
                setDetailsOpen((value) => !value)
                setShowInspector(false)
                setObjectsOpen(false)
              }}
              aria-label="Подробнее о доске"
              title="Подробнее о доске: состав, файлы, происхождение"
              data-active={detailsOpen}
            >
              <Info size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={() => {
                setShowInspector((value) => !value)
                setDetailsOpen(false)
              }}
              aria-label="Свойства"
              title="Свойства выбранного"
              data-active={showInspector}
            >
              <Layers size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={() => setAlignOpen((value) => !value)}
              aria-label="Выравнивание"
              title="Выравнивание, порядок и удаление для выбранного"
              data-active={alignOpen}
            >
              <Ruler size={16} />
            </button>
            {doc.source.url ? (
              <button
                type="button"
                className="toolbtn"
                onClick={() => void api.board.openSource(doc.id)}
                aria-label="Открыть оригинал"
                title="Открыть оригинал доски"
              >
                <ExternalLink size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className="toolbtn"
              onClick={() => {
                setBoardSettingsOpen((value) => !value)
                setObjectsOpen(false)
                setDetailsOpen(false)
                setShowInspector(false)
              }}
              aria-label="Настройки доски"
              title="Настройки доски: сетка и привязка"
              data-active={boardSettingsOpen}
            >
              <SlidersHorizontal size={16} />
            </button>
            <div className="bbar__sep" />
            <button type="button" className="btn btn--sm btn--primary" onClick={() => setShowExport(true)}>
              <Download size={15} /> Экспорт
            </button>
          </div>

          {findOpen ? (
            <div className="bbar bbar--panel">
              <input
                className="input"
                autoFocus
                placeholder="Поиск по тексту на доске"
                value={findQuery}
                onChange={(event) => {
                  setFindQuery(event.target.value)
                  setFindIndex(0)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setFindIndex((value) => value + 1)
                  if (event.key === 'Escape') setFindOpen(false)
                }}
              />
              <span className="dim" style={{ fontSize: 11.5, whiteSpace: 'nowrap' }}>
                {findQuery ? `${Math.min(findIndex + 1, searchResults.length)}/${searchResults.length}` : ''}
              </span>
              <button type="button" className="toolbtn" onClick={() => setFindOpen(false)} aria-label="Закрыть поиск">
                <X size={15} />
              </button>
            </div>
          ) : null}

          {missingImages ? (
            <div className="bbar bbar--panel bbar--warn">
              <ImageOff size={15} />
              <span>
                Без данных: {missingImages} картинок. При копировании изображения не переносятся — выделите
                заглушки и перетащите в них файлы из проводника.
              </span>
              <button
                type="button"
                className="bbar__btn"
                disabled={readOnly}
                onClick={() => {
                  selectMissingImages()
                }}
              >
                Выделить заглушки
              </button>
              <button
                type="button"
                className="bbar__btn bbar__btn--solid"
                disabled={readOnly}
                onClick={() => void fillMissingImages()}
              >
                Заменить файлами
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        ref={wrapRef}
        className="boardview__canvas"
        data-grid={gridMode !== 'none'}
        data-gridmode={gridMode}
        data-tool={tool}
        data-panning={drag.kind === 'pan'}
        data-drop={dropActive || undefined}
        style={gridStyle}
        onWheel={onWheel}
        onDragOver={onDragOver}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => void onDrop(event)}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ConnectorLayer doc={doc} viewRef={viewRef} size={size} visible={visible} dpr={dpr} />
        <div className="boardview__world" ref={worldRef}>
          {rendered.map((item) => (
            <ItemView
              key={item.id}
              item={item}
              doc={doc}
              assetUrl={assetUrl}
              selected={tool === 'select' && selection.has(item.id)}
              dimmed={false}
              moving={drag.kind === 'move' && selection.has(item.id)}
              onNode={registerNode}
              onPointerDown={readOnly || tool !== 'select' || item.locked ? undefined : onItemPointerDown}
              onDoubleClick={readOnly ? undefined : startEditing}
            />
          ))}
          {guides.map((guide, index) =>
            guide.axis === 'x' ? (
              <div
                key={`gx${index}`}
                className="guide guide--v"
                style={{ left: guide.at, top: guide.from, height: Math.max(1, guide.to - guide.from) }}
              />
            ) : (
              <div
                key={`gy${index}`}
                className="guide guide--h"
                style={{ top: guide.at, left: guide.from, width: Math.max(1, guide.to - guide.from) }}
              />
            )
          )}
          {textSelection.length && tool === 'select' && drag.kind !== 'move' && textPanelSpot ? (
            <div
              className="textpanel"
              style={{
                left: textPanelSpot.x,
                top: textPanelSpot.y,
                transform: `scale(${1 / Math.max(0.25, liveZoom)})`
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className="toolbtn"
                onClick={() => startEditing(editTargetId ?? [...selection][0])}
                title="Изменить текст"
              >
                <Type size={16} />
              </button>
              <div className="bbar__sep" />
              <button type="button" className="toolbtn" onClick={() => adjustFontSize(-1)} title="Уменьшить шрифт">
                <Minus size={16} />
              </button>
              <span className="zoomval" style={{ minWidth: 24 }}>
                {textSelection[0] ? fontSizeOf(textSelection[0]) : 16}
              </span>
              <button type="button" className="toolbtn" onClick={() => adjustFontSize(1)} title="Увеличить шрифт">
                <Plus size={16} />
              </button>
              <div className="bbar__sep" />
              {(['left', 'center', 'right'] as const).map((align) => (
                <button
                  key={align}
                  type="button"
                  className="toolbtn"
                  data-active={textSelection.every((item) => alignOf(item) === align)}
                  onClick={() => setTextAlign(align)}
                  title={align === 'left' ? 'Влево' : align === 'center' ? 'По центру' : 'Вправо'}
                >
                  <AlignIcon align={align} />
                </button>
              ))}
              <div className="bbar__sep" />
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  aria-label={`Цвет ${color}`}
                  onClick={() => paintText(color)}
                  style={{ background: color, outline: '1px solid var(--border)' }}
                />
              ))}
            </div>
          ) : null}
          {editing && editingItem && editingBox ? (
            <textarea
              className="texteditor"
              autoFocus
              value={editing.value}
              placeholder="Введите текст"
              onChange={(event) => setEditing({ id: editing.id, value: event.target.value })}
              onBlur={() => commitEditing()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setEditing(null)
                }
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  commitEditing()
                }
              }}
              style={{
                left: editingBox.x,
                top: editingBox.y,
                width: Math.max(120, editingBox.width),
                height: Math.max(36, editingBox.height),
                fontSize: Math.max(8, fontSizeOf(editingItem) * Math.min(1, 1 / Math.max(0.05, liveZoom) ** 0.25)),
                lineHeight: 1.25,
                textAlign: alignOf(editingItem),
                color: textColorOf(editingItem)
              }}
            />
          ) : null}
          {rubberRect ? (
            <div className="rubber" style={{ left: rubberRect.x, top: rubberRect.y, width: rubberRect.width, height: rubberRect.height }} />
          ) : null}
          {drawBox ? (
            <div className="inkpreview" style={{ left: drawBox.x, top: drawBox.y, width: drawBox.width, height: drawBox.height }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, drawBox.width)} ${Math.max(1, drawBox.height)}`}>
                <path
                  d={drawBox.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={0.85}
                />
              </svg>
            </div>
          ) : null}
        </div>
        {eraserCursor ? (
          <div
            className="eraser__cursor"
            style={{ left: eraserCursor.x, top: eraserCursor.y, width: eraserCursor.size, height: eraserCursor.size }}
          />
        ) : null}
      </div>

      {menu ? (
        <>
          <div className="ctxmenu__shade" onPointerDown={() => setMenu(null)} onContextMenu={(event) => event.preventDefault()} />
          <div
            ref={menuRef}
            className="ctxmenu"
            style={{ left: menuPos.x, top: menuPos.y }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="ctxmenu__title">{selection.size ? `Выбрано: ${selection.size}` : 'Доска'}</div>
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                void api.clipboard
                  .readHtml()
                  .then((html) => pasteIntoBoard(html || undefined))
                  .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
              }}
            >
              <ClipboardPaste size={15} /> Вставить объекты
            </button>
            <button
              type="button"
              disabled={!selection.size || readOnly}
              onClick={() => {
                duplicateItems([...selection])
                setMenu(null)
              }}
            >
              <Copy size={15} /> Дублировать
            </button>
            <button
              type="button"
              disabled={!selection.size || readOnly}
              onClick={() => {
                deleteItems([...selection])
                setMenu(null)
              }}
            >
              <Trash2 size={15} /> Удалить
            </button>
            <div className="ctxmenu__sep" />
            <div className="ctxmenu__sep" />
            <button
              type="button"
              disabled={selection.size !== 1}
              onClick={() => {
                const item = selectedItems[0]
                if (item) openItemPreview(item)
                setMenu(null)
              }}
            >
              <ExternalLink size={15} /> Открыть предпросмотр
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                void openLinkPreview()
              }}
            >
              <Link2 size={15} /> Предпросмотр по ссылке
            </button>
            <button
              type="button"
              disabled={!textSelection.length || readOnly}
              onClick={() => {
                startEditing(editTargetId ?? [...selection][0])
                setMenu(null)
              }}
            >
              <Type size={15} /> Изменить текст
            </button>
            <button
              type="button"
              disabled={imageSelection.length !== 1 || readOnly}
              onClick={() => {
                const item = imageSelection[0]
                if (!item) return
                setMenu(null)
                setSelection(new Set([item.id]))
                setAlignOpen(true)
              }}
            >
              <ImagePlus size={15} /> Заменить картинку
            </button>
            <div className="ctxmenu__sep" />
            <button
              type="button"
              disabled={!selection.size || readOnly}
              onClick={() => {
                toggleLock([...selection])
                setMenu(null)
              }}
            >
              {allSelectionLocked ? <Unlock size={15} /> : <Lock size={15} />}
              {allSelectionLocked ? 'Разблокировать' : 'Заблокировать'}
            </button>
            <div className="ctxmenu__sep" />
            <button
              type="button"
              onClick={() => {
                if (doc) setSelection(new Set(doc.items.filter((item) => item.kind !== 'connector').map((item) => item.id)))
                setMenu(null)
              }}
            >
              <MousePointer2 size={15} /> Выделить всё
            </button>
            <button
              type="button"
              onClick={() => {
                fitAll()
                setMenu(null)
              }}
            >
              <Maximize size={15} /> Вписать доску
            </button>
            <button
              type="button"
              onClick={() => {
                zoomBy(1 / 1.25)
                setMenu(null)
              }}
            >
              <ZoomOut size={15} /> Уменьшить
            </button>
            <button
              type="button"
              onClick={() => {
                zoomBy(1.25)
                setMenu(null)
              }}
            >
              <ZoomIn size={15} /> Увеличить
            </button>
            <div className="ctxmenu__sep" />
            <div className="ctxmenu__title">Сетка</div>
            {GRID_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  changeGrid({ gridMode: entry.id })
                  setMenu(null)
                }}
              >
                <span className="ctxmenu__radio" data-active={gridMode === entry.id} />
                {entry.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                changeGrid({ snapGrid: !snapGrid })
                setMenu(null)
              }}
            >
              <Magnet size={15} /> Привязка к сетке
              <span className="ctxmenu__check">{snapGrid ? 'вкл' : 'выкл'}</span>
            </button>
          </div>
        </>
      ) : null}

      <div className="boardview__tools">
        <div className="toolgroup" style={{ flexDirection: 'column', padding: 4, gap: 2 }}>
          <button type="button" className="toolbtn" data-active={tool === 'select'} onClick={() => setTool('select')} title="Выделение и перемещение (V) — тяните ЛКМ по пустому месту">
            <MousePointer2 size={17} />
          </button>
          <button type="button" className="toolbtn" data-active={tool === 'pan'} onClick={() => setTool('pan')} title="Двигать доску (H) или удерживайте пробел">
            <Hand size={17} />
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'draw'}
              onClick={() => setTool('draw')}
              title="Рисовать (P) — Shift+P оставляет кисть включённой"
            >
              <PenLine size={17} />
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'erase'}
              onClick={() => setTool('erase')}
              title="Стирать (E) — удаляет объекты под кистью"
            >
              <Eraser size={17} />
            </button>
          ) : null}
          <div className="bbar__sep" />
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'create'}
              onClick={() => setTool('create')}
              title="Фигуры (S) — потяните на доске"
            >
              <Square size={17} />
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'link'}
              onClick={() => {
                setTool('link')
                setLinkFrom(null)
              }}
              title="Связь между объектами (C)"
            >
              <Link2 size={17} />
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'text'}
              onClick={() => setTool('text')}
              title="Текст (T)"
            >
              <Type size={17} />
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'sticky'}
              onClick={() => setTool('sticky')}
              title="Стикер (N)"
            >
              <StickyNote size={17} />
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'graph'}
              onClick={() => setTool('graph')}
              title="Координатная плоскость (G)"
            >
              <LineChart size={17} />
            </button>
          ) : null}
          {!readOnly ? (
            <button
              type="button"
              className="toolbtn"
              data-active={tool === 'solid'}
              onClick={() => setTool('solid')}
              title="3D-фигура (D)"
            >
              <Box size={17} />
            </button>
          ) : null}
        </div>
        {panelKind === 'selection' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__label">Выделено: {selection.size}</div>
            <div className="toolpalette__label">Выравнивание</div>
            <div className="toolpalette__grid">
              {ALIGN_BUTTONS.map((entry) => (
                <button
                  key={entry.mode}
                  type="button"
                  className="toolbtn"
                  onClick={() => applyAlign(entry.mode)}
                  disabled={!selection.size}
                  title={entry.title}
                >
                  {entry.icon}
                </button>
              ))}
            </div>
            <div className="toolpalette__label">Порядок</div>
            <div className="toolpalette__grid">
              {ORDER_BUTTONS.map((entry) => (
                <button
                  key={entry.action}
                  type="button"
                  className="toolbtn"
                  onClick={() => applyOrder(entry.action)}
                  disabled={!selection.size || readOnly}
                  title={entry.title}
                >
                  {entry.icon}
                </button>
              ))}
            </div>
            <div className="toolpalette__sep" />
            <label className="toolpalette__check">
              <input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />
              Привязка к соседям
            </label>
            <div className="toolpalette__hint">Галочка включает ровное выравнивание по краям и центрам соседних объектов при переносе.</div>
            <div className="toolpalette__sep" />
            {imageSelection.length === 1 ? (
              <>
                <div className="toolpalette__label">Заменить картинку</div>
                <div className="toolpalette__grid">
                  <button type="button" className="toolbtn" onClick={() => void replaceImage(imageSelection[0].id, 'clipboard')} title="Заменить из буфера обмена">
                    <ClipboardPaste size={16} />
                  </button>
                  <button type="button" className="toolbtn" onClick={() => void replaceImage(imageSelection[0].id, 'file')} title="Заменить из файла">
                    <ImagePlus size={16} />
                  </button>
                  <button type="button" className="toolbtn" onClick={() => void replaceImage(imageSelection[0].id, 'url')} title="Заменить по ссылке">
                    <ExternalLink size={16} />
                  </button>
                  <button type="button" className="toolbtn" onClick={() => void openItemPreview(imageSelection[0])} title="Открыть предпросмотр">
                    <Search size={16} />
                  </button>
                </div>
              </>
            ) : null}
            {imageSelection.length > 1 ? (
              <>
                <div className="toolpalette__label">Картинок выбрано: {imageSelection.length}</div>
                <button
                  type="button"
                  className="toolpalette__action"
                  disabled={readOnly}
                  onClick={() => void replaceImagesFromFiles()}
                >
                  <ImagePlus size={15} />
                  Заменить файлами
                </button>
                <div className="toolpalette__hint">
                  Файлы идут по порядку сверху вниз. Можно просто перетащить их из проводника на доску.
                </div>
              </>
            ) : null}
            <div className="toolpalette__grid">
              <button
                type="button"
                className="toolbtn"
                onClick={() => toggleLock([...selection])}
                disabled={!selection.size || readOnly}
                title={selectionLocked ? 'Разблокировать' : 'Заблокировать'}
              >
                {selectionLocked ? <LockOpen size={16} /> : <Lock size={16} />}
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => duplicateItems([...selection])}
                disabled={!selection.size || readOnly}
                title="Дублировать (Ctrl+D)"
              >
                <Copy size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => deleteItems([...selection])}
                disabled={!selection.size || readOnly}
                title="Удалить (Delete)"
              >
                <Trash2 size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => {
                  setSelection(new Set())
                  setFindOpen(false)
                }}
                title="Снять выделение (Escape)"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        ) : null}
        {panelKind === 'solid' && solidPanel ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__row">
              {SOLID_KINDS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="toolbtn"
                  data-active={solidKind === entry.id}
                  onClick={() => {
                    setSolidKind(entry.id)
                    if (solidPanel.target) patchSolid({ solid: entry.id })
                  }}
                  title={entry.label}
                >
                  {solidIcon(entry.id)}
                </button>
              ))}
            </div>
            <div className="toolpalette__label">Режим</div>
            <div className="toolpalette__grid">
              {SOLID_MODES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="toolbtn"
                  data-active={solidMode === entry.id}
                  onClick={() => setSolidMode(entry.id)}
                  title={entry.title}
                >
                  {entry.icon}
                </button>
              ))}
            </div>
            <div className="toolpalette__hint">{solidPanel.hint}</div>
            <div className="toolpalette__sep" />
            <label className="toolpalette__slider" title="Размер ребра">
              <span>Размер</span>
              <input
                type="range"
                min={60}
                max={600}
                step={10}
                value={solidPanel.edge}
                onChange={(event) => patchSolid({ edge: Number(event.target.value) }, true)}
              />
              <span>{Math.round(solidPanel.edge)}</span>
            </label>
            <label className="toolpalette__slider" title="Наклон">
              <span>Наклон</span>
              <input
                type="range"
                min={-80}
                max={80}
                step={1}
                value={solidPanel.pitch}
                onChange={(event) => patchSolid({ pitch: Number(event.target.value) }, true)}
              />
              <span>{Math.round(solidPanel.pitch)}</span>
            </label>
            <label className="toolpalette__slider" title="Поворот">
              <span>Поворот</span>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={Math.round(solidPanel.yaw)}
                onChange={(event) => patchSolid({ yaw: Number(event.target.value) }, true)}
              />
              <span>{Math.round(solidPanel.yaw)}</span>
            </label>
            <div className="toolpalette__label">Ракурсы</div>
            <div className="toolpalette__grid">
              {SOLID_VIEWS.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className="toolbtn"
                  onClick={() => patchSolid({ pitch: entry.pitch, yaw: entry.yaw })}
                  title={entry.label}
                >
                  <span style={{ fontSize: 11 }}>{entry.short}</span>
                </button>
              ))}
            </div>
            <div className="toolpalette__sep" />
            <label className="toolpalette__check">
              <input
                type="checkbox"
                checked={solidPanel.showEdges !== false}
                onChange={(event) => patchSolid({ showEdges: event.target.checked })}
              />
              Рёбра
            </label>
            <label className="toolpalette__check">
              <input
                type="checkbox"
                checked={solidPanel.showHidden === true}
                onChange={(event) => patchSolid({ showHidden: event.target.checked })}
              />
              Скрытые линии пунктиром
            </label>
            <label className="toolpalette__check">
              <input
                type="checkbox"
                checked={solidPanel.showAxes === true}
                onChange={(event) => patchSolid({ showAxes: event.target.checked })}
              />
              Координатные плоскости
            </label>
            <label className="toolpalette__check">
              <input
                type="checkbox"
                checked={solidPanel.showFaceGrid === true}
                onChange={(event) => patchSolid({ showFaceGrid: event.target.checked })}
              />
              Сетка на гранях
            </label>
            <div className="toolpalette__sep" />
            <div className="toolpalette__label">Цвет рёбер и штрихов</div>
            <div className="toolpalette__row">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  aria-label={`Цвет ${color}`}
                  onClick={() => (solidPanel.target ? patchSolid({ color }) : setStrokeColor(color))}
                  style={{
                    background: color,
                    outline: solidPanel.color.toLowerCase() === color ? '2px solid var(--inverse)' : '1px solid var(--border)'
                  }}
                />
              ))}
              <label className="swatch swatch--custom" title="Свой цвет">
                <input
                  type="color"
                  value={solidPanel.color}
                  onChange={(event) => (solidPanel.target ? patchSolid({ color: event.target.value }) : setStrokeColor(event.target.value))}
                  aria-label="Свой цвет"
                />
                <Pipette size={14} />
              </label>
            </div>
            <label className="toolpalette__slider" title="Толщина линии">
              <span>Линия</span>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={solidPanel.lineWidth}
                onChange={(event) => patchSolid({ lineWidth: Number(event.target.value) }, true)}
              />
              <span>{Math.round(solidPanel.lineWidth)}</span>
            </label>
            {solidPanel.target ? (
              <>
                <div className="toolpalette__label">Оттенок граней</div>
                <div className="toolpalette__row">
                  {SOLID_TINTS.map((tint) => (
                    <button
                      key={tint}
                      type="button"
                      className="swatch"
                      aria-label={`Оттенок ${tint}`}
                      title="Собрать грани из оттенков этого цвета"
                      onClick={() => patchSolid({ tint, faces: tintFaces(tint, solidPanel.faces.map((face) => face.id)) })}
                      style={{
                        background: tint,
                        outline: solidPanel.tint.toLowerCase() === tint ? '2px solid var(--inverse)' : '1px solid var(--border)'
                      }}
                    />
                  ))}
                  <label className="swatch swatch--custom" title="Свой оттенок">
                    <input
                      type="color"
                      value={solidPanel.tint}
                      onChange={(event) =>
                        patchSolid({ tint: event.target.value, faces: tintFaces(event.target.value, solidPanel.faces.map((face) => face.id)) })
                      }
                      aria-label="Свой оттенок граней"
                    />
                    <Pipette size={14} />
                  </label>
                </div>
                <div className="toolpalette__label">Цвета граней</div>
                <div className="toolpalette__row">
                  {solidPanel.faces.slice(0, 8).map((face) => (
                    <button
                      key={face.id}
                      type="button"
                      className="swatch"
                      aria-label={`Грань ${face.id}`}
                      title={face.id}
                      onClick={() => paintSolidFace(doc?.items ?? [], solidPanel.targetId, face.id, strokeColor)}
                      style={{
                        background: face.color,
                        outline: strokeColor.toLowerCase() === face.color.toLowerCase() ? '2px solid var(--inverse)' : '1px solid var(--border)'
                      }}
                    />
                  ))}
                </div>
                <div className="toolpalette__hint">
                  Все грани — оттенки одного цвета: верхние светлее, нижние темнее. Отдельную грань можно
                  перекрасить, выбрав цвет рёбер и щёлкнув по ней.
                </div>
              </>
            ) : (
              <div className="toolpalette__hint">Щёлкните по доске, чтобы поставить фигуру.</div>
            )}
          </div>
        ) : null}
        {panelKind === 'create' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__row">
              {CREATE_SHAPES.map((entry) => (
                <button
                  key={entry.label}
                  type="button"
                  className="toolbtn"
                  data-active={CREATE_STROKES.has(entry.id) ? createTool === entry.id : createShape === entry.shape}
                  onClick={() => {
                    if (!CREATE_STROKES.has(entry.id)) setCreateShape(entry.shape)
                    setCreateTool(entry.id)
                  }}
                  title={entry.label}
                >
                  {entry.id === 'line' ? (
                    <Minus size={17} />
                  ) : entry.id === 'arrow' ? (
                    <MoveUpRight size={17} />
                  ) : (
                    shapeIcon(entry.shape)
                  )}
                </button>
              ))}
            </div>
            <div className="toolpalette__row">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  aria-label={`Цвет ${color}`}
                  onClick={() => setStrokeColor(color)}
                  style={{ background: color, outline: strokeColor.toLowerCase() === color ? '2px solid var(--inverse)' : '1px solid var(--border)' }}
                />
              ))}
              <label className="swatch swatch--custom" title="Свой цвет">
                <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} aria-label="Свой цвет" />
                <Pipette size={14} />
              </label>
            </div>
            <label className="toolpalette__slider" title="Толщина линии">
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
              />
              <span>{strokeWidth}</span>
            </label>
            <div className="toolpalette__hint">Потяните по доске, чтобы нарисовать</div>
          </div>
        ) : null}
        {panelKind === 'link' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__hint">
              {linkFrom ? 'Теперь щёлкните по второму объекту' : 'Щёлкните по первому объекту'}
            </div>
            {linkFrom ? (
              <button type="button" className="toolbtn" onClick={() => setLinkFrom(null)} title="Отменить выбор">
                <X size={15} />
              </button>
            ) : null}
          </div>
        ) : null}
        {panelKind === 'draw' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__row">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  aria-label={`Цвет ${color}`}
                  onClick={() => setStrokeColor(color)}
                  style={{ background: color, outline: strokeColor.toLowerCase() === color ? '2px solid var(--inverse)' : '1px solid var(--border)' }}
                />
              ))}
              <label className="swatch swatch--custom" title="Свой цвет">
                <input type="color" value={strokeColor} onChange={(event) => setStrokeColor(event.target.value)} aria-label="Свой цвет" />
                <Pipette size={14} />
              </label>
            </div>
            <div className="toolpalette__row">
              {QUICK_WIDTHS.map((width) => (
                <button
                  key={width}
                  type="button"
                  className="toolbtn"
                  data-active={strokeWidth === width}
                  onClick={() => setStrokeWidth(width)}
                  title={`Толщина ${width}`}
                  style={{ height: 26 }}
                >
                  <span style={{ width: 20, height: width, borderRadius: 99, background: 'currentColor' }} />
                </button>
              ))}
            </div>
            <label className="toolpalette__slider" title="Своя толщина">
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={strokeWidth}
                onChange={(event) => setStrokeWidth(Number(event.target.value))}
              />
              <span>{strokeWidth}</span>
            </label>
          </div>
        ) : null}
        {panelKind === 'erase' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__hint">Проведите по объектам, чтобы стереть их</div>
          </div>
        ) : null}
        {panelKind === 'image' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__row">
              <button
                type="button"
                className="toolbtn"
                onClick={() =>
                  void api.dialog.pickImage().then((dataUrl) => {
                    if (!dataUrl) return
                    return addImageAt(dataUrl, { x: viewRef.current.x, y: viewRef.current.y })
                  })
                }
                title="Вставить картинку из файла"
              >
                <ImagePlus size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() =>
                  void api.clipboard.readImage().then((dataUrl) => {
                    if (!dataUrl) {
                      toast('В буфере нет картинки', 'info')
                      return
                    }
                    return addImageAt(dataUrl, { x: viewRef.current.x, y: viewRef.current.y })
                  })
                }
                title="Вставить картинку из буфера"
              >
                <ClipboardPaste size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => void openLinkPreview()}
                title="Предпросмотр ссылки, PDF, видео или файла"
              >
                <ExternalLink size={16} />
              </button>
            </div>
            <div className="toolpalette__hint">
              Поддерживаются png, jpg, gif, webp, svg, avif, bmp, ico. Кнопка со ссылкой открывает окно предпросмотра: страница сайта,
              YouTube или Vimeo, PDF, видео и аудио.
            </div>
          </div>
        ) : null}
        {panelKind === 'text' || panelKind === 'sticky' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__hint">
              {panelKind === 'text'
                ? 'Щёлкните по доске — откроется ввод. Потом можно править двойным щелчком.'
                : 'Щёлкните по доске, чтобы поставить стикер.'}
            </div>
          </div>
        ) : null}
        {panelKind === 'graph' && graphPanel ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__hint">
              Плоскость с осями. Графики задаются формулой: x^2, 2*x+1, sin(x), sqrt(x), |x|, 1/x.
            </div>
            <div className="toolpalette__label">Масштаб и начало координат</div>
            <label className="toolpalette__slider" title="Пикселей на единицу">
              <span>Масштаб</span>
              <input
                type="range"
                min={10}
                max={160}
                step={5}
                value={graphPanel.scale}
                onChange={(event) => patchGraph({ scale: Number(event.target.value) }, true)}
              />
              <span>{graphPanel.scale}</span>
            </label>
            <label className="graphpanel__row" title="Сколько единиц в одной клетке сетки">
              <span>Цена деления</span>
              <select
                className="graphpanel__select"
                value={String(graphPanel.gridStep)}
                onChange={(event) => patchGraph({ gridStep: Number(event.target.value) })}
              >
                {GRAPH_DIVISIONS.map((value) => (
                  <option key={value} value={String(value)}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="graphpanel__row" title="Сдвиг начала координат по горизонтали в единицах">
              <span>Сдвиг X</span>
              <input
                className="graphpanel__num"
                type="number"
                step={graphPanel.gridStep}
                value={graphPanel.originUnitsX}
                onChange={(event) => {
                  const units = Number(event.target.value)
                  if (!Number.isFinite(units)) return
                  patchGraph({ originX: clamp(0.5 + (units * graphPanel.scale) / Math.max(1, graphPanel.w), 0, 1) }, true)
                }}
              />
            </label>
            <label className="graphpanel__row" title="Сдвиг начала координат по вертикали в единицах">
              <span>Сдвиг Y</span>
              <input
                className="graphpanel__num"
                type="number"
                step={graphPanel.gridStep}
                value={graphPanel.originUnitsY}
                onChange={(event) => {
                  const units = Number(event.target.value)
                  if (!Number.isFinite(units)) return
                  patchGraph({ originY: clamp(0.5 + (units * graphPanel.scale) / Math.max(1, graphPanel.h), 0, 1) }, true)
                }}
              />
            </label>
            <div className="toolpalette__grid toolpalette__grid--3">
              <button type="button" className="toolbtn" onClick={() => fitGraphToView()} title="Вписать плоскость в окно">
                <Maximize2 size={16} />
              </button>
              <button type="button" className="toolbtn" onClick={() => patchGraph({ w: 360, h: 260 })} title="Маленькая плоскость">
                <span style={{ fontSize: 10 }}>360×260</span>
              </button>
              <button type="button" className="toolbtn" onClick={() => patchGraph({ w: 640, h: 440 })} title="Обычная плоскость">
                <span style={{ fontSize: 10 }}>640×440</span>
              </button>
            </div>
            <div className="toolpalette__grid toolpalette__grid--3">
              <button type="button" className="toolbtn" onClick={() => patchGraph({ w: 960, h: 640 })} title="Широкая плоскость">
                <span style={{ fontSize: 10 }}>960×640</span>
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => patchGraph({ showGrid: !graphPanel.showGrid })}
                data-active={graphPanel.showGrid}
                title="Сетка"
              >
                <Grid3x3 size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => patchGraph({ showLabels: !graphPanel.showLabels })}
                data-active={graphPanel.showLabels}
                title="Подписи чисел"
              >
                <Type size={16} />
              </button>
            </div>
            <div className="toolpalette__hint">
              Плоскость {Math.round(graphPanel.w)}×{Math.round(graphPanel.h)}. Кнопка слева вписывает её в окно.
            </div>
            <div className="toolpalette__sep" />
            <div className="toolpalette__label">Графики</div>
            {graphPanel.expressions.map((expression) => {
              const broken = expression.formula.trim() !== '' && !compileFormula(expression.formula)
              return (
                <div key={expression.id} className="graphrow" data-broken={broken || undefined}>
                  <input
                    className="graphrow__swatch"
                    type="color"
                    value={expression.color}
                    onChange={(event) => patchExpression(expression.id, { color: event.target.value }, true)}
                    aria-label="Цвет графика"
                  />
                  <input
                    className="graphrow__input"
                    value={graphDraft[expression.id] ?? expression.formula}
                    onChange={(event) => {
                      const value = event.target.value
                      setGraphDraft({ ...graphDraft, [expression.id]: value })
                      patchExpression(expression.id, { formula: value }, true)
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') patchExpression(expression.id, { formula: graphDraft[expression.id] ?? expression.formula })
                    }}
                    placeholder="x^2"
                  />
                  <button
                    type="button"
                    className="toolbtn graphrow__width"
                    onClick={() => {
                      const at = GRAPH_STROKES.indexOf(expression.lineWidth)
                      patchExpression(expression.id, { lineWidth: GRAPH_STROKES[(at + 1) % GRAPH_STROKES.length] })
                    }}
                    title="Толщина линии графика"
                  >
                    <span style={{ fontSize: 11 }}>{expression.lineWidth}</span>
                  </button>
                  <button
                    type="button"
                    className="toolbtn"
                    data-active={expression.visible}
                    onClick={() => patchExpression(expression.id, { visible: !expression.visible })}
                    title="Показать или скрыть"
                    style={{ width: 30, height: 30 }}
                  >
                    {expression.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className="toolbtn"
                    onClick={() => patchGraph({ expressions: graphPanel.expressions.filter((entry) => entry.id !== expression.id) })}
                    title="Удалить график"
                    style={{ width: 30, height: 30 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              className="toolpalette__action"
              onClick={() =>
                patchGraph({
                  expressions: [
                    ...graphPanel.expressions,
                    { id: uid('ex_'), formula: 'x', color: QUICK_COLORS[(graphPanel.expressions.length + 1) % QUICK_COLORS.length], lineWidth: 3, visible: true }
                  ]
                })
              }
              title="Добавить график"
            >
              <Plus size={15} /> Добавить график
            </button>
            <div className="toolpalette__hint">
              Формула применяется сразу при вводе. Неверная подсвечивается строкой снизу.
            </div>
          </div>
        ) : null}
        {panelKind === 'link' && linkPreview ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__hint truncate">{linkPreview}</div>
            <button
              type="button"
              className="toolbtn"
              onClick={() => void openLinkPreview(linkPreview)}
              title="Открыть в окне предпросмотра"
            >
              <ExternalLink size={16} />
            </button>
          </div>
        ) : null}
      </div>

      <div className="overlay bfloat bfloat--br">
        <div className="toolgroup">
          <button type="button" className="toolbtn" onClick={() => zoomBy(1 / 1.25)} aria-label="Уменьшить" title="Уменьшить">
            <ZoomOut size={17} />
          </button>
          <span className="zoomval" ref={zoomLabelRef}>
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button type="button" className="toolbtn" onClick={() => zoomBy(1.25)} aria-label="Увеличить" title="Увеличить">
            <ZoomIn size={17} />
          </button>
          <div className="bbar__sep" />
          <button type="button" className="toolbtn" onClick={fitAll} aria-label="Вписать доску" title="Вписать доску (F)">
            <Maximize size={17} />
          </button>
          <button
            type="button"
            className="toolbtn"
            onClick={() => {
              setBoardSettingsOpen((value) => !value)
              setObjectsOpen(false)
              setDetailsOpen(false)
              setShowInspector(false)
            }}
            aria-label="Настройки доски"
            title="Настройки доски: сетка и привязка"
            data-active={boardSettingsOpen}
          >
            <Grid3x3 size={17} />
          </button>
        </div>
      </div>


      {objectsOpen && doc ? (
        <ObjectsPanel
          items={doc.items}
          selection={selection}
          onSelect={(ids, additive) =>
            setSelection((current) => {
              if (!additive) return new Set(ids)
              const next = new Set(current)
              for (const id of ids) {
                if (next.has(id)) next.delete(id)
                else next.add(id)
              }
              return next
            })
          }
          onFocus={(id) => navigateTo(id)}
          onDelete={(ids) => deleteItems(ids)}
          onToggleLock={(ids) => toggleLock(ids)}
          onConvert={(ids) => convertToShape(ids)}
          onOrder={(ids, action) => orderItems(ids, action)}
          onClose={() => setObjectsOpen(false)}
        />
      ) : null}

      {showInspector && selection.size ? (
        <Inspector
          items={selectedItems}
          docTitle={doc.title}
          onClose={() => setShowInspector(false)}
          onPatch={patchItem}
          onDelete={deleteItems}
          onDuplicate={duplicateItems}
          onNavigateTo={navigateTo}
        />
      ) : null}

      {detailsOpen && doc ? <BoardDetails doc={doc} onClose={() => setDetailsOpen(false)} /> : null}

      {boardSettingsOpen ? (
        <BoardSettings
          mode={gridMode}
          size={gridSize}
          snap={snapGrid}
          onMode={(mode) => changeGrid({ gridMode: mode })}
          onSize={(size) => changeGrid({ gridSize: size })}
          onSnap={(value) => changeGrid({ snapGrid: value })}
          onClose={() => setBoardSettingsOpen(false)}
        />
      ) : null}

      {showExport ? <ExportDialog doc={doc} onClose={() => setShowExport(false)} /> : null}
    </div>
  )
}

export const BOARD_CULL_MARGIN = CULL_MARGIN