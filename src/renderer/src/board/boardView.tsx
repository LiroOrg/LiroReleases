import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpToLine,
  Calculator,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Grid3x3,
  Group,
  Ungroup,
  Highlighter,
  ImageOff,
  ImagePlus,
  Info,
  Layers,
  Link2,
  Lock,
  LockOpen,
  Maximize,
  Play,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minus,
  MousePointer2,
  Move,
  MoveUpRight,
  Magnet,
  PaintBucket,
  PenTool,
  Pencil,
  Pipette,
  Plus,
  Redo2,
  RotateCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Type,
  Undo2,
  Users,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { AssetRef, BoardDoc, BoardItem, GraphExpr, GraphItem, GridMode, PathItem, Rect, ShapeName, SolidFace, SolidItem, SolidKind } from '@shared/types'
import { solidBounds, solidFaceAt, solidPolygons } from '@shared/three'
import { compileFormula } from '@shared/graph'
import { contrastColor, shadesOf } from '@shared/color'
import { faceLocalToWorld, faceWorldToLocal, polygonOverlapArea, projectPoint, solidProjection, solidScreenToLocal } from '@shared/three'
import { snapBox, unionBox } from './align'
import type { Guide, Placed } from './align'
import { clamp, fitTextBox, rotatedBox, uid, withoutDanglingConnectors } from '@shared/util'
import { curvePath } from '@shared/curve'
import { buildStroke, distanceToStroke, straightStroke } from '@shared/stroke'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { navigate } from '../router'
import { ItemLayer, itemBounds, visibleItems } from './scene'
import { shapePath } from './shapes'
import { ConnectorLayer } from './connectors'
import { BoardDetails } from './boardDetails'
import { BoardSettings } from './boardSettings'
import { Inspector } from './inspector'
import { ExportDialog } from './exportDialog'
import { Spinner, usePrompt } from '../components/ui'
import {
  isEditableTarget,
  parseClipboardHtml,
  parseClipboardText,
  pastePayloadBounds,
  payloadFromEvent,
  shiftPastePayload
} from '../lib/paste'
import { readObjectClipboard, writeObjectClipboard } from '../lib/objectClipboard'
import { encodeLiroClipboard, decodeLiroClipboard } from '../lib/liroClipboard'
import { useLiveBoard } from '../live/useLiveBoard'
import { useMediaSync } from '../live/mediaSync'
import { LiveCursors } from '../live/cursors'
import { LivePanel } from '../live/panel'
import { BoardToolbar, normalizeToolLayout, railTools } from './toolbar'
import { CalculatorPanel } from './calculator'
import { applyDiff, applyPatch, decodeDiff, diffItems, encodeDiff, invertDiff } from '../live/diff'
import type { RestorePatch } from '../live/diff'
import { takePendingJoin } from '../live/pending'
import type { LiveMessage, LivePreview } from '@shared/live'

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
  | { kind: 'erase'; removed: Set<string> }
  | { kind: 'create'; startX: number; startY: number; currentX: number; currentY: number; tool: CreateTool; shape: ShapeName }
  | { kind: 'link'; fromId: string; point: { x: number; y: number } }
  | { kind: 'rotate'; id: string; startX: number; startY: number; pitch: number; yaw: number }
  | {
      kind: 'face'
      id: string
      face: string
      points: Array<{ x: number; y: number }>
      straight: boolean
      done: Array<{ face: string; points: Array<{ x: number; y: number }> }>
    }
  | {
      kind: 'resize'
      id: string
      handle: ResizeHandle
      startX: number
      startY: number
      origin: Rect
      moved: boolean
    }
  | {
      kind: 'turn'
      id: string
      centerX: number
      centerY: number
      startAngle: number
      startRotation: number
      moved: boolean
    }
  | { kind: 'pen'; points: Array<{ x: number; y: number }> }

type Tool = 'select' | 'pan' | 'pen' | 'erase' | 'create' | 'link' | 'text' | 'sticky' | 'image' | 'solid' | 'graph' | 'table'

type CreateTool = 'rect' | 'ellipse' | 'triangle' | 'line' | 'arrow'

type SolidMode = 'rotate' | 'move' | 'paint' | 'through'

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

const RESIZE_HANDLES: Array<{ id: ResizeHandle; cx: number; cy: number; cursor: string }> = [
  { id: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
  { id: 'n', cx: 0.5, cy: 0, cursor: 'ns-resize' },
  { id: 'ne', cx: 1, cy: 0, cursor: 'nesw-resize' },
  { id: 'e', cx: 1, cy: 0.5, cursor: 'ew-resize' },
  { id: 'se', cx: 1, cy: 1, cursor: 'nwse-resize' },
  { id: 's', cx: 0.5, cy: 1, cursor: 'ns-resize' },
  { id: 'sw', cx: 0, cy: 1, cursor: 'nesw-resize' },
  { id: 'w', cx: 0, cy: 0.5, cursor: 'ew-resize' }
]

const RESIZE_MIN = 16

const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function rotatePoint(point: { x: number; y: number }, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180
  return {
    x: Math.cos(rad) * point.x - Math.sin(rad) * point.y,
    y: Math.sin(rad) * point.x + Math.cos(rad) * point.y
  }
}

interface ResizeBox {
  x: number
  y: number
  width: number
  height: number
}

function resizedItem(item: BoardItem, origin: Rect, next: ResizeBox): BoardItem {
  const width = Math.max(RESIZE_MIN, Math.round(next.width))
  const height = Math.max(RESIZE_MIN, Math.round(next.height))
  const x = Math.round(next.x)
  const y = Math.round(next.y)
  if (item.kind === 'path') {
    const scaleX = width / Math.max(1, origin.width)
    const scaleY = height / Math.max(1, origin.height)
    return {
      ...item,
      x,
      y,
      w: width,
      h: height,
      points: item.points.map((point) => ({ x: point.x * scaleX, y: point.y * scaleY })),
      lineWidth: Math.max(0.5, item.lineWidth * Math.max(scaleX, scaleY))
    }
  }
  if (item.kind === 'text') {
    const fit = fitTextBox(item.plain, {
      width,
      minHeight: Math.round(item.fontSize * 1.3),
      fontSize: item.fontSize,
      padX: 2,
      padY: 2
    })
    return { ...item, x, y, w: width, h: fit.height, fontSize: fit.fontSize }
  }
  if (item.kind === 'sticky') {
    const fit = fitTextBox(item.plain, { width, minHeight: height, fontSize: item.fontSize, padX: 8, padY: 6 })
    return { ...item, x, y, w: width, h: fit.height, fontSize: fit.fontSize }
  }
  if (item.kind === 'shape') {
    const fit = fitTextBox(item.plain, { width, minHeight: height, fontSize: item.fontSize, padX: 6, padY: 5 })
    return { ...item, x, y, w: width, h: height, fontSize: fit.fontSize }
  }
  if (item.kind === 'table') {
    const scaleX = width / Math.max(1, origin.width)
    const scaleY = height / Math.max(1, origin.height)
    return {
      ...item,
      x,
      y,
      w: width,
      h: height,
      columnWidths: item.columnWidths.map((value) => Math.max(60, Math.round(value * scaleX))),
      rowHeights: item.rowHeights.map((value) => Math.max(28, Math.round(value * scaleY)))
    }
  }
  return { ...item, x, y, w: width, h: height }
}

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

function shapeTextColorOf(item: { textColor?: string; fillColor: string }): string {
  return item.textColor ?? contrastColor(item.fillColor === 'transparent' ? '#ffffff' : item.fillColor)
}

function textColorOf(item: BoardItem): string {
  if (item.kind === 'text') return item.color
  if (item.kind === 'sticky') return '#1a1a1a'
  if (item.kind === 'shape') return shapeTextColorOf(item)
  return '#1a1a1a'
}

function paintColorOf(item: BoardItem): string {
  if (item.kind === 'text') return item.color
  if (item.kind === 'sticky') return item.color
  if (item.kind === 'shape') return shapeTextColorOf(item)
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
const HISTORY_LIMIT = 200
const FIRST_BATCH = 300
const MOVE_EASE = 0.4
const QUICK_COLORS = ['#1a1a1a', '#7f1d1d', '#1d4ed8', '#15803d', '#b45309']
const STICKY_COLORS = ['#fff9b1', '#ffd8b1', '#cfe8fb', '#d9f2e3', '#f3e0ff']
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
const SOLID_TINTS = ['#8b95a1', '#5f7d8c', '#7a8a6d', '#94795f', '#8a7f95', '#6f7f95']
const SOLID_DEFAULT_TINT = '#8b95a1'

function tintFaces(tint: string, ids: string[]): SolidFace[] {
  const shades = shadesOf(tint, ids.length)
  return ids.map((id, index) => ({ id, color: shades[index] ?? tint }))
}

function pushCapped<T>(stack: T[], entry: T): void {
  stack.push(entry)
  if (stack.length > HISTORY_LIMIT) stack.shift()
}

function solidsCollide(candidate: SolidItem, items: BoardItem[]): boolean {
  const candidatePolys = solidProjection(candidate).polygons.filter((entry) => entry.front)
  if (!candidatePolys.length) return false
  for (const other of items) {
    if (other.kind !== 'solid' || other.id === candidate.id) continue
    const gapX = Math.abs(candidate.x + candidate.w / 2 - (other.x + other.w / 2)) - (candidate.w + other.w) / 2
    const gapY = Math.abs(candidate.y + candidate.h / 2 - (other.y + other.h / 2)) - (candidate.h + other.h) / 2
    if (gapX > 0 || gapY > 0) continue
    const polys = solidProjection(other).polygons.filter((entry) => entry.front)
    for (const first of candidatePolys) {
      const shifted = first.points.map((point) => ({ x: point.x + candidate.x - other.x, y: point.y + candidate.y - other.y }))
      for (const second of polys) {
        if (polygonOverlapArea(shifted, second.points) > 2) return true
      }
    }
  }
  return false
}

function cloneGroupMap(source: BoardItem[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const item of source) if (item.groupId && !map.has(item.groupId)) map.set(item.groupId, uid('grp_'))
  return map
}

function cloneParent(parentId: string | undefined, source: BoardItem[], cloneIds: string[]): string | undefined {
  if (!parentId) return undefined
  const index = source.findIndex((item) => item.id === parentId)
  return index < 0 ? undefined : cloneIds[index]
}

const NEW_SHAPE_COLOR = '#ffffff'
const NEW_SHAPE_STROKE = '#1a1a1a'

function changed(base: BoardItem[], next: BoardItem[]): boolean {
  return next.some((entry, index) => entry !== base[index])
}

function withPatch(item: BoardItem, patch: Partial<BoardItem>): BoardItem {
  if (item.locked && patch.locked === undefined) return item
  const merged = { ...item, ...patch } as BoardItem
  if (merged.kind !== 'table') return merged
  const width = patch.w
  const height = patch.h
  if (width !== undefined && !('columnWidths' in patch)) {
    const total = merged.columnWidths.reduce((sum, value) => sum + value, 0)
    if (total > 0) {
      merged.columnWidths = merged.columnWidths.map((value) => Math.max(60, Math.round((value * width) / total)))
    }
  }
  if (height !== undefined && !('rowHeights' in patch)) {
    const total = merged.rowHeights.reduce((sum, value) => sum + value, 0)
    if (total > 0) {
      merged.rowHeights = merged.rowHeights.map((value) => Math.max(28, Math.round((value * height) / total)))
    }
  }
  return merged
}

const GRID_MODES: Array<{ id: GridMode; label: string }> = [
  { id: 'none', label: 'Без сетки' },
  { id: 'lines', label: 'Линии' },
  { id: 'dots', label: 'Точки' }
]

const SOLID_MODES: Array<{ id: SolidMode; title: string; icon: ReactNode }> = [
  { id: 'rotate', title: 'Вращение: тяните по фигуре', icon: <RotateCw size={16} /> },
  { id: 'move', title: 'Перемещение: тяните по фигуре', icon: <Move size={16} /> },
  { id: 'paint', title: 'Заливка грани: щёлкните по грани', icon: <PaintBucket size={16} /> },
  { id: 'through', title: 'Прямая внутри: две точки на гранях', icon: <Link2 size={16} /> }
]

const SOLID_MODE_HINTS: Record<SolidMode, string> = {
  rotate: 'Тяните по фигуре для вращения.',
  move: 'Тяните фигуру для переноса. Alt — в любом режиме.',
  paint: 'Выберите цвет и щёлкните по грани.',
  through: 'Две точки на гранях соединяются прямой через фигуру. Esc отменяет.'
}

interface LiveHistoryEntry {
  undo: RestorePatch
  redo: RestorePatch
}

interface InkBox {
  id: string
  x: number
  y: number
  width: number
  height: number
  path: string
  local: Array<{ x: number; y: number }>
  color: string
  opacity: number
  base: number
}

interface MoveEntry {
  id: string
  x: number
  y: number
  w?: number
  h?: number
}

interface CropEdit {
  id: string
  src: string
  imgW: number
  imgH: number
  origin: { x: number; y: number }
  rotation: number
  win: { x: number; y: number; w: number; h: number }
}

export function BoardView(props: { docId: string }): ReactNode {
  const toast = useApp((state) => state.toast)
  const fail = useApp((state) => state.fail)
  const setLibrary = useApp((state) => state.setLibrary)
  const settings = useApp((state) => state.settings)
  const setSettings = useApp((state) => state.setSettings)
  const railOrder = useMemo(
    () => normalizeToolLayout(settings?.toolbarOrder, settings?.toolbarExtras).order,
    [settings?.toolbarOrder, settings?.toolbarExtras]
  )
  const railExtras = useMemo(
    () => normalizeToolLayout(settings?.toolbarOrder, settings?.toolbarExtras).extras,
    [settings?.toolbarOrder, settings?.toolbarExtras]
  )

  const setLayout = useCallback(
    (layout: { order: Tool[]; extras: Tool[] }): void => {
      void api.settings
        .set({ toolbarOrder: layout.order, toolbarExtras: layout.extras })
        .then((result) => {
          setSettings(result)
        })
        .catch(() => undefined)
    },
    [setSettings]
  )

  const [doc, setDoc] = useState<BoardDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [ready, setReady] = useState(false)
  const [shownItems, setShownItems] = useState(0)
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 0.4 })
  const [size, setSize] = useState({ width: 1200, height: 800 })
  const [railGutter, setRailGutter] = useState(56)
  const [selection, setSelection] = useState<Set<string>>(new Set())
  const [drag, setDrag] = useState<DragMode>({ kind: 'idle' })
  const [readOnlyLocal, setReadOnlyLocal] = useState(false)
  const [hostLocked, setHostLocked] = useState(false)
  const { ask, element: promptElement } = usePrompt()
  useEffect(() => {
    if (!doc) return
    document.title = doc.title ? `${doc.title} — Liro` : 'Liro'
    return () => {
      document.title = 'Liro'
    }
  }, [doc?.title])

  const [showInspector, setShowInspector] = useState(false)
  
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [gridMode, setGridMode] = useState<GridMode>(settings?.gridMode ?? 'dots')
  const [gridSize, setGridSize] = useState(settings?.gridSize ?? 40)
  const gridModeRef = useRef(gridMode)
  const gridSizeRef = useRef(gridSize)
  const [snapGrid, setSnapGrid] = useState(settings?.snapGrid ?? false)
  useEffect(() => {
    if (!settings) return
    setGridMode(settings.gridMode)
    setGridSize(settings.gridSize)
    setSnapGrid(settings.snapGrid)
    setSnapEnabled(settings.alignSnap)
  }, [settings])
  const [boardSettingsOpen, setBoardSettingsOpen] = useState(false)
  const [calculatorOpen, setCalculatorOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [penMode, setPenMode] = useState<'pen' | 'highlighter'>('pen')
  const [tool, setTool] = useState<Tool>('select')
  const [faceLabel, setFaceLabel] = useState<{
    itemId: string
    face: string
    point: { x: number; y: number }
    replaces: number | null
    value: string
  } | null>(null)

  const toggleOverlay = useCallback(
    (kind: 'calculator' | 'details' | 'inspector' | 'settings' | 'export'): void => {
      const open =
        kind === 'calculator'
          ? !calculatorOpen
          : kind === 'details'
            ? !detailsOpen
            : kind === 'inspector'
              ? !showInspector
              : kind === 'settings'
                ? !boardSettingsOpen
                : !showExport
      setCalculatorOpen(false)
      setDetailsOpen(false)
      setShowInspector(false)
      setBoardSettingsOpen(false)
      setShowExport(false)
      if (!open) return
      if (kind === 'calculator') setCalculatorOpen(true)
      if (kind === 'details') setDetailsOpen(true)
      if (kind === 'inspector') setShowInspector(true)
      if (kind === 'settings') setBoardSettingsOpen(true)
      if (kind === 'export') setShowExport(true)
    },
    [calculatorOpen, detailsOpen, showInspector, boardSettingsOpen, showExport]
  )
  
  const [createTool, setCreateTool] = useState<CreateTool>('rect')
  const [createShape, setCreateShape] = useState<ShapeName>('rectangle')
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [solidKind, setSolidKind] = useState<SolidKind>('cube')
  const [strokeColor, setStrokeColor] = useState('#1a1a1a')
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [shapeColor, setShapeColor] = useState(NEW_SHAPE_COLOR)
  const [shapeStroke, setShapeStroke] = useState(2)
  const createIsLine = CREATE_STROKES.has(createTool)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [liveZoom, setLiveZoom] = useState(40)
  const live = useLiveBoard({ userName: settings?.userName ?? '' })
  const media = useMediaSync(live.sendOps)
  const readOnly = readOnlyLocal || hostLocked
  const [menu, setMenu] = useState<{ x: number; y: number; onItem: string } | null>(null)
  const [menuPos, setMenuPos] = useState({ x: 8, y: 8 })
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 })
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number; size: number } | null>(null)
  const eraseBaseRef = useRef<BoardItem[] | null>(null)
  const itemNodesRef = useRef(new Map<string, HTMLDivElement>())
  const liveRef = useRef(0)
  const livePosRef = useRef(new Map<string, { x: number; y: number }>())
  const moveFrameRef = useRef(0)
  const pendingFitRef = useRef(false)
  const moveDeltaRef = useRef({ x: 0, y: 0 })
  const [snapEnabled, setSnapEnabled] = useState(settings?.alignSnap ?? true)
  const [dropActive, setDropActive] = useState(false)
  const [guides, setGuides] = useState<Guide[]>([])
  const guidesKeyRef = useRef('')
  const snapTargetsRef = useRef<Placed[]>([])
  const [solidMode, setSolidMode] = useState<SolidMode>('rotate')
  const [linkPreview, setLinkPreview] = useState('')
  const [linkWidth, setLinkWidth] = useState(2)
  const [linkStyle, setLinkStyle] = useState<'straight' | 'curved' | 'elbowed'>('curved')
  const [linkArrow, setLinkArrow] = useState(true)
  const [eraseSize, setEraseSize] = useState(14)
  const [textColor, setTextColor] = useState('#1a1a1a')
  const [textSize, setTextSize] = useState(16)
  const [graphDraft, setGraphDraft] = useState<Record<string, string>>({})

  const showGuides = useCallback((next: Guide[]): void => {
    const key = next.map((guide) => `${guide.axis}${Math.round(guide.at)}`).join('|')
    if (key === guidesKeyRef.current) return
    guidesKeyRef.current = key
    setGuides(next)
  }, [])

  useEffect(() => {
    if (drag.kind === 'idle') showGuides([])
  }, [drag.kind, showGuides])

  const registerNode = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) itemNodesRef.current.set(id, node)
    else itemNodesRef.current.delete(id)
  }, [])

  const flushMovePositions = useCallback((): void => {
    moveFrameRef.current = 0
    for (const [id, position] of livePosRef.current) {
      const node = itemNodesRef.current.get(id)
      if (!node) continue
      node.style.left = `${position.x}px`
      node.style.top = `${position.y}px`
    }
  }, [])

  const [inkGhost, setInkGhost] = useState<InkBox | null>(null)
  const [cropEdit, setCropEdit] = useState<CropEdit | null>(null)
  const cropDragRef = useRef<{
    handle: string
    x: number
    y: number
    win: { x: number; y: number; w: number; h: number }
  } | null>(null)

  const inkGeometry = (raw: Array<{ x: number; y: number; t: number }>, straight: boolean, id: string): InkBox | null => {
    if (raw.length < 2) return null
    const marker = penMode === 'highlighter'
    const base = marker ? 14 : Math.max(1, strokeWidth)
    const points = straight
      ? straightStroke(raw[0], raw[raw.length - 1])
      : buildStroke(raw, { width: base, marker }).points
    if (points.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of points) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
    const pad = base / 2 + 1
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const local = points.map((point) => ({ x: point.x - minX, y: point.y - minY }))
    return {
      id,
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      path: curvePath(local),
      local,
      color: strokeColor,
      opacity: marker ? 0.35 : 1,
      base
    }
  }

  useEffect(() => {
    if (!inkGhost) return undefined
    let frame = requestAnimationFrame(function tick(): void {
      if (itemNodesRef.current.has(inkGhost.id)) setInkGhost(null)
      else frame = requestAnimationFrame(tick)
    })
    const deadline = window.setTimeout(() => setInkGhost(null), 600)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(deadline)
    }
  }, [inkGhost])

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRectRef = useRef({ left: 0, top: 0 })

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
  const zoomLabelRef = useRef<HTMLButtonElement | null>(null)
  const viewRef = useRef<Viewport>(viewport)
  const targetRef = useRef<Viewport>(viewport)
  const smoothRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const lastSyncRef = useRef(0)
  const followTargetRef = useRef<Viewport | null>(null)
  const inertiaRef = useRef<number | null>(null)
  const undoRef = useRef<BoardItem[][]>([])
  const redoRef = useRef<BoardItem[][]>([])
  const liveUndoRef = useRef<LiveHistoryEntry[]>([])
  const liveRedoRef = useRef<LiveHistoryEntry[]>([])
  const itemsRef = useRef<BoardItem[]>([])

  const dragBaseRef = useRef<BoardItem[] | null>(null)
  const rotateRef = useRef<{ id: string; rotation: number } | null>(null)
  const strokePointsRef = useRef<Array<{ x: number; y: number }>>([])
  const penPointsRef = useRef<Array<{ x: number; y: number; t: number }>>([])
  const penSmoothRef = useRef<Array<{ x: number; y: number }>>([])
  const penStraightRef = useRef(false)
  const strokeFrameRef = useRef(0)
  const overlayPointRef = useRef<{ x: number; y: number } | null>(null)
  const overlayFrameRef = useRef(0)
  const overlayTimerRef = useRef<number | null>(null)
  const spaceRef = useRef(false)
  const nudgeAtRef = useRef(0)
  const saveTimerRef = useRef<number | null>(null)
  const pendingRef = useRef<BoardItem[] | null>(null)
  const thumbTimerRef = useRef<number | null>(null)
  const dpr = Math.min(2, window.devicePixelRatio || 1)

  const paintGrid = useCallback(
    (next: Viewport): void => {
      const canvas = wrapRef.current
      if (!canvas) return
      const mode = gridModeRef.current
      if (mode === 'none') {
        canvas.style.backgroundImage = 'none'
        return
      }
      const step = Math.max(4, gridSizeRef.current)
      const cell = Math.max(1, step * next.zoom)
      const fade = Math.round(clamp((cell - 9) / 10, 0, 1) * 100) / 100
      if (fade <= 0.01) {
        canvas.style.backgroundImage = 'none'
        return
      }
      const minor = Math.round(cell * 100) / 100
      const originX = size.width / 2 - next.x * next.zoom
      const originY = size.height / 2 - next.y * next.zoom
      if (mode === 'dots') {
        canvas.style.backgroundImage = `radial-gradient(circle at 0.5px 0.5px, rgba(24,24,30,${Math.round(
          0.26 * fade * 1000
        ) / 1000}) 0.9px, transparent 1.5px)`
        canvas.style.backgroundSize = `${minor}px ${minor}px`
        canvas.style.backgroundPosition = `${originX}px ${originY}px`
        return
      }
      const soft = Math.round(0.06 * fade * 1000) / 1000
      canvas.style.backgroundImage = [
        `linear-gradient(to right, rgba(24,24,30,${soft}) 0.5px, transparent 0.5px)`,
        `linear-gradient(to bottom, rgba(24,24,30,${soft}) 0.5px, transparent 0.5px)`
      ].join(', ')
      canvas.style.backgroundSize = `${minor}px ${minor}px, ${minor}px ${minor}px`
      canvas.style.backgroundPosition = `${originX}px ${originY}px, ${originX}px ${originY}px`
    },
    [size]
  )

  useEffect(() => {
    gridModeRef.current = gridMode
    gridSizeRef.current = gridSize
    paintGrid(viewRef.current)
  }, [gridMode, gridSize, paintGrid])

  const applyDom = useCallback(
    (next: Viewport): void => {
      viewRef.current = next
      const world = worldRef.current
      if (world) {
        world.style.transform = `translate3d(${size.width / 2 - next.x * next.zoom}px, ${
          size.height / 2 - next.y * next.zoom
        }px, 0) scale(${next.zoom})`
      }
      paintGrid(next)
      if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(next.zoom * 100)}%`
    },
    [size, paintGrid]
  )

  const applyDomRef = useRef(applyDom)
  useEffect(() => {
    applyDomRef.current = applyDom
  }, [applyDom])

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
        itemsRef.current = loaded.items
        setTitleDraft(loaded.title)
        setLoading(false)
        if (loaded.viewport?.zoom) {
          const initial: Viewport = loaded.viewport
          viewRef.current = initial
          targetRef.current = initial
          applyDomRef.current(initial)
          setViewport(initial)
          setLiveZoom(initial.zoom)
        } else if (!loaded.items.length) {
          const initial: Viewport = { x: 0, y: 0, zoom: 1 }
          viewRef.current = initial
          targetRef.current = initial
          applyDomRef.current(initial)
          setViewport(initial)
          setLiveZoom(initial.zoom)
        } else {
          pendingFitRef.current = true
        }
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
  }, [props.docId, fail])

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const measure = (): void => {
      const width = element.clientWidth
      const height = element.clientHeight
      if (!width || !height) return
      const rect = element.getBoundingClientRect()
      canvasRectRef.current = { left: rect.left, top: rect.top }
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }))
      const rail = element.parentElement?.querySelector<HTMLElement>('.toolrail')
      const gutter = rail ? Math.max(0, Math.round(rail.getBoundingClientRect().right - rect.left)) : 0
      setRailGutter((current) => (current === gutter ? current : gutter))
      applyDomRef.current(viewRef.current)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [doc])

  useLayoutEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (rect.left === canvasRectRef.current.left && rect.top === canvasRectRef.current.top) return
    canvasRectRef.current = { left: rect.left, top: rect.top }
  })

  useEffect(() => {
    if (loading || !doc) return
    const timer = window.setTimeout(() => setReady(true), 30)
    return () => window.clearTimeout(timer)
  }, [loading, doc])

  useEffect(() => {
    if (!doc) return
    const pending = takePendingJoin()
    if (!pending) return
    void live.joinGuest(pending.code, doc, pending.offer).catch((error: unknown) =>
      fail(error instanceof Error ? error.message : String(error))
    )
  }, [doc, live, fail])

  const visible = useMemo<Rect>(() => {
    const current = viewRef.current
    const halfW = size.width / current.zoom / 2
    const halfH = size.height / current.zoom / 2
    return { x: current.x - halfW, y: current.y - halfH, width: halfW * 2, height: halfH * 2 }
  }, [viewport, size])

  const items = useMemo(() => (doc ? visibleItems(doc, visible) : []), [doc, visible])
  const previewSolid = live.preview?.kind === 'solid' ? live.preview : null
  const previewMove = live.preview?.kind === 'move' ? live.preview.items : null
  const previewText = live.preview?.kind === 'text' ? live.preview : null
  const easedMoveRef = useRef(new Map<string, { x: number; y: number; w: number; h: number }>())
  const moveTargetRef = useRef<MoveEntry[]>([])
  const moveEaseFrameRef = useRef<number | null>(null)
  const [smoothedMove, setSmoothedMove] = useState<MoveEntry[] | null>(null)

  const stepMoveEase = useCallback((): void => {
    moveEaseFrameRef.current = null
    const targets = moveTargetRef.current
    const eased = easedMoveRef.current
    if (!targets.length) {
      eased.clear()
      setSmoothedMove(null)
      return
    }
    let settled = true
    const list: MoveEntry[] = []
    for (const entry of targets) {
      const source = itemsRef.current.find((item) => item.id === entry.id)
      const from = eased.get(entry.id) ?? {
        x: source?.x ?? entry.x,
        y: source?.y ?? entry.y,
        w: source?.w ?? entry.w ?? 0,
        h: source?.h ?? entry.h ?? 0
      }
      const width = entry.w ?? source?.w ?? from.w
      const height = entry.h ?? source?.h ?? from.h
      const dx = entry.x - from.x
      const dy = entry.y - from.y
      const dw = width - from.w
      const dh = height - from.h
      const done = Math.abs(dx) + Math.abs(dy) + Math.abs(dw) + Math.abs(dh) <= 0.75
      if (!done) settled = false
      const value = {
        x: done ? entry.x : from.x + dx * MOVE_EASE,
        y: done ? entry.y : from.y + dy * MOVE_EASE,
        w: done ? width : from.w + dw * MOVE_EASE,
        h: done ? height : from.h + dh * MOVE_EASE
      }
      eased.set(entry.id, value)
      list.push({ id: entry.id, x: value.x, y: value.y, w: value.w, h: value.h })
    }
    for (const id of Array.from(eased.keys())) if (!list.some((entry) => entry.id === id)) eased.delete(id)
    setSmoothedMove(list)
    if (!settled) moveEaseFrameRef.current = requestAnimationFrame(stepMoveEase)
  }, [])

  useEffect(() => {
    moveTargetRef.current = previewMove ?? []
    if (!moveTargetRef.current.length) {
      if (moveEaseFrameRef.current !== null) cancelAnimationFrame(moveEaseFrameRef.current)
      moveEaseFrameRef.current = null
      easedMoveRef.current.clear()
      setSmoothedMove(null)
      return
    }
    if (moveEaseFrameRef.current === null) moveEaseFrameRef.current = requestAnimationFrame(stepMoveEase)
  }, [previewMove, stepMoveEase])

  useEffect(() => {
    return () => {
      if (moveEaseFrameRef.current !== null) cancelAnimationFrame(moveEaseFrameRef.current)
    }
  }, [])

  const movePreview = smoothedMove?.length ? smoothedMove : previewMove
  const rendered = useMemo(() => {
    let list = items.slice(0, shownItems > 0 ? shownItems : FIRST_BATCH)
    if (movePreview?.length) {
      const positions = new Map(movePreview.map((entry) => [entry.id, entry]))
      list = list.map((item) => {
        const position = positions.get(item.id)
        if (!position) return item
        return {
          ...item,
          x: position.x,
          y: position.y,
          w: position.w ?? item.w,
          h: position.h ?? item.h
        }
      })
    }
    if (previewText) {
      list = list.map((item) => {
        if (item.id !== previewText.id) return item
        if (item.kind !== 'text' && item.kind !== 'sticky' && item.kind !== 'shape') return item
        return { ...item, content: previewText.content, plain: previewText.plain }
      })
    }
    if (!previewSolid) return list
    return list.map((item) => {
      if (item.id !== previewSolid.id || item.kind !== 'solid') return item
      const box = solidBounds(item.solid, item.edge, previewSolid.pitch, previewSolid.yaw)
      return {
        ...item,
        pitch: previewSolid.pitch,
        yaw: previewSolid.yaw,
        w: Math.max(1, Math.round(box.width)),
        h: Math.max(1, Math.round(box.height))
      } as SolidItem
    })
  }, [items, shownItems, movePreview, previewText, previewSolid])

  const remoteAssetsRef = useRef(new Map<string, string>())

  const withRemoteAssets = useCallback((list: BoardItem[]): BoardItem[] => {
    if (!remoteAssetsRef.current.size) return list
    let changed = false
    const next = list.map((item) => {
      if (item.kind !== 'image') return item
      const dataUrl = remoteAssetsRef.current.get(item.id)
      if (!dataUrl || item.asset?.dataUrl) return item
      changed = true
      return { ...item, asset: { ...item.asset, file: '', dataUrl } } as BoardItem
    })
    return changed ? next : list
  }, [])

  const previewClearRef = useRef<{ frame: number; timer: number } | null>(null)

  const clearPreviewWhenPainted = useCallback(
    (painted: string[]): void => {
      const previous = previewClearRef.current
      if (previous) {
        window.cancelAnimationFrame(previous.frame)
        window.clearTimeout(previous.timer)
      }
      if (!painted.length) {
        previewClearRef.current = null
        live.clearRemotePreview()
        return
      }
      const token = { frame: 0, timer: 0 }
      const finish = (): void => {
        window.cancelAnimationFrame(token.frame)
        window.clearTimeout(token.timer)
        if (previewClearRef.current === token) previewClearRef.current = null
        live.clearRemotePreview()
      }
      const tick = (): void => {
        if (painted.some((id) => itemNodesRef.current.has(id))) finish()
        else token.frame = window.requestAnimationFrame(tick)
      }
      token.timer = window.setTimeout(finish, 600)
      token.frame = window.requestAnimationFrame(tick)
      previewClearRef.current = token
    },
    [live]
  )

  useEffect(() => {
    return () => {
      const pending = previewClearRef.current
      if (pending) {
        window.cancelAnimationFrame(pending.frame)
        window.clearTimeout(pending.timer)
      }
    }
  }, [])

  const [assetsEpoch, setAssetsEpoch] = useState(0)

  const touchAssets = useCallback((): void => {
    setAssetsEpoch((value) => value + 1)
  }, [])

  const shareImageAssets = useCallback(
    (entries: Array<{ itemId: string; dataUrl: string }>): void => {
      if (!live.connected) return
      for (const entry of entries) {
        remoteAssetsRef.current.set(entry.itemId, entry.dataUrl)
        live.sendChunked(`asset/${entry.itemId}`, JSON.stringify({ dataUrl: entry.dataUrl }))
      }
      touchAssets()
    },
    [live, touchAssets]
  )

  const askedAssetsRef = useRef(new Set<string>())

  const requestRemoteAssets = useCallback(
    (list: BoardItem[]): void => {
      if (!live.connected) return
      let asked = false
      for (const item of list) {
        if (item.kind !== 'image') continue
        const file = item.asset?.file
        if (!file || item.asset?.dataUrl || remoteAssetsRef.current.has(item.id) || askedAssetsRef.current.has(item.id)) continue
        asked = true
        askedAssetsRef.current.add(item.id)
        live.sendOps({ t: 'asset', item: item.id })
      }
      if (asked) touchAssets()
    },
    [live, touchAssets]
  )

  const deliverRemoteAsset = useCallback(
    (itemId: string): void => {
      const held = remoteAssetsRef.current.get(itemId)
      if (held) {
        live.sendChunked(`asset/${itemId}`, JSON.stringify({ dataUrl: held }))
        return
      }
      const source = itemsRef.current.find((item) => item.id === itemId)
      const file = source?.kind === 'image' ? source.asset?.file : ''
      if (!file) return
      void api.board
        .assetData(props.docId, file)
        .then((dataUrl) => {
          if (dataUrl) live.sendChunked(`asset/${itemId}`, JSON.stringify({ dataUrl }))
        })
        .catch(() => undefined)
    },
    [live, props.docId]
  )

  const applyRemoteItems = useCallback(
    (incoming: BoardItem[]): void => {
      const next = withRemoteAssets(incoming)
      itemsRef.current = next
      void api.board.saveItems(props.docId, next).catch(() => undefined)
      setDoc((current) => {
        if (!current) return current
        livePosRef.current.clear()
        liveRef.current += 1
        return { ...current, items: next, stats: { ...current.stats, items: next.length } }
      })
      setShownItems(0)
    },
    [props.docId, withRemoteAssets]
  )
  useEffect(() => {
    live.onRemoteChunk((id, payload) => {
      if (id.startsWith('asset/')) {
        try {
          const parsed = JSON.parse(payload) as { dataUrl?: string }
          const itemId = id.slice('asset/'.length)
          if (!parsed.dataUrl || remoteAssetsRef.current.has(itemId)) return
          remoteAssetsRef.current.set(itemId, parsed.dataUrl)
          const next = withRemoteAssets(itemsRef.current)
          if (next === itemsRef.current) return
          itemsRef.current = next
          void api.board.saveItems(props.docId, next).catch(() => undefined)
          liveRef.current += 1
          setDoc((current) =>
            current ? { ...current, items: next, stats: { ...current.stats, items: next.length } } : current
          )
        } catch {
          fail('Не удалось получить картинку')
        }
        return
      }
      if (id === 'snapshot') {
        try {
          const parsed = JSON.parse(payload) as { title: string; items: BoardItem[] }
          applyRemoteItems(parsed.items)
          askedAssetsRef.current.clear()
          requestRemoteAssets(parsed.items)
          if (parsed.title) {
            setDoc((current) => (current ? { ...current, title: parsed.title } : current))
            setTitleDraft(parsed.title)
          }
          toast(`Получена доска «${parsed.title}»`, 'success')
        } catch {
          fail('Не удалось применить доску')
        }
        return
      }
      if (id !== 'ops') return
      try {
        const diff = decodeDiff(payload)
        const next = withRemoteAssets(applyDiff(itemsRef.current, diff))
        itemsRef.current = next
        clearPreviewWhenPainted(diff.changed.map((item) => item.id))
        setDoc((current) => {
          if (!current) return current
          livePosRef.current.clear()
          liveRef.current += 1
          return { ...current, items: next, stats: { ...current.stats, items: next.length } }
        })
        void api.board.saveItems(props.docId, next).catch(() => undefined)
        requestRemoteAssets(next)
      } catch {
        fail('Не удалось применить изменения')
      }
    })
  }, [live, applyRemoteItems, withRemoteAssets, clearPreviewWhenPainted, requestRemoteAssets, toast, fail, props.docId])

  useEffect(() => {
    live.onRemoteOps((message: LiveMessage) => {
      media.handle(message)
      if (message.t === 'asset') {
        deliverRemoteAsset(message.item)
      }
      if (message.t === 'perm') {
        toast(message.canEdit ? 'Вам разрешили редактировать' : 'Редактирование запрещено', 'info')
      }
    })
  }, [live, media, toast, deliverRemoteAsset])

  useEffect(() => {
    if (live.role !== 'guest') {
      setHostLocked(false)
      return
    }
    setHostLocked(!live.connected || !live.canEdit)
  }, [live.role, live.connected, live.canEdit])

  useEffect(() => {
    if (shownItems >= items.length) return
    const step = 300
    const timer = window.setTimeout(() => setShownItems((current) => Math.min(items.length, current + step)), 24)
    return () => window.clearTimeout(timer)
  }, [items.length, shownItems])
  const byId = useMemo(() => new Map((doc?.items ?? []).map((item) => [item.id, item])), [doc])
  const selectedItems = useMemo(() => (doc ? doc.items.filter((item) => selection.has(item.id)) : []), [doc, selection])
  const solidSelection = useMemo(() => selectedItems.filter((item): item is SolidItem => item.kind === 'solid'), [selectedItems])
  const imageSelection = useMemo(() => selectedItems.filter((item) => item.kind === 'image'), [selectedItems])
  const graphSelection = useMemo(() => selectedItems.filter((item): item is GraphItem => item.kind === 'graph'), [selectedItems])
  const selectionLocked = selectedItems.length > 0 && selectedItems.every((item) => item.locked)
  const editingItem = editing ? byId.get(editing.id) : undefined
  const resizeTargets =
    tool === 'select' && !readOnly && !editingItem
      ? selectedItems.filter((item) => !item.locked && item.kind !== 'solid' && item.kind !== 'connector')
      : []
  const panelKind: 'none' | 'selection' | 'solid' | 'graph' | 'create' | 'erase' | 'link' | 'text' | 'sticky' | 'image' | 'table' | 'pen' = (() => {
    if (tool === 'graph') return 'graph'
    if (tool === 'solid') return 'solid'
    if (tool === 'pen') return 'pen'
    if (tool === 'select') {
      if (graphSelection.length > 0) return 'graph'
      if (solidSelection.length > 0) return 'solid'
      return selection.size > 0 ? 'selection' : 'none'
    }
    if (tool === 'pan') return 'none'
    return tool
  })()
  useLayoutEffect(() => {
    if (panelKind === 'none') return
    const rail = document.querySelector<HTMLElement>('.toolrail')
    const palette = document.querySelector<HTMLElement>('.toolpalette')
    if (!rail || !palette) return
    const container = rail.parentElement
    const update = (): void => {
      const containerBox = container?.getBoundingClientRect()
      const railBox = rail.getBoundingClientRect()
      const railTop = containerBox ? railBox.top - containerBox.top : 0
      const shift = Math.max(0, (railBox.height - palette.getBoundingClientRect().height) / 2)
      palette.style.setProperty('--palette-top', `${Math.round(railTop + shift)}px`)
      palette.style.setProperty('--palette-max', `${Math.round((containerBox?.height ?? railBox.height) - railTop)}px`)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(rail)
    observer.observe(palette)
    return () => observer.disconnect()
  }, [panelKind])
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
    return doc.items.filter((item) => {
      if (item.kind !== 'image') return false
      if (item.asset?.file || item.asset?.dataUrl || item.asset?.sourceUrl) return false
      if (live.connected && (askedAssetsRef.current.has(item.id) || remoteAssetsRef.current.has(item.id))) return false
      return true
    })
  }, [doc, live.connected, assetsEpoch])

  const missingImages = missingImageItems.length

  const selectMissingImages = useCallback(() => {
    if (missingImageItems.length === 0) {
      toast('Заглушек больше нет', 'image')
      return
    }
    setSelection(new Set(missingImageItems.map((item) => item.id)))
    toast('Заглушки выбраны', 'select')
  }, [missingImageItems, toast])

  const assetUrl = useCallback(
    (file: string) => (file ? `lirofile://${encodeURIComponent(props.docId)}/${encodeURIComponent(file)}` : ''),
    [props.docId]
  )

  const toWorld = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvasRectRef.current
      const current = viewRef.current
      return {
        x: (clientX - rect.left - size.width / 2) / current.zoom + current.x,
        y: (clientY - rect.top - size.height / 2) / current.zoom + current.y
      }
    },
    [size]
  )

  const toScreen = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const rect = canvasRectRef.current
    return { x: clientX - rect.left, y: clientY - rect.top }
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

  useEffect(() => {
    if (!pendingFitRef.current || !doc) return
    if (!size.width || !size.height) return
    pendingFitRef.current = false
    fitTo(doc.bounds, 1)
  }, [doc, size, fitTo])

  const frames = useMemo(
    () =>
      (doc?.items ?? [])
        .filter((item) => item.kind === 'frame')
        .sort((left, right) => left.y - right.y || left.x - right.x),
    [doc]
  )

  const [present, setPresent] = useState(false)
  const [presentIndex, setPresentIndex] = useState(0)
  const [throughAnchor, setThroughAnchor] = useState<{ itemId: string; face: string; point: { x: number; y: number } } | null>(null)
  const [throughHover, setThroughHover] = useState<{ itemId: string; face: string; point: { x: number; y: number } } | null>(null)
  const throughFrameRef = useRef(0)
  const throughPendingRef = useRef<{ itemId: string; face: string; point: { x: number; y: number } } | null>(null)
  const solidMoveRef = useRef({ x: 0, y: 0 })

  const showFrame = useCallback(
    (index: number) => {
      const frame = frames[index]
      if (!frame) return
      setPresentIndex(index)
      fitTo({ x: frame.x, y: frame.y, width: frame.w, height: frame.h })
    },
    [frames, fitTo]
  )

  const startPresent = useCallback(() => {
    setPresent(true)
    if (frames.length) showFrame(0)
    else fitAll()
  }, [frames.length, showFrame, fitAll])

  const stopPresent = useCallback(() => {
    setPresent(false)
  }, [])

  const stepFrame = useCallback(
    (delta: number) => {
      if (!frames.length) return
      const next = (presentIndex + delta + frames.length) % frames.length
      showFrame(next)
    },
    [frames.length, presentIndex, showFrame]
  )

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
    live.onRemoteViewport((remote) => {
      if (remote.ask) {
        const current = viewRef.current
        live.pullPartner({ x: current.x, y: current.y, zoom: current.zoom })
        return
      }
      if (live.following) {
        followTargetRef.current = remote
        applyView(remote, true)
        return
      }
      animateTo({ x: remote.x, y: remote.y, zoom: remote.zoom }, 520)
    })
  }, [live, animateTo, applyView])

  useEffect(() => {
    if (!live.following) {
      followTargetRef.current = null
      return
    }
    const target = followTargetRef.current
    if (!target) return
    if (
      Math.abs(target.x - viewport.x) > 0.5 ||
      Math.abs(target.y - viewport.y) > 0.5 ||
      Math.abs(target.zoom - viewport.zoom) > 1e-4
    ) {
      followTargetRef.current = null
      live.stopFollow()
    }
  }, [viewport, live])

  useEffect(() => {
    if (!live.watching) return
    const current = viewRef.current
    live.sendOps({ t: 'viewport', x: current.x, y: current.y, zoom: current.zoom })
  }, [viewport, live.watching, live.sendOps])

  useEffect(() => {
    if (!doc) return
    const timer = window.setTimeout(() => {
      const current = viewRef.current
      void api.board.saveViewport(props.docId, current)
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [viewport, props.docId, doc])

  const startHosting = useCallback(() => {
    if (!doc) return
    void live.startHost(doc).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  }, [doc, live, fail])

  const saveCopyToLibrary = useCallback(() => {
    if (!doc) return
    void api.board
      .duplicate(doc.id)
      .then(() => toast('Копия доски сохранена в библиотеку', 'copy'))
      .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error), 'error'))
  }, [doc, toast])

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

  useEffect(
    () => () => {
      const pending = pendingRef.current
      if (livePatchTimerRef.current !== null) window.clearTimeout(livePatchTimerRef.current)
      void api.board.saveViewport(props.docId, viewRef.current).catch(() => undefined)
      if (!pending) return
      pendingRef.current = null
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      void api.board.saveItems(props.docId, pending).catch(() => undefined)
    },
    [props.docId]
  )

  const changeGrid = useCallback(
    (patch: { gridMode?: GridMode; gridSize?: number; snapGrid?: boolean; alignSnap?: boolean }): void => {
      if (patch.gridMode !== undefined) setGridMode(patch.gridMode)
      if (patch.gridSize !== undefined) setGridSize(patch.gridSize)
      if (patch.snapGrid !== undefined) setSnapGrid(patch.snapGrid)
      if (patch.alignSnap !== undefined) setSnapEnabled(patch.alignSnap)
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
    if (undoRef.current[undoRef.current.length - 1] === items) return
    pushCapped(undoRef.current, items)
    redoRef.current.length = 0
    setHistoryState({ undo: undoRef.current.length, redo: 0 })
  }, [])

  const persist = useCallback(
    (next: BoardItem[]) => {
      if (!doc) return
      livePosRef.current.clear()
      liveRef.current += 1
      itemsRef.current = next
      setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
      if (live.role === 'guest') return
      pendingRef.current = next
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null
        void api.board
          .saveItems(props.docId, next)
          .then(() => {
            if (pendingRef.current === next) pendingRef.current = null
            scheduleThumb()
          })
          .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
      }, 700)
    },
    [doc, props.docId, fail, scheduleThumb, live.role]
  )

  useEffect(() => {
    itemsRef.current = doc?.items ?? []
  }, [doc])

  useEffect(() => {
    const flush = (): void => {
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      void api.board.saveItems(props.docId, pending).catch(() => undefined)
    }
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [props.docId])

  const saveNow = useCallback(
    (items: BoardItem[]) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      pendingRef.current = null
      if (live.role === 'guest') return
      void api.board.saveItems(props.docId, items).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    },
    [props.docId, fail, live.role]
  )

  const flushPending = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current
    if (!pending) return
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    pendingRef.current = null
    await api.board.saveItems(props.docId, pending).catch(() => undefined)
  }, [props.docId])

  const commit = useCallback(
    (next: BoardItem[]) => {
      if (!doc) return
      if (next === doc.items) return
      if (live.connected) {
        const diff = diffItems(doc.items, next)
        if (diff.changed.length || diff.removed.length) {
          live.sendChunked('ops', encodeDiff(diff))
          pushCapped(liveUndoRef.current, {
            undo: invertDiff(doc.items, next),
            redo: { restore: diff.changed, remove: diff.removed }
          })
          liveRedoRef.current.length = 0
          setHistoryState({ undo: liveUndoRef.current.length, redo: 0 })
        }
      } else {
        remember(doc.items)
      }
      persist(next)
      itemsRef.current = next
    },
    [doc, remember, persist, live]
  )

  const commitAgainst = useCallback(
    (base: BoardItem[], next: BoardItem[]) => {
      if (!doc) return
      if (live.connected) {
        const diff = diffItems(base, next)
        if (diff.changed.length || diff.removed.length) {
          live.sendChunked('ops', encodeDiff(diff))
          pushCapped(liveUndoRef.current, {
            undo: invertDiff(base, next),
            redo: { restore: diff.changed, remove: diff.removed }
          })
          liveRedoRef.current.length = 0
          setHistoryState({ undo: liveUndoRef.current.length, redo: 0 })
        }
      } else {
        remember(base)
      }
      persist(next)
    },
    [doc, live, remember, persist]
  )

  const undo = useCallback(() => {
    if (!doc || readOnly) return
    if (live.connected) {
      const entry = liveUndoRef.current.pop()
      if (!entry) {
        toast('Отменять нечего', 'undo')
        return
      }
      const current = itemsRef.current
      const next = applyPatch(current, entry.undo)
      const diff = diffItems(current, next)
      itemsRef.current = next
      pushCapped(liveRedoRef.current, entry)
      livePosRef.current.clear()
      liveRef.current += 1
      setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
      setHistoryState({ undo: liveUndoRef.current.length, redo: liveRedoRef.current.length })
      saveNow(next)
      if (diff.changed.length || diff.removed.length) live.sendChunked('ops', encodeDiff(diff))
      toast('Отменено', 'undo')
      return
    }
    const previous = undoRef.current.pop()
    if (!previous) {
      toast('Отменять нечего', 'undo')
      return
    }
    pushCapped(redoRef.current, doc.items)
    livePosRef.current.clear()
    liveRef.current += 1
    itemsRef.current = previous
    setDoc({ ...doc, items: previous, stats: { ...doc.stats, items: previous.length } })
    setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length })
    saveNow(previous)
    toast('Отменено', 'undo')
  }, [doc, readOnly, saveNow, toast, live])

  const redo = useCallback(() => {
    if (!doc || readOnly) return
    if (live.connected) {
      const entry = liveRedoRef.current.pop()
      if (!entry) {
        toast('Возвращать нечего', 'redo')
        return
      }
      const current = itemsRef.current
      const next = applyPatch(current, entry.redo)
      const diff = diffItems(current, next)
      itemsRef.current = next
      pushCapped(liveUndoRef.current, entry)
      livePosRef.current.clear()
      liveRef.current += 1
      setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
      setHistoryState({ undo: liveUndoRef.current.length, redo: liveRedoRef.current.length })
      saveNow(next)
      if (diff.changed.length || diff.removed.length) live.sendChunked('ops', encodeDiff(diff))
      toast('Возвращено', 'redo')
      return
    }
    const next = redoRef.current.pop()
    if (!next) {
      toast('Возвращать нечего', 'redo')
      return
    }
    pushCapped(undoRef.current, doc.items)
    livePosRef.current.clear()
    liveRef.current += 1
    itemsRef.current = next
    setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
    setHistoryState({ undo: undoRef.current.length, redo: redoRef.current.length })
    saveNow(next)
    toast('Возвращено', 'redo')
  }, [doc, readOnly, saveNow, toast, live])

  const onWheel = useCallback(
    (event: WheelEvent) => {
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

  const wheelHandlerRef = useRef<(event: WheelEvent) => void>(() => undefined)
  useEffect(() => {
    wheelHandlerRef.current = (event: WheelEvent): void => onWheel(event)
  }, [onWheel])

  const dispatchWheel = useCallback((event: WheelEvent): void => {
    wheelHandlerRef.current(event)
  }, [])

  const setCanvasNode = useCallback((node: HTMLDivElement | null): void => {
    const previous = wrapRef.current
    if (previous) previous.removeEventListener('wheel', dispatchWheel)
    wrapRef.current = node
    if (node) node.addEventListener('wheel', dispatchWheel, { passive: false })
  }, [dispatchWheel])

  const eraseSegmentsRef = useRef<Map<string, Set<number>>>(new Map())
  const applyErasedSegments = useCallback((items: BoardItem[]): BoardItem[] => {
    const segments = eraseSegmentsRef.current
    if (!segments.size) return items
    const out: BoardItem[] = []
    for (const item of items) {
      const path = item.kind === 'path' ? item : null
      const erased = path ? segments.get(path.id) : undefined
      if (!path || !erased || !erased.size) {
        out.push(item)
        continue
      }
      const runs: number[][] = []
      let run: number[] = []
      for (let index = 0; index < path.points.length; index += 1) {
        run.push(index)
        if (index === path.points.length - 1 || erased.has(index)) {
          if (run.length > 1) runs.push(run)
          run = []
        }
      }
      if (!runs.length) continue
      runs.forEach((indices, order) => {
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const index of indices) {
          const point = path.points[index]
          if (point.x < minX) minX = point.x
          if (point.y < minY) minY = point.y
          if (point.x > maxX) maxX = point.x
          if (point.y > maxY) maxY = point.y
        }
        const pad = path.lineWidth / 2 + 1
        const x = path.x + minX - pad
        const y = path.y + minY - pad
        out.push({
          ...path,
          id: uid('path_'),
          x,
          y,
          w: Math.max(1, maxX - minX + pad * 2),
          h: Math.max(1, maxY - minY + pad * 2),
          points: indices.map((index) => ({
            x: path.points[index].x - minX + pad,
            y: path.points[index].y - minY + pad
          })),
          widths: path.widths ? indices.map((index) => path.widths![index]) : undefined,
          z: path.z + order * 0.01
        } as PathItem)
      })
    }
    return out
  }, [])

  const eraseAt = useCallback(
    (point: { x: number; y: number }, already: Set<string>): Set<string> => {
      if (!doc) return already
      const removed = new Set(already)
      const radius = Math.max(6, eraseSize / Math.max(0.05, viewRef.current.zoom))
      const segments = eraseSegmentsRef.current
      let strokesTouched = false
      for (const item of doc.items) {
        if (removed.has(item.id) || item.kind === 'connector' || item.locked) continue
        if (item.kind === 'path') {
          const local = item.points.map((entry) => ({ x: entry.x + item.x, y: entry.y + item.y }))
          const reach = radius + item.lineWidth / 2
          for (let index = 0; index < local.length - 1; index += 1) {
            if (distanceToStroke(point, [local[index], local[index + 1]]) > reach) continue
            const set = segments.get(item.id) ?? new Set<number>()
            set.add(index)
            segments.set(item.id, set)
            strokesTouched = true
          }
          continue
        }
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
      if (removed.size > already.size || strokesTouched) {
        const filtered = withoutDanglingConnectors(
          doc.items.filter((item) => !removed.has(item.id)),
          removed
        )
        const next = applyErasedSegments(filtered)
        setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
        setSelection(new Set())
      }
      return removed
    },
    [doc, applyErasedSegments]
  )

  const [linkFrom, setLinkFrom] = useState<string | null>(null)

  const addConnector = useCallback(
    (fromId: string, toId: string): void => {
      if (!doc || readOnly || fromId === toId) return
      const source = doc.items.find((item) => item.id === fromId)
      if (!source) return
      const box = itemBounds(source)
      const connector: BoardItem = {
        id: uid('conn_'),
        kind: 'connector',
        x: box.x,
        y: box.y,
        w: 1,
        h: 1,
        rotation: 0,
        z: doc.items.length,
        points: [],
        shape: linkStyle,
        color: strokeColor,
        lineWidth: linkWidth,
        lineStyle: 'normal',
        startStroke: 'none',
        endStroke: linkArrow ? 'arrow' : 'none',
        startItemId: fromId,
        endItemId: toId
      }
      commit([...doc.items, connector])
      setSelection(new Set([connector.id]))
    },
    [doc, readOnly, commit, linkStyle, linkWidth, linkArrow, strokeColor]
  )

  const itemAt = useCallback(
    (point: { x: number; y: number }): string | null => {
      if (!doc) return null
      let best: { id: string; area: number } | null = null
      for (const item of doc.items) {
        if (item.kind === 'connector' || item.locked) continue
        if (item.kind === 'path') {
          const local = item.points.map((entry) => ({ x: entry.x + item.x, y: entry.y + item.y }))
          const reach = Math.max(3, item.lineWidth / 2 + 3)
          if (distanceToStroke(point, local) > reach) continue
          const area = item.w * item.h
          if (!best || area < best.area) best = { id: item.id, area }
          continue
        }
        const box = itemBounds(item)
        if (point.x < box.x || point.x > box.x + box.width || point.y < box.y || point.y > box.y + box.height) continue
        const area = box.width * box.height
        if (!best || area < best.area) best = { id: item.id, area }
      }
      return best?.id ?? null
    },
    [doc]
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
        await flushPending()
        await api.board.appendItems({ docId: props.docId, items: [rawItem], images: [{ itemId: id, dataUrl }] })
        const loaded = await api.board.open(props.docId)
        if (live.connected) {
          shareImageAssets([{ itemId: id, dataUrl }])
          commitAgainst(doc.items, loaded.items)
        } else {
          remember(doc.items)
        }
        setDoc(loaded)
        setSelection(new Set([id]))
        toast('Картинка добавлена', 'image')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [doc, readOnly, props.docId, remember, toast, fail, flushPending, live, shareImageAssets, commitAgainst]
  )

  const createAt = useCallback(
    async (point: { x: number; y: number }, kind: 'text' | 'sticky' | 'image' | 'solid' | 'graph' | 'table'): Promise<void> => {
      if (!doc || readOnly) return
      if (kind === 'table') {
        const columns = 3
        const rows = 3
        const columnWidth = 160
        const rowHeight = 48
        const id = uid('tbl_')
        const item: BoardItem = {
          id,
          kind: 'table',
          x: Math.round(point.x - (columnWidth * columns) / 2),
          y: Math.round(point.y - (rowHeight * rows) / 2),
          w: columnWidth * columns,
          h: rowHeight * rows,
          rotation: 0,
          z: doc.items.length,
          columns,
          rows,
          columnWidths: new Array(columns).fill(columnWidth),
          rowHeights: new Array(rows).fill(rowHeight),
          cells: new Array(columns * rows).fill(''),
          fontSize: 14
        }
        commit([...doc.items, item])
        setSelection(new Set([id]))
        setTool('select')
        return
      }
      if (kind === 'graph') {
        const id = uid('graph_')
        const current = viewRef.current
        const width = Math.round(clamp((size.width / current.zoom) * 0.5, 420, 760))
        const height = Math.round(clamp((size.height / current.zoom) * 0.5, 300, 520))
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
        const fitted = fitTextBox('Текст', { width: 320, minHeight: 48, fontSize: textSize, padX: 2, padY: 2 })
        const item: BoardItem = {
          ...base,
          kind: 'text',
          w: fitted.width,
          h: fitted.height,
          content: '<p>Текст</p>',
          plain: 'Текст',
          color: textColor,
          align: 'left',
          fontSize: fitted.fontSize,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          urls: []
        }
        commit([...doc.items, item])
        setSelection(new Set([id]))
        setEditing({ id, value: 'Текст' })
        freshEditingRef.current = id
        return
      }
      const stickyFit = fitTextBox('Заметка', { width: 200, minHeight: 200, fontSize: textSize, padX: 8, padY: 6 })
      const item: BoardItem = {
        ...base,
        kind: 'sticky',
        w: stickyFit.width,
        h: stickyFit.height,
        content: '<p>Заметка</p>',
        plain: 'Заметка',
        color: textColor,
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
      freshEditingRef.current = id
    },
    [doc, readOnly, commit, toast, solidKind, strokeColor, size, textColor, textSize, addImageAt]
  )

  const insertImageFromUrl = useCallback(
    async (url: string): Promise<void> => {
      if (!doc || readOnly) return
      try {
        const fetched = await api.image.fetch(url)
        await addImageAt(fetched.dataUrl, { x: viewRef.current.x, y: viewRef.current.y })
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [doc, readOnly, addImageAt, fail]
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
        fillColor: shapeColor,
        borderColor: NEW_SHAPE_STROKE,
        borderWidth: shapeStroke,
        borderStyle: 'normal',
        opacity: 1,
        textAlign: 'center',
        textAlignVertical: 'middle',
        fontSize: fitTextBox('', { width: Math.max(8, Math.round(width)), minHeight: Math.max(8, Math.round(height)), fontSize: 16, padX: 6, padY: 5 }).fontSize,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        urls: []
      }
      return item
    },
    [doc, strokeColor, strokeWidth, shapeColor, shapeStroke]
  )

  const startResize = useCallback(
    (id: string, handle: ResizeHandle, event: React.PointerEvent): void => {
      event.stopPropagation()
      if (readOnly || !doc) return
      const item = byId.get(id)
      if (!item || item.locked) return
      if (item.kind === 'solid' || item.kind === 'connector') return
      const box = itemBounds(item)
      const point = toWorld(event.clientX, event.clientY)
      dragBaseRef.current = doc.items
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDrag({ kind: 'resize', id, handle, startX: point.x, startY: point.y, origin: box, moved: false })
    },
    [byId, doc, readOnly, toWorld]
  )

  const startRotate = useCallback(
    (id: string, event: React.PointerEvent): void => {
      event.stopPropagation()
      if (readOnly || !doc) return
      const item = byId.get(id)
      if (!item || item.locked) return
      if (item.kind === 'solid' || item.kind === 'connector') return
      const box = itemBounds(item)
      const centerX = box.x + box.width / 2
      const centerY = box.y + box.height / 2
      const point = toWorld(event.clientX, event.clientY)
      const startAngle = (Math.atan2(point.y - centerY, point.x - centerX) * 180) / Math.PI
      dragBaseRef.current = doc.items
      setDrag({ kind: 'turn', id, centerX, centerY, startAngle, startRotation: item.rotation, moved: false })
    },
    [byId, doc, readOnly, toWorld]
  )

  const startCrop = useCallback(
    async (id: string): Promise<void> => {
      const item = byId.get(id)
      if (!item || item.kind !== 'image' || readOnly) return
      const asset = item.asset
      const src = asset?.file ? assetUrl(asset.file) : asset?.dataUrl ?? asset?.sourceUrl ?? ''
      if (!src) return
      const natural = await imageSizeOf(src)
      if (!natural || !natural.width || !natural.height) return
      const box = itemBounds(item)
      const insets = item.crop ?? { top: 0, right: 0, bottom: 0, left: 0 }
      const fx = Math.max(0.02, 1 - insets.left - insets.right)
      const fy = Math.max(0.02, 1 - insets.top - insets.bottom)
      const scaleX = box.width / (fx * natural.width)
      const scaleY = box.height / (fy * natural.height)
      const imgW = natural.width * scaleX
      const imgH = natural.height * scaleY
      const win = { x: insets.left * imgW, y: insets.top * imgH, w: box.width, h: box.height }
      const shift = rotatePoint(
        { x: win.x + win.w / 2 - imgW / 2, y: win.y + win.h / 2 - imgH / 2 },
        item.rotation
      )
      setCropEdit({
        id,
        src,
        imgW,
        imgH,
        origin: { x: box.x + box.width / 2 - shift.x - imgW / 2, y: box.y + box.height / 2 - shift.y - imgH / 2 },
        rotation: item.rotation,
        win
      })
    },
    [byId, assetUrl, readOnly]
  )

  const moveCrop = useCallback(
    (handle: string, event: React.PointerEvent): void => {
      const gesture = cropDragRef.current
      if (!gesture || !cropEdit) return
      const zoom = Math.max(0.05, viewRef.current.zoom)
      const local = rotatePoint(
        { x: (event.clientX - gesture.x) / zoom, y: (event.clientY - gesture.y) / zoom },
        -cropEdit.rotation
      )
      const min = 16
      let { x, y, w, h } = gesture.win
      if (handle === 'move') {
        x = clamp(gesture.win.x + local.x, 0, cropEdit.imgW - w)
        y = clamp(gesture.win.y + local.y, 0, cropEdit.imgH - h)
        setCropEdit({ ...cropEdit, win: { x, y, w, h } })
        return
      }
      if (handle.includes('w')) {
        const next = clamp(gesture.win.x + local.x, 0, gesture.win.x + gesture.win.w - min)
        w = gesture.win.x + gesture.win.w - next
        x = next
      }
      if (handle.includes('e')) w = clamp(gesture.win.w + local.x, min, cropEdit.imgW - x)
      if (handle.includes('n')) {
        const next = clamp(gesture.win.y + local.y, 0, gesture.win.y + gesture.win.h - min)
        h = gesture.win.y + gesture.win.h - next
        y = next
      }
      if (handle.includes('s')) h = clamp(gesture.win.h + local.y, min, cropEdit.imgH - y)
      setCropEdit({ ...cropEdit, win: { x, y, w, h } })
    },
    [cropEdit]
  )

  const applyCrop = useCallback((): void => {
    if (!cropEdit || !doc) return
    const item = byId.get(cropEdit.id)
    if (!item || item.kind !== 'image') {
      setCropEdit(null)
      return
    }
    const win = cropEdit.win
    const insets = {
      left: win.x / cropEdit.imgW,
      top: win.y / cropEdit.imgH,
      right: Math.max(0, (cropEdit.imgW - win.x - win.w) / cropEdit.imgW),
      bottom: Math.max(0, (cropEdit.imgH - win.y - win.h) / cropEdit.imgH)
    }
    const untouched =
      insets.left < 0.002 && insets.top < 0.002 && insets.right < 0.002 && insets.bottom < 0.002
    const shift = rotatePoint(
      { x: win.x + win.w / 2 - cropEdit.imgW / 2, y: win.y + win.h / 2 - cropEdit.imgH / 2 },
      cropEdit.rotation
    )
    const centerX = cropEdit.origin.x + cropEdit.imgW / 2 + shift.x
    const centerY = cropEdit.origin.y + cropEdit.imgH / 2 + shift.y
    const patch: Partial<BoardItem> = {
      x: centerX - win.w / 2,
      y: centerY - win.h / 2,
      w: Math.max(RESIZE_MIN, win.w),
      h: Math.max(RESIZE_MIN, win.h),
      crop: untouched ? undefined : insets
    }
    commit(doc.items.map((entry) => (entry.id === cropEdit.id ? ({ ...entry, ...patch } as BoardItem) : entry)))
    setCropEdit(null)
  }, [cropEdit, doc, commit])

  const cropHandleDown = useCallback(
    (handle: string) => (event: React.PointerEvent): void => {
      if (!cropEdit) return
      event.stopPropagation()
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      cropDragRef.current = { handle, x: event.clientX, y: event.clientY, win: cropEdit.win }
    },
    [cropEdit]
  )

  const endCropDrag = useCallback((event: React.PointerEvent): void => {
    event.stopPropagation()
    cropDragRef.current = null
  }, [])

  const scheduleStrokeRender = useCallback((): void => {
    if (strokeFrameRef.current) return
    strokeFrameRef.current = requestAnimationFrame(() => {
      strokeFrameRef.current = 0
      setDrag((current) => {
        if (current.kind === 'face') {
          return { ...current, points: strokePointsRef.current }
        }
        return current
      })
    })
  }, [])

  const scheduleThroughRender = useCallback(
    (value: { itemId: string; face: string; point: { x: number; y: number } } | null): void => {
      throughPendingRef.current = value
      if (throughFrameRef.current) return
      throughFrameRef.current = requestAnimationFrame(() => {
        throughFrameRef.current = 0
        setThroughHover(throughPendingRef.current)
      })
    },
    []
  )

  useEffect(() => {
    throughPendingRef.current = null
    if (throughFrameRef.current) {
      cancelAnimationFrame(throughFrameRef.current)
      throughFrameRef.current = 0
    }
    setThroughAnchor(null)
    setThroughHover(null)
  }, [tool, solidMode, present])

  const previewTimerRef = useRef<number | null>(null)
  const pendingPreviewRef = useRef<LivePreview | null>(null)
  const inkClearRef = useRef(0)

  const pushPreview = useCallback(
    (value: LivePreview): void => {
      if (!live.connected) return
      pendingPreviewRef.current = value
      if (previewTimerRef.current !== null) return
      previewTimerRef.current = window.setTimeout(() => {
        previewTimerRef.current = null
        const pending = pendingPreviewRef.current
        pendingPreviewRef.current = null
        if (pending) live.sendPreview(pending)
      }, 60)
    },
    [live]
  )

  const pushPreviewRef = useRef(pushPreview)
  pushPreviewRef.current = pushPreview

  useEffect(() => {
    if (!editing) return
    const value = editing.value.replace(/\s+$/g, '')
    const html = value
      .split(/\n{2,}/)
      .map((block) => `<p>${block.replace(/\n/g, '<br>')}</p>`)
      .join('')
    pushPreviewRef.current({ t: 'preview', kind: 'text', id: editing.id, content: html, plain: value })
  }, [editing])

  const dropPendingPreview = useCallback((): void => {
    pendingPreviewRef.current = null
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current)
      previewTimerRef.current = null
    }
  }, [])

  const clearPreview = useCallback((): void => {
    dropPendingPreview()
    if (live.connected) live.sendPreview({ t: 'preview', kind: 'clear' })
  }, [live, dropPendingPreview])

  const scheduleOverlayRender = useCallback((): void => {
    if (overlayFrameRef.current) return
    const apply = (): void => {
      overlayFrameRef.current = 0
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current)
        overlayTimerRef.current = null
      }
      const point = overlayPointRef.current
      if (!point) return
      setDrag((current) => {
        if (current.kind === 'rubber') return { ...current, currentX: point.x, currentY: point.y }
        if (current.kind === 'create') return { ...current, currentX: point.x, currentY: point.y }
        if (current.kind === 'link') return { ...current, point }
        return current
      })
    }
    overlayFrameRef.current = requestAnimationFrame(apply)
    overlayTimerRef.current = window.setTimeout(apply, 40)
  }, [])

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
      if (tool === 'erase') {
        if (!doc || readOnly) return
        eraseBaseRef.current = doc.items
        eraseSegmentsRef.current = new Map()
        const removed = eraseAt(point, new Set())
        const screen = toScreen(event.clientX, event.clientY)
        setEraserCursor({ x: screen.x, y: screen.y, size: eraseSize * 2 })
        setDrag({ kind: 'erase', removed })
        return
      }
      if (tool === 'pen') {
        if (!doc || readOnly || event.button !== 0) return
        window.clearTimeout(inkClearRef.current)
        penPointsRef.current = [{ ...point, t: performance.now() }]
        penSmoothRef.current = [point]
        penStraightRef.current = false
        setDrag({ kind: 'pen', points: [point] })
        return
      }
      if (tool === 'text' || tool === 'sticky' || tool === 'image' || tool === 'solid' || tool === 'graph' || tool === 'table') {
        if (event.button !== 0) return
        if (tool === 'text' || tool === 'sticky') event.preventDefault()
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
        if (linkFrom && linkFrom !== under) {
          addConnector(linkFrom, under)
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
    [toWorld, toScreen, tool, doc, readOnly, eraseAt, createTool, createShape, createAt, itemAt, byId, linkFrom, addConnector]
  )

  const faceAtLocal = useCallback((item: SolidItem, point: { x: number; y: number }) => {
    const local = { x: point.x - item.x, y: point.y - item.y }
    return solidFaceAt(item, local)
  }, [])

  const facePointOf = useCallback((item: SolidItem, faceId: string, point: { x: number; y: number }): { x: number; y: number } | null => {
    const polygon = solidPolygons(item).find((entry) => entry.id === faceId)
    if (!polygon) return null
    const world = solidScreenToLocal(item, polygon, { x: point.x - item.x, y: point.y - item.y })
    if (!world) return null
    return faceWorldToLocal(polygon, world)
  }, [])

  const faceScreenPoint = useCallback(
    (item: SolidItem, faceId: string, local: { x: number; y: number }): { x: number; y: number } | null => {
      const projection = solidProjection(item)
      const polygon = projection.polygons.find((entry) => entry.id === faceId)
      if (!polygon) return null
      return projectPoint(faceLocalToWorld(polygon, local), projection.camera)
    },
    []
  )

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
      if (tool === 'pen' && !editing) {
        const itemNow = byId.get(id)
        if (itemNow?.locked) {
          event.stopPropagation()
          toast('Объект заблокирован', 'lock')
          return
        }
        if (itemNow?.kind === 'solid' && !readOnly) {
          const point = toWorld(event.clientX, event.clientY)
          const hit = faceAtLocal(itemNow, point)
          if (!hit) return
          const local = facePointOf(itemNow, hit.id, point)
          if (!local) return
          event.stopPropagation()
          strokePointsRef.current = [local]
          dragBaseRef.current = doc?.items ?? null
          setSelection(new Set([id]))
          setDrag({ kind: 'face', id, face: hit.id, points: strokePointsRef.current, straight: event.shiftKey, done: [] })
          return
        }
        if (!doc || readOnly) return
        event.stopPropagation()
        const point = toWorld(event.clientX, event.clientY)
        window.clearTimeout(inkClearRef.current)
        penPointsRef.current = [{ ...point, t: performance.now() }]
        penSmoothRef.current = [point]
        penStraightRef.current = false
        setDrag({ kind: 'pen', points: [point] })
        return
      }
      if (tool === 'text') {
        const itemNow = byId.get(id)
        if (itemNow?.kind !== 'solid' || !doc || readOnly) return
        if (itemNow.locked) {
          event.stopPropagation()
          toast('Объект заблокирован', 'lock')
          return
        }
        const point = toWorld(event.clientX, event.clientY)
        const hit = faceAtLocal(itemNow, point)
        const local = hit ? facePointOf(itemNow, hit.id, point) : null
        if (!hit || !local) return
        event.preventDefault()
        event.stopPropagation()
        setSelection(new Set([id]))
        const labels = itemNow.labels ?? []
        const near = labels.findIndex(
          (label) => label.face === hit.id && Math.hypot(label.point.x - local.x, label.point.y - local.y) < 40
        )
        setFaceLabel({
          itemId: id,
          face: hit.id,
          point: near >= 0 ? labels[near].point : local,
          replaces: near >= 0 ? near : null,
          value: near >= 0 ? labels[near].text : ''
        })
        return
      }
      if (tool !== 'select' && tool !== 'pen') return
      event.stopPropagation()
      const item = byId.get(id)
      if (item?.locked) {
        toast('Объект заблокирован', 'lock')
        return
      }
      if (item?.kind === 'solid' && !readOnly) {
        const point = toWorld(event.clientX, event.clientY)
        const hit = faceAtLocal(item, point)
        if (tool === 'pen') {
          if (!hit) return
          const local = facePointOf(item, hit.id, point)
          if (!local) return
          strokePointsRef.current = [local]
          dragBaseRef.current = doc?.items ?? null
          setSelection(new Set([id]))
          setDrag({ kind: 'face', id, face: hit.id, points: strokePointsRef.current, straight: event.shiftKey, done: [] })
          return
        }
        if (solidMode === 'through' && !event.altKey) {
          const local = hit ? facePointOf(item, hit.id, point) : null
          if (!hit || !local) {
            setThroughAnchor(null)
            setThroughHover(null)
            return
          }
          if (throughAnchor && throughAnchor.itemId === id) {
            if (doc) {
              const next = doc.items.map((entry) =>
                entry.id === id && entry.kind === 'solid'
                  ? ({
                      ...entry,
                      sketch: [
                        ...entry.sketch,
                        {
                          face: throughAnchor.face,
                          points: [],
                          color: strokeColor,
                          lineWidth: Math.max(1, strokeWidth),
                          through: [
                            { face: throughAnchor.face, point: throughAnchor.point },
                            { face: hit.id, point: local }
                          ]
                        }
                      ]
                    } as SolidItem)
                  : entry
              )
              if (dragBaseRef.current) commitAgainst(dragBaseRef.current, next)
              else commit(next)
              dragBaseRef.current = null
            }
            setThroughAnchor(null)
            setThroughHover(null)
            return
          }
          setThroughAnchor({ itemId: id, face: hit.id, point: local })
          setThroughHover(null)
          return
        }
        setSelection(new Set([id]))
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
                const box = entry.kind === 'solid' ? itemBounds(entry) : rotatedBox(itemBounds(entry), entry.rotation)
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
      const groupId = item?.groupId
      if (groupId && !event.shiftKey && doc) {
        for (const entry of doc.items) {
          if (entry.groupId === groupId && !entry.locked) next.add(entry.id)
        }
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
          const box = item.kind === 'solid' ? itemBounds(item) : rotatedBox(itemBounds(item), item.rotation)
          near.push({ id: item.id, x: box.x, y: box.y, width: box.width, height: box.height })
        }
        snapTargetsRef.current = near
      } else {
        snapTargetsRef.current = []
      }
      setDrag({ kind: 'move', startX: point.x, startY: point.y, ids, origins, moved: false })
    },
    [selection, toWorld, byId, readOnly, tool, editing, doc, toast, solidMode, faceAtLocal, facePointOf, paintSolidFace, strokeColor, throughAnchor, commit, remember, strokeWidth]
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (drag.kind === 'idle') {
        if (throughAnchor) {
          const item = byId.get(throughAnchor.itemId)
          const point = toWorld(event.clientX, event.clientY)
          if (item?.kind !== 'solid') return
          const hit = faceAtLocal(item, point)
          const local = hit ? facePointOf(item, hit.id, point) : null
          scheduleThroughRender(hit && local ? { itemId: item.id, face: hit.id, point: local } : null)
        }
        return
      }
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
      if (drag.kind === 'pen') {
        const native = event.nativeEvent as PointerEvent
        const coalesced = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : []
        const samples = coalesced.length ? coalesced : [native]
        const collected: Array<{ x: number; y: number; t: number }> = []
        for (const sample of samples) {
          const world = toWorld(sample.clientX, sample.clientY)
          const last = penPointsRef.current[penPointsRef.current.length - 1]
          if (last && Math.hypot(world.x - last.x, world.y - last.y) < 0.4) continue
          collected.push({ ...world, t: sample.timeStamp || performance.now() })
        }
        if (!collected.length) return
        penPointsRef.current = [...penPointsRef.current, ...collected]
        const marker = penMode === 'highlighter'
        const base = marker ? 14 : Math.max(1, strokeWidth)
        const raw = penPointsRef.current
        const start = raw[0]
        const current = raw[raw.length - 1]
        penStraightRef.current = event.shiftKey
        const geometry = event.shiftKey
          ? { points: straightStroke(start, current) }
          : buildStroke(raw, { width: base, marker })
        penSmoothRef.current = geometry.points
        setDrag({ kind: 'pen', points: geometry.points })
        pushPreview({
          t: 'preview',
          kind: 'stroke',
          points: geometry.points,
          color: strokeColor,
          width: marker ? 14 : Math.max(1, strokeWidth),
          opacity: marker ? 0.35 : 1
        })
        return
      }
      if (drag.kind === 'resize' && doc) {
        const item = byId.get(drag.id)
        if (!item) return
        const dx = point.x - drag.startX
        const dy = point.y - drag.startY
        const rad = (item.rotation * Math.PI) / 180
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const ldx = cos * dx + sin * dy
        const ldy = -sin * dx + cos * dy
        const horizontal = drag.handle.includes('e') ? 1 : drag.handle.includes('w') ? -1 : 0
        const vertical = drag.handle.includes('s') ? 1 : drag.handle.includes('n') ? -1 : 0
        let width = drag.origin.width + ldx * horizontal
        let height = drag.origin.height + ldy * vertical
        const keepRatio =
          event.shiftKey ||
          item.kind === 'image' ||
          item.kind === 'frame' ||
          item.kind === 'path'
        if (keepRatio && horizontal && vertical) {
          const ratio = drag.origin.width / Math.max(1, drag.origin.height)
          if (Math.abs(ldx) > Math.abs(ldy)) height = width / ratio
          else width = height * ratio
        }
        width = Math.max(RESIZE_MIN, width)
        height = Math.max(RESIZE_MIN, height)
        const lx = horizontal < 0 ? drag.origin.width - width : 0
        const ly = vertical < 0 ? drag.origin.height - height : 0
        const dcx = lx + width / 2 - drag.origin.width / 2
        const dcy = ly + height / 2 - drag.origin.height / 2
        const centerX = drag.origin.x + drag.origin.width / 2 + cos * dcx - sin * dcy
        const centerY = drag.origin.y + drag.origin.height / 2 + sin * dcx + cos * dcy
        const x = centerX - width / 2
        const y = centerY - height / 2
        setDoc({
          ...doc,
          items: doc.items.map((entry) => (entry.id === drag.id ? resizedItem(entry, drag.origin, { x, y, width, height }) : entry))
        })
        pushPreview({
          t: 'preview',
          kind: 'move',
          items: [{ id: drag.id, x, y, w: width, h: height }]
        })
        liveRef.current += 1
        if (!drag.moved) setDrag({ ...drag, moved: true })
        return
      }
      if (drag.kind === 'rubber') {
        overlayPointRef.current = point
        scheduleOverlayRender()
        return
      }
      if (drag.kind === 'rotate' && doc) {
        const pitch = clamp(drag.pitch + (point.y - drag.startY) * 0.5, -80, 80)
        const yaw = (drag.yaw + (point.x - drag.startX) * 0.5) % 360
        const item = byId.get(drag.id)
        if (item?.kind !== 'solid') return
        const box = solidBounds(item.solid, item.edge, pitch, yaw)
        const items = doc.items.slice()
        const index = items.findIndex((entry) => entry.id === drag.id)
        if (index < 0) return
        const candidate = {
          ...items[index],
          pitch,
          yaw,
          w: Math.max(1, Math.round(box.width)),
          h: Math.max(1, Math.round(box.height))
        } as SolidItem
        items[index] = candidate
        setDoc({ ...doc, items })
        pushPreview({ t: 'preview', kind: 'solid', id: drag.id, pitch, yaw })
        return
      }
      if (drag.kind === 'face' && doc) {
        const item = byId.get(drag.id)
        if (item?.kind !== 'solid') return
        const hit = faceAtLocal(item, point)
        if (hit && hit.id !== drag.face) {
          const local = facePointOf(item, hit.id, point)
          if (!local) return
          const seam = facePointOf(item, drag.face, point)
          const closed = strokePointsRef.current.slice()
          if (seam) {
            const last = closed[closed.length - 1]
            if (!last || Math.hypot(seam.x - last.x, seam.y - last.y) > 0.5) closed.push(seam)
          }
          const done = [...drag.done, { face: drag.face, points: closed }]
          strokePointsRef.current = [local]
          setDrag({ ...drag, face: hit.id, points: strokePointsRef.current, done })
          return
        }
        if (!hit) return
        const local = facePointOf(item, drag.face, point)
        if (!local) return
        const last = strokePointsRef.current[strokePointsRef.current.length - 1]
        if (drag.straight || event.shiftKey) {
          const anchor = strokePointsRef.current[0] ?? last
          if (!anchor) {
            strokePointsRef.current = [local]
            scheduleStrokeRender()
            return
          }
          if (Math.hypot(local.x - anchor.x, local.y - anchor.y) < 1) return
          strokePointsRef.current = [anchor, local]
          scheduleStrokeRender()
          return
        }
        if (last && Math.hypot(local.x - last.x, local.y - last.y) < 0.5) return
        strokePointsRef.current.push(local)
        scheduleStrokeRender()
        return
      }
      if (drag.kind === 'create') {
        overlayPointRef.current = point
        scheduleOverlayRender()
        const rawX = point.x - drag.startX
        const rawY = point.y - drag.startY
        const dragged = Math.hypot(rawX, rawY) > 8 / viewRef.current.zoom
        const stroke = drag.tool === 'line' || drag.tool === 'arrow'
        const width = dragged ? Math.abs(rawX) : stroke ? 1 : 220
        const height = dragged ? Math.abs(rawY) : stroke ? 1 : 220
        const left = dragged ? Math.min(drag.startX, point.x) : drag.startX - (stroke ? 0 : width / 2)
        const top = dragged ? Math.min(drag.startY, point.y) : drag.startY - (stroke ? 0 : height / 2)
        pushPreview({
          t: 'preview',
          kind: 'shape',
          shape: drag.shape,
          x: left,
          y: top,
          w: Math.max(1, width),
          h: Math.max(1, height),
          color: strokeColor,
          width: Math.max(1, strokeWidth),
          points: stroke
            ? [
                { x: drag.startX - left, y: drag.startY - top },
                { x: point.x - left, y: point.y - top }
              ]
            : undefined
        })
        return
      }
      if (drag.kind === 'turn' && doc) {
        const angle = (Math.atan2(point.y - drag.centerY, point.x - drag.centerX) * 180) / Math.PI
        let rotation = drag.startRotation + (angle - drag.startAngle)
        if (event.shiftKey) rotation = Math.round(rotation / 15) * 15
        rotation = Math.round(rotation)
        const node = itemNodesRef.current.get(drag.id)
        if (node) node.style.transform = `rotate(${rotation}deg)`
        if (!drag.moved) setDrag({ ...drag, moved: true })
        rotateRef.current = { id: drag.id, rotation }
        return
      }
      if (drag.kind === 'link') {
        overlayPointRef.current = point
        if (drag.point.x !== point.x || drag.point.y !== point.y) setDrag({ ...drag, point })
        scheduleOverlayRender()
        return
      }
      if (drag.kind === 'erase') {
        const screen = toScreen(event.clientX, event.clientY)
        setEraserCursor({ x: screen.x, y: screen.y, size: eraseSize * 2 })
        const next = eraseAt(point, drag.removed)
        if (next.size !== drag.removed.size) setDrag({ ...drag, removed: next })
        return
      }
      if (tool === 'erase') setEraserCursor(null)
      if (drag.kind !== 'move' || !doc) return
      if (!drag.moved) solidMoveRef.current = { x: 0, y: 0 }
      let dx = point.x - drag.startX
      let dy = point.y - drag.startY
      if (snapEnabled && drag.origins.size) {
        const moving = unionBox(
          selectedItems
            .filter((item) => drag.origins.has(item.id))
            .map((item) => (item.kind === 'solid' ? itemBounds(item) : rotatedBox(itemBounds(item), item.rotation)))
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
      const movingSolids: SolidItem[] = []
      for (const id of drag.origins.keys()) {
        const item = byId.get(id)
        if (item?.kind === 'solid') movingSolids.push(item)
      }
      if (movingSolids.length) {
        const stationary = doc.items.filter((item) => item.kind === 'solid' && !drag.origins.has(item.id))
        const tries = (ax: number, ay: number): boolean => {
          for (const solid of movingSolids) {
            const origin = drag.origins.get(solid.id)
            if (!origin) continue
            const candidate = { ...solid, x: Math.round(origin.x + ax), y: Math.round(origin.y + ay) } as SolidItem
            if (solidsCollide(candidate, stationary)) return false
          }
          return true
        }
        if (!tries(dx, dy)) {
          if (tries(dx, 0)) dy = 0
          else if (tries(0, dy)) dx = 0
          else {
            dx = solidMoveRef.current.x
            dy = solidMoveRef.current.y
          }
        }
      }
      solidMoveRef.current = { x: dx, y: dy }
      moveDeltaRef.current = { x: dx, y: dy }
      const moved: Array<{ id: string; x: number; y: number }> = []
      for (const [id, origin] of drag.origins) {
        const x = origin.x + dx
        const y = origin.y + dy
        livePosRef.current.set(id, { x, y })
        moved.push({ id, x, y })
      }
      if (!moveFrameRef.current) moveFrameRef.current = requestAnimationFrame(flushMovePositions)
      pushPreview({ t: 'preview', kind: 'move', items: moved })
      liveRef.current += 1
      if (!drag.moved) setDrag({ ...drag, moved: true })
    },
    [drag, toWorld, toScreen, applyView, doc, eraseAt, snapEnabled, snapGrid, gridSize, selectedItems, showGuides, pushPreview, byId, faceAtLocal, facePointOf, scheduleThroughRender, throughAnchor, solidsCollide, flushMovePositions]
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
      if (strokeFrameRef.current) {
        cancelAnimationFrame(strokeFrameRef.current)
        strokeFrameRef.current = 0
      }
      if (overlayFrameRef.current) {
        cancelAnimationFrame(overlayFrameRef.current)
        overlayFrameRef.current = 0
      }
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current)
        overlayTimerRef.current = null
      }
      if (drag.kind === 'create' && doc) {
        const created = createFromDrag(drag)
        setDrag({ kind: 'idle' })
        clearPreview()
        if (created) {
          commit([...doc.items, created])
          setSelection(new Set([created.id]))
          if (created.kind === 'connector' && !created.startItemId) setLinkFrom(created.id)
          if (created.kind === 'shape') {
            setEditing({ id: created.id, value: created.plain || '' })
            freshEditingRef.current = created.id
          }
        }
        return
      }
      if (drag.kind === 'rotate' && doc) {
        const base = dragBaseRef.current
        dragBaseRef.current = null
        clearPreview()
        if (base) commitAgainst(base, doc.items)
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'turn' && doc) {
        const base = dragBaseRef.current
        dragBaseRef.current = null
        const live = rotateRef.current
        rotateRef.current = null
        if (base && live) {
          const next = base.map((item) =>
            item.id === live.id ? ({ ...item, rotation: live.rotation } as BoardItem) : item
          )
          commitAgainst(base, next)
        }
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'face' && doc) {
        const item = byId.get(drag.id)
        const segments = [...drag.done, { face: drag.face, points: strokePointsRef.current }].filter(
          (segment) => segment.points.length >= 2
        )
        if (item?.kind === 'solid' && segments.length) {
          const base = dragBaseRef.current
          dragBaseRef.current = null
          const next = (base ?? doc.items).map((entry) =>
            entry.id === drag.id && entry.kind === 'solid'
              ? ({
                  ...entry,
                  sketch: [
                    ...entry.sketch,
                    ...segments.map((segment) => ({
                      face: segment.face,
                      points: segment.points,
                      color: strokeColor,
                      lineWidth: Math.max(1, strokeWidth)
                    }))
                  ]
                } as SolidItem)
              : entry
          )
          if (base) commitAgainst(base, next)
          else commit(next)
        }
        dragBaseRef.current = null
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'pen' && doc) {
        const raw = penPointsRef.current.slice()
        const finish = toWorld(event.clientX, event.clientY)
        const lastRaw = raw[raw.length - 1]
        if (lastRaw && Math.hypot(finish.x - lastRaw.x, finish.y - lastRaw.y) >= 0.4)
          raw.push({ ...finish, t: event.timeStamp || performance.now() })
        penPointsRef.current = []
        penSmoothRef.current = []
        const box = inkGeometry(raw, penStraightRef.current, uid('path_'))
        if (box) {
          const stroke: BoardItem = {
            id: box.id,
            kind: 'path',
            x: box.x,
            y: box.y,
            w: box.width,
            h: box.height,
            rotation: 0,
            z: doc.items.length,
            points: box.local,
            color: box.color,
            lineWidth: box.base,
            opacity: box.opacity < 1 ? box.opacity : undefined,
            closed: false
          }
          setInkGhost(box)
          if (live.connected) {
            dropPendingPreview()
            const pad = box.base / 2 + 1
            live.sendPreview({
              t: 'preview',
              kind: 'stroke',
              points: box.local.map((point) => ({ x: box.x + pad + point.x, y: box.y + pad + point.y })),
              color: box.color,
              width: box.base,
              opacity: box.opacity
            })
            window.clearTimeout(inkClearRef.current)
            inkClearRef.current = window.setTimeout(() => clearPreview(), 600)
          }
          commit([...doc.items, stroke])
          setSelection(new Set([stroke.id]))
        } else if (live.connected) {
          clearPreview()
        }
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'link') {
        const target = itemAt(drag.point)
        if (doc && target && target !== drag.fromId) {
          addConnector(drag.fromId, target)
          setLinkFrom(null)
        }
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'erase') {
        const base = eraseBaseRef.current
        eraseBaseRef.current = null
        const segments = eraseSegmentsRef.current
        eraseSegmentsRef.current = new Map()
        if (doc && base && (drag.removed.size || segments.size)) {
          commitAgainst(base, doc.items)
        }
        setDrag({ kind: 'idle' })
        setEraserCursor(null)
        return
      }
      if (drag.kind === 'resize' && doc) {
        if (drag.moved) {
          if (dragBaseRef.current) commitAgainst(dragBaseRef.current, doc.items)
          dragBaseRef.current = null
        } else {
          dragBaseRef.current = null
        }
        setDrag({ kind: 'idle' })
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
            const box = item.kind === 'solid' ? itemBounds(item) : rotatedBox(itemBounds(item), item.rotation)
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
      const base = dragBaseRef.current
      if (base) commitAgainst(base, next)
      else persist(next)
      clearPreview()
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
        const hit = itemAt(toWorld(event.clientX, event.clientY))
        if (hit && !selection.has(hit) && !readOnly) setSelection(new Set([hit]))
        setMenu({ x: Math.max(8, event.clientX - left), y: Math.max(8, event.clientY - top), onItem: hit ?? '' })
      }
    }
    setDrag({ kind: 'idle' })
    },
    [drag, doc, persist, remember, commit, commitAgainst, strokeColor, strokeWidth, applyView, startInertia, size, itemAt, toWorld, createFromDrag, clearPreview, byId, addConnector, penMode, selection, readOnly]
  )

  const deleteItems = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly) return
      const remove = new Set(ids.filter((id) => !byId.get(id)?.locked))
      if (!remove.size) {
        toast('Все выбранные объекты заблокированы', 'lock')
        return
      }
      commit(
        withoutDanglingConnectors(
          doc.items.filter((item) => !remove.has(item.id)),
          remove
        ).map((item) =>
          item.parentId && remove.has(item.parentId) ? ({ ...item, parentId: undefined } as BoardItem) : item
        )
      )
      setSelection(new Set())
    },
    [doc, commit, readOnly, byId, toast]
  )

  const duplicateItems = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly) return
      const source = doc.items.filter((item) => ids.includes(item.id))
      const cloneIds = source.map((item, index) => uid(`cp_${index}`))
      const groups = cloneGroupMap(source)
      const clones = source.map((item, index) => {
        const clone = {
          ...item,
          id: cloneIds[index],
          x: item.x + 28,
          y: item.y + 28,
          z: doc.items.length + index,
          groupId: groups.get(item.groupId ?? ''),
          parentId: cloneParent(item.parentId, source, cloneIds)
        }
        if (clone.kind === 'solid') {
          const step = Math.max(40, Math.round(clone.w / 2))
          let nx = item.x + 28
          for (let attempt = 0; attempt < 40; attempt += 1) {
            const candidate = { ...clone, x: nx } as SolidItem
            if (!solidsCollide(candidate, doc.items)) break
            nx += step
          }
          clone.x = nx
        }
        return clone
      }) as BoardItem[]
      commit([...doc.items, ...clones])
      setSelection(new Set(clones.map((item) => item.id)))
      toast('Копия создана', 'copy')
    },
    [doc, commit, readOnly, toast, solidsCollide]
  )

  const copyItems = useCallback(
    (ids: string[]) => {
      if (!doc || readOnly) return
      const source = doc.items.filter((item) => ids.includes(item.id))
      if (!source.length) return
      writeObjectClipboard(props.docId, source)
      const html = encodeLiroClipboard({ version: 1, docId: props.docId, items: source })
      void api.clipboard
        .writeHtml(html, source.map((item) => ('plain' in item ? item.plain : '')).filter(Boolean).join('\n'))
        .catch(() => undefined)
      toast('Объекты скопированы', 'copy')
    },
    [doc, readOnly, props.docId, toast]
  )

  const pasteShift = useCallback(
    (items: BoardItem[], sameBoard: boolean): { dx: number; dy: number } => {
      if (sameBoard || !items.length) return { dx: 28, dy: 28 }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const item of items) {
        const box = itemBounds(item)
        if (box.x < minX) minX = box.x
        if (box.y < minY) minY = box.y
        if (box.x + box.width > maxX) maxX = box.x + box.width
        if (box.y + box.height > maxY) maxY = box.y + box.height
      }
      const current = viewRef.current
      return {
        dx: Math.round(current.x - (minX + maxX) / 2),
        dy: Math.round(current.y - (minY + maxY) / 2)
      }
    },
    []
  )

  const pasteObjects = useCallback(async () => {
    if (!doc || readOnly) return
    const stored = readObjectClipboard()
    const source = stored?.items ?? []
    if (!source.length) {
      toast('В буфере нет объектов Liro', 'error')
      return
    }
    const shift = pasteShift(source, !stored || stored.docId === props.docId)
    const cloneIds = source.map((item, index) => uid(`cp_${index}`))
    const groups = cloneGroupMap(source)
    const clones = source.map((item, index) => {
      const clone = {
        ...item,
        id: cloneIds[index],
        x: item.x + shift.dx,
        y: item.y + shift.dy,
        z: doc.items.length + index,
        groupId: groups.get(item.groupId ?? ''),
        parentId: cloneParent(item.parentId, source, cloneIds)
      }
      if (clone.kind === 'solid') {
        const step = Math.max(40, Math.round(clone.w / 2))
        let nx = clone.x
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const candidate = { ...clone, x: nx } as SolidItem
          if (!solidsCollide(candidate, doc.items)) break
          nx += step
        }
        clone.x = nx
      }
      return clone
    }) as BoardItem[]
    try {
      await flushPending()
      await api.board.pasteItems({ docId: props.docId, sourceDocId: stored?.docId ?? props.docId, items: clones })
      const loaded = await api.board.open(props.docId)
      remember(doc.items)
      setDoc(loaded)
      setSelection(new Set(clones.map((item) => item.id)))
      toast('Объекты вставлены', 'paste')
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }, [doc, readOnly, props.docId, remember, toast, fail, pasteShift, solidsCollide, flushPending])

  const groupedSelection = useMemo(() => {
    const groups = new Set(selectedItems.map((item) => item.groupId).filter((value): value is string => !!value))
    return groups.size > 0
  }, [selectedItems])

  const groupSelection = useCallback(() => {
    if (!doc || readOnly || selection.size < 2) return
    const groupId = uid('grp_')
    const target = new Set(selection)
    commit(doc.items.map((item) => (target.has(item.id) ? ({ ...item, groupId } as BoardItem) : item)))
    toast('Объекты объединены в группу', 'layer')
  }, [doc, commit, readOnly, selection, toast])

  const ungroupSelection = useCallback(() => {
    if (!doc || readOnly) return
    const groups = new Set(selectedItems.map((item) => item.groupId).filter((value): value is string => !!value))
    if (!groups.size) return
    commit(
      doc.items.map((item) =>
        item.groupId && groups.has(item.groupId) ? ({ ...item, groupId: undefined } as BoardItem) : item
      )
    )
    toast('Группа разделена', 'layer')
  }, [doc, commit, readOnly, selectedItems, toast])

  const bringSelection = useCallback(
    (front: boolean) => {
      if (!doc || readOnly || !selection.size) return
      const target = new Set(selection)
      const ordered = [...doc.items].sort((a, b) => a.z - b.z)
      const rest = ordered.filter((item) => !target.has(item.id))
      const moved = ordered.filter((item) => target.has(item.id))
      commit([...rest, ...moved].map((item, index) => ({ ...item, z: index } as BoardItem)))
      toast(front ? 'Объекты на самом верху' : 'Объекты на самом низу', 'layer')
    },
    [doc, commit, readOnly, selection, toast]
  )

  const patchItem = useCallback(
    (id: string, patch: Partial<BoardItem>) => {
      if (!doc || readOnly) return
      const base = itemsRef.current
      const next = base.map((item) => (item.id === id ? withPatch(item, patch) : item))
      if (changed(base, next)) commit(next)
    },
    [doc, commit, readOnly]
  )

  const patchItems = useCallback(
    (ids: string[], patch: Partial<BoardItem>) => {
      if (!doc || readOnly || !ids.length) return
      const target = new Set(ids)
      const base = itemsRef.current
      const next = base.map((item) => (target.has(item.id) ? withPatch(item, patch) : item))
      if (changed(base, next)) commit(next)
    },
    [doc, commit, readOnly]
  )

  const livePatchTimerRef = useRef<number | null>(null)
  const livePatchBaseRef = useRef<BoardItem[] | null>(null)

  const applyLivePatch = useCallback(
    (next: BoardItem[], base: BoardItem[]): void => {
      if (!livePatchBaseRef.current) livePatchBaseRef.current = base
      itemsRef.current = next
      if (livePatchTimerRef.current !== null) window.clearTimeout(livePatchTimerRef.current)
      livePatchTimerRef.current = window.setTimeout(() => {
        livePatchTimerRef.current = null
        const start = livePatchBaseRef.current
        livePatchBaseRef.current = null
        if (start) commitAgainst(start, itemsRef.current)
        else commit(itemsRef.current)
      }, 500)
    },
    [commit, commitAgainst]
  )

  const patchItemsLive = useCallback(
    (ids: string[], patch: Partial<BoardItem>) => {
      if (!doc || readOnly || !ids.length) return
      const target = new Set(ids)
      const base = itemsRef.current
      const next = base.map((item) => (target.has(item.id) ? withPatch(item, patch) : item))
      if (!changed(base, next)) return
      setDoc({ ...doc, items: next, stats: { ...doc.stats, items: next.length } })
      applyLivePatch(next, base)
    },
    [doc, readOnly, applyLivePatch]
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
        applyLivePatch(next, doc.items)
        return
      }
      commit(next)
    },
    [doc, readOnly, solidSelection, commit, applyLivePatch]
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
      toast('Картинки обновлены', 'image')
      if (count < targets.length) toast('Часть заглушек осталась без файла', 'image')
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
          const value = await ask('Ссылка на картинку', item.asset?.sourceUrl ?? 'https://', 'https://')
          if (!value) return
          const url = value.trim()
          const fetched = await api.image.fetch(url)
          await applyImageData(id, fetched.dataUrl)
          toast('Картинка заменена', 'image')
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
    [doc, readOnly, byId, patchItem, applyImageData, toast, ask]
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
        applyLivePatch(next, doc.items)
        return
      }
      commit(next)
    },
    [doc, readOnly, graphSelection, commit, applyLivePatch]
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
    toast('Плоскость вписана в окно', 'zoom')
  }, [doc, readOnly, graphPanel, size, patchGraph, toast])

  

const openLinkPreview = useCallback(
    async (preset?: string): Promise<void> => {
      const asked = preset ?? (await ask('Ссылка или путь к файлу для предпросмотра', linkPreview, 'https://'))
      if (!asked) return
      const src = asked.trim()
      if (!src) return
      setLinkPreview(src)
      const web = /^https?:\/\//i.test(src)
      const title = web ? /^https?:\/\/([^/?#]+)/i.exec(src)?.[1] ?? src : src.split(/[\\/]/).pop() ?? src
      await api.preview.open({ kind: web ? 'web' : 'file', title, src })
    },
    [ask, linkPreview]
  )

  const openItemPreview = useCallback(
    (item: BoardItem): void => {
      const raw = (item.raw ?? {}) as { url?: string; link?: string; source?: string; embedUrl?: string; title?: string }
      const asset = (item as { asset?: { file?: string; src?: string; sourceUrl?: string } }).asset
      const title = (item as { title?: string }).title || raw.title || (item.kind === 'image' ? 'Картинка' : 'Объект')
      const file = asset?.file ? assetUrl(asset.file) : ''
      if (file) {
        void api.preview.open({ kind: 'file', title, src: file })
        return
      }
      const sourceUrl = asset?.sourceUrl ?? asset?.src ?? ''
      const url = sourceUrl || raw.url || raw.link || raw.source || raw.embedUrl || ''
      if (url) {
        void api.preview.open({ kind: 'web', title, src: url })
        return
      }
      toast('У объекта нет ни файла, ни ссылки', 'link')
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
      const text = item.plain || item.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
      setEditing({ id, value: text })
    },
    [byId, readOnly, replaceImage]
  )

  const commitEditing = useCallback(() => {
    if (!editing || !doc) return
    const value = editing.value.replace(/\s+$/g, '')
    setEditing(null)
    clearPreview()
    const item = byId.get(editing.id)
    if (!item) return
    if (!value && !item.sourceType && (item.kind === 'text' || item.kind === 'sticky')) {
      setSelection(new Set())
      commit(doc.items.filter((entry) => entry.id !== editing.id))
      return
    }
    if ((item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape') && (item.plain ?? '') === value) return
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

  const editingBox = editingItem ? itemBounds(editingItem) : null
  const faceLabelItem = faceLabel ? byId.get(faceLabel.itemId) : undefined
  const faceLabelSpot =
    faceLabel && faceLabelItem?.kind === 'solid' ? faceScreenPoint(faceLabelItem, faceLabel.face, faceLabel.point) : null
  const faceLabelBox =
    faceLabelItem && faceLabelSpot ? { x: faceLabelItem.x + faceLabelSpot.x, y: faceLabelItem.y + faceLabelSpot.y } : null
  const commitFaceLabel = useCallback(() => {
    if (!faceLabel || !doc) return
    const value = faceLabel.value.replace(/\s+$/g, '')
    setFaceLabel(null)
    if (!value && faceLabel.replaces === null) return
    commit(
      doc.items.map((entry) => {
        if (entry.id !== faceLabel.itemId || entry.kind !== 'solid') return entry
        const labels = entry.labels ?? []
        if (faceLabel.replaces === null) {
          return { ...entry, labels: [...labels, { face: faceLabel.face, point: faceLabel.point, text: value, size: Math.max(18, textSize) }] } as SolidItem
        }
        if (!value) return { ...entry, labels: labels.filter((_, index) => index !== faceLabel.replaces) } as SolidItem
        return {
          ...entry,
          labels: labels.map((label, index) => (index === faceLabel.replaces ? { ...label, text: value } : label))
        } as SolidItem
      })
    )
  }, [faceLabel, doc, commit, textSize])
  const faceLabelRef = useRef<HTMLTextAreaElement | null>(null)
  const faceLabelActive = !!faceLabel
  useEffect(() => {
    if (!faceLabelActive) return
    const node = faceLabelRef.current
    if (!node) return
    node.focus()
    if (node.value) node.setSelectionRange(0, node.value.length)
  }, [faceLabelActive])
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const lastEditingIdRef = useRef<string | null>(null)
  const freshEditingRef = useRef<string | null>(null)

  useEffect(() => {
    const node = editorRef.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${Math.max(36, node.scrollHeight)}px`
    if (lastEditingIdRef.current === editing?.id) return
    lastEditingIdRef.current = editing?.id ?? null
    node.focus()
    if (freshEditingRef.current === editing?.id) {
      freshEditingRef.current = null
      node.select()
    }
  }, [editing?.value, editing?.id])
  const textSelection = selectedItems.filter(
    (item) => item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape'
  )
  const editTargetId = textSelection.length === 1 ? textSelection[0].id : null
  const textPanelBox = (() => {
    const boxes = textSelection.map((item) => itemBounds(item))
    if (!boxes.length) return null
    const left = Math.min(...boxes.map((box) => box.x))
    const top = Math.min(...boxes.map((box) => box.y))
    const right = Math.max(...boxes.map((box) => box.x + box.width))
    const bottom = Math.max(...boxes.map((box) => box.y + box.height))
    return { x: left, y: top, width: right - left, height: bottom - top }
  })()
  const textPanelSpot = (() => {
    if (!textPanelBox) return null
    const view = viewRef.current
    const zoom = Math.max(0.05, view.zoom)
    const half = size.width / 2
    const center = size.height / 2
    const screenMiddle = (textPanelBox.x + textPanelBox.width / 2 - view.x) * zoom + half
    const screenTop = (textPanelBox.y - view.y) * zoom + center
    const screenBottom = screenTop + textPanelBox.height * zoom
    const below = screenBottom + 52 < size.height - 72
    const targetScreenY = below ? screenBottom + 8 : screenTop - 52
    const width = Math.min(392, size.width - 24)
    const screenX = clamp(screenMiddle - width / 2, 12, Math.max(12, size.width - width - 12))
    const screenY = clamp(targetScreenY, 12, Math.max(12, size.height - 56))
    return {
      x: (screenX - half) / zoom + view.x,
      y: (screenY - center) / zoom + view.y
    }
  })()

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
          if (item.kind === 'shape') return { ...item, textColor: color }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const pasteIntoBoard = useCallback(
    async (html?: string, text?: string): Promise<void> => {
      if (readOnly) return
      await flushPending()
      const liro = html ? decodeLiroClipboard(html) : null
      if (liro) {
        const shift = pasteShift(liro.items, liro.docId === props.docId)
        const cloneIds = liro.items.map((item, index) => uid(`cp_${index}`))
        const groups = cloneGroupMap(liro.items)
        const clones = liro.items.map((item, index) => ({
          ...item,
          id: cloneIds[index],
          x: item.x + shift.dx,
          y: item.y + shift.dy,
          z: (doc?.items.length ?? 0) + index,
          groupId: groups.get(item.groupId ?? ''),
          parentId: cloneParent(item.parentId, liro.items, cloneIds)
        })) as BoardItem[]
        try {
          await api.board.pasteItems({ docId: props.docId, sourceDocId: liro.docId, items: clones })
          const loaded = await api.board.open(props.docId)
          if (doc && live.connected) commitAgainst(doc.items, loaded.items)
          else if (doc) remember(doc.items)
          setDoc(loaded)
          setSelection(new Set(clones.map((item) => item.id)))
          toast('Объекты вставлены', 'paste')
        } catch (error) {
          fail(error instanceof Error ? error.message : String(error))
        }
        return
      }
      const payload = html ? parseClipboardHtml(html) : text ? parseClipboardText(text) : null
      if (!payload || !payload.items.length) {
        toast('В буфере обмена нет объектов для вставки', 'error')
        return
      }
      const bounds = pastePayloadBounds(payload.items)
      const view = viewRef.current
      shiftPastePayload(
        payload.items,
        Math.round(view.x - (bounds.x + bounds.width / 2)),
        Math.round(view.y - (bounds.y + bounds.height / 2))
      )
      const placed = pastePayloadBounds(payload.items)
      const pastedIds = payload.items
        .map((item) => (item as { id?: string }).id)
        .filter((id): id is string => typeof id === 'string' && id !== '')
      try {
        const appended = await api.board.appendItems({ docId: props.docId, items: payload.items, images: payload.images })
        const renamed = appended.renamed ?? {}
        const loaded = await api.board.open(props.docId)
        if (doc && live.connected) {
          shareImageAssets(payload.images)
          commitAgainst(doc.items, loaded.items)
        } else if (doc) remember(doc.items)
        setDoc(loaded)
        setSelection(new Set(pastedIds.map((id) => renamed[id] ?? id)))
        if (placed.width > size.width / view.zoom || placed.height > size.height / view.zoom) {
          const zoom = clamp(
            Math.min(size.width / Math.max(1, placed.width), size.height / Math.max(1, placed.height)) * 0.94,
            MIN_ZOOM,
            view.zoom
          )
          applyView({ x: view.x, y: view.y, zoom }, true)
        }
        toast(payload.label === 'Формат доски' ? 'Объекты доски вставлены' : 'Объекты вставлены', 'paste')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [
      props.docId,
      toast,
      fail,
      size,
      applyView,
      doc,
      remember,
      setSelection,
      readOnly,
      flushPending,
      live,
      commitAgainst,
      shareImageAssets
    ]
  )

  const insertImages = useCallback(
    async (entries: Array<{ dataUrl: string; name: string }>) => {
      if (!entries.length || readOnly) return
      await flushPending()
      const stamp = Date.now()
      const view = viewRef.current
      const sizes = await Promise.all(
        entries.map(async (entry): Promise<{ width: number; height: number }> => {
          const size = await imageSizeOf(entry.dataUrl)
          const rawWidth = size?.width ?? 420
          const rawHeight = size?.height ?? Math.round(rawWidth * 0.66)
          const scaled = rawWidth > 1200 ? 1200 / rawWidth : 1
          return { width: Math.max(1, Math.round(rawWidth * scaled)), height: Math.max(1, Math.round(rawHeight * scaled)) }
        })
      )
      const items = entries.map((entry, index) => {
        const width = sizes[index].width
        const height = sizes[index].height
        const left = Math.round(view.x - width / 2) + index * 28
        const top = Math.round(view.y - height / 2) + index * 28
        return {
          id: `img_clip_${stamp}_${index}`,
          type: 'image',
          x: left,
          y: top,
          width,
          height,
          position: { x: left + width / 2, y: top + height / 2, origin: 'center', relativeTo: 'canvas_center' },
          geometry: { width, height, rotation: 0 },
          style: {},
          data: { title: entry.name || 'Картинка из буфера' }
        }
      })
      try {
        await api.board.appendItems({
          docId: props.docId,
          items,
          images: entries.map((entry, index) => ({ itemId: items[index].id, dataUrl: entry.dataUrl }))
        })
        const loaded = await api.board.open(props.docId)
        if (doc && live.connected) {
          shareImageAssets(items.map((item, index) => ({ itemId: item.id, dataUrl: entries[index].dataUrl })))
          commitAgainst(doc.items, loaded.items)
        } else if (doc) remember(doc.items)
        setDoc(loaded)
        setSelection(new Set(items.map((item) => item.id)))
        toast('Картинки добавлены', 'paste')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [props.docId, toast, fail, doc, remember, setSelection, readOnly, flushPending, live, commitAgainst, shareImageAssets]
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
      if (isEditableTarget(event.target)) return
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
      else if (command === 'copy' && selection.size) copyItems([...selection])
      else if (command === 'paste') void pasteObjects()
      else if (command === 'delete' && selection.size) deleteItems([...selection])
      else if (command === 'select-all' && doc) {
        setSelection(new Set(doc.items.filter((item) => item.kind !== 'connector').map((item) => item.id)))
      }
    }
    window.addEventListener('liro:board-command', listener)
    return () => window.removeEventListener('liro:board-command', listener)
  }, [undo, redo, duplicateItems, deleteItems, copyItems, pasteObjects, selection, doc])

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
      if (event.type !== 'keydown') return
      if (present) {
        if (event.key === 'Escape') {
          event.preventDefault()
          stopPresent()
          return
        }
        if (event.key === 'ArrowRight' || event.key === 'PageDown') {
          event.preventDefault()
          stepFrame(1)
          return
        }
        if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
          event.preventDefault()
          stepFrame(-1)
          return
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && doc) {
        event.preventDefault()
        setSelection(new Set(doc.items.filter((item) => item.kind !== 'connector').map((item) => item.id)))
        return
      }
      if ((event.key === 'Enter' || event.key === 'F2') && !editing && selection.size === 1 && tool === 'select') {
        const only = [...selection][0]
        const target = byId.get(only)
        if (target && (target.kind === 'shape' || target.kind === 'text' || target.kind === 'sticky')) {
          event.preventDefault()
          startEditing(only)
          return
        }
      }
      const plain = !event.ctrlKey && !event.metaKey && !event.altKey
      if (plain && (event.key.toLowerCase() === 'v' || event.key.toLowerCase() === 'h' || event.key.toLowerCase() === 'e')) {
        const mode = event.key.toLowerCase()
        setTool(mode === 'v' ? 'select' : mode === 'h' ? 'pan' : 'erase')
        return
      }
      const toolKeys: Record<string, Tool> = { s: 'create', r: 'create', o: 'create', l: 'link', c: 'link', t: 'text', n: 'sticky', i: 'image', d: 'solid', b: 'table', p: 'pen' }
      if (plain && event.key.toLowerCase() === 'g') {
        changeGrid({ gridMode: gridMode === 'none' ? 'dots' : 'none' })
        return
      }
      const mapped = plain ? toolKeys[event.key.toLowerCase()] : undefined
      if (mapped && !readOnly) {
        if (event.key.toLowerCase() === 'r') setCreateTool('rect')
        if (event.key.toLowerCase() === 'o') setCreateTool('ellipse')
        setTool(mapped)
        return
      }
      if (plain && /^[1-9]$/.test(event.key)) {
        const slot = Number(event.key) - 1
        const rail = railTools(railOrder, railExtras).filter((item) => !readOnly || !item.editing)
        if (slot === 8 && rail.length <= 8) {
          setMoreOpen((value) => !value)
          return
        }
        const entry = rail[slot]
        if (entry) {
          setTool(entry.id)
          return
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        if (document.querySelector('.modal')) return
        if (cropEdit) {
          setCropEdit(null)
          return
        }
        if (menu) {
          setMenu(null)
          return
        }
        if (moreOpen) {
          setMoreOpen(false)
          return
        }
        if (present) {
          stopPresent()
          return
        }
        if (showExport) {
          setShowExport(false)
          return
        }
        if (boardSettingsOpen) {
          setBoardSettingsOpen(false)
          return
        }
        if (calculatorOpen) {
          setCalculatorOpen(false)
          return
        }
        if (detailsOpen) {
          setDetailsOpen(false)
          return
        }
        if (showInspector) {
          setShowInspector(false)
          return
        }
        if (throughAnchor) {
          setThroughAnchor(null)
          setThroughHover(null)
          return
        }
        setSelection(new Set())
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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selection.size) {
        event.preventDefault()
        copyItems([...selection])
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && readObjectClipboard()) {
        event.preventDefault()
        void pasteObjects()
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
      if (plain && event.key === 'f') {
        fitAll()
        return
      }
      if (plain && event.key === '0') {
        const center = viewRef.current
        animateTo({ ...center, zoom: 1 }, 200)
        return
      }
      if (plain && (event.key === '=' || event.key === '+')) zoomBy(1.2)
      if (plain && (event.key === '-' || event.key === '_')) zoomBy(1 / 1.2)
      if (plain && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        if (!selection.size || readOnly || !doc) return
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const next = doc.items.map((item) =>
          selection.has(item.id) && !item.locked ? ({ ...item, x: item.x + dx, y: item.y + dy } as BoardItem) : item
        )
        const now = Date.now()
        if (now - nudgeAtRef.current < 700) {
          nudgeAtRef.current = now
          persist(next)
        } else {
          nudgeAtRef.current = now
          commit(next)
        }
      }
    }
    window.addEventListener('keydown', listener)
    window.addEventListener('keyup', listener)
    return () => {
      window.removeEventListener('keydown', listener)
      window.removeEventListener('keyup', listener)
    }
  }, [doc, selection, zoomBy, fitAll, deleteItems, duplicateItems, copyItems, pasteObjects, commit, persist, undo, redo, readOnly, animateTo, pasteIntoBoard, fail, present, stopPresent, stepFrame, changeGrid, gridMode, railOrder, railExtras, menu, moreOpen, showExport, boardSettingsOpen, calculatorOpen, detailsOpen, showInspector, throughAnchor, editing, byId, startEditing, tool])

  const penBox = drag.kind === 'pen' ? inkGeometry(penPointsRef.current, penStraightRef.current, '') : null

  const partnerCalc = useMemo(() => {
    const value = live.preview
    if (!value || value.kind !== 'calc' || value.open === false) return null
    return { source: value.source, result: value.result }
  }, [live.preview])

  const partnerCalcOpen = live.preview?.kind === 'calc' && live.preview.open !== false

  const partnerCalcSeenRef = useRef(false)

  useEffect(() => {
    if (!partnerCalc) {
      partnerCalcSeenRef.current = false
      return
    }
    if (partnerCalcSeenRef.current) return
    if (!partnerCalc.source.trim()) return
    partnerCalcSeenRef.current = true
    setCalculatorOpen(true)
  }, [partnerCalc])

  const calcAnnouncedRef = useRef(false)

  useEffect(() => {
    if (calculatorOpen) {
      calcAnnouncedRef.current = true
      return
    }
    if (!calcAnnouncedRef.current) return
    calcAnnouncedRef.current = false
    if (live.connected) pushPreview({ t: 'preview', kind: 'calc', source: '', result: '', open: false })
  }, [calculatorOpen, live.connected, pushPreview])

  const remotePreview = useMemo(() => {
    const value = live.preview
    if (!value) return null
    if (value.kind === 'stroke') {
      if (value.points.length < 2) return null
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const point of value.points) {
        if (point.x < minX) minX = point.x
        if (point.y < minY) minY = point.y
        if (point.x > maxX) maxX = point.x
        if (point.y > maxY) maxY = point.y
      }
      const pad = value.width / 2 + 1
      minX -= pad
      minY -= pad
      maxX += pad
      maxY += pad
      return {
        kind: 'stroke' as const,
        x: minX,
        y: minY,
        w: Math.max(1, maxX - minX),
        h: Math.max(1, maxY - minY),
        points: value.points.map((point) => ({ x: point.x - minX, y: point.y - minY })),
        color: value.color,
        width: value.width,
        opacity: value.opacity
      }
    }
    if (value.kind === 'shape') {
      return {
        kind: 'shape' as const,
        x: value.x,
        y: value.y,
        w: Math.max(1, value.w),
        h: Math.max(1, value.h),
        shape: value.shape,
        color: value.color,
        width: value.width,
        points: value.points
      }
    }
    return null
  }, [live.preview])

  const createPreview = (() => {
    if (drag.kind !== 'create') return null
    const item = createFromDrag(drag)
    if (!item) return null
    if (item.kind === 'shape') {
      return { kind: 'shape' as const, x: item.x, y: item.y, w: item.w, h: item.h, shape: item.shape }
    }
    if (item.kind === 'connector') {
      return { kind: 'connector' as const, x: item.x, y: item.y, w: item.w, h: item.h, points: item.points }
    }
    return null
  })()

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

  const strokeBox = (() => {
    let world: Array<{ x: number; y: number }> = []
    if (drag.kind === 'face' && drag.points.length >= 1) {
      const item = byId.get(drag.id)
      if (item && item.kind === 'solid') {
        const segments = [...drag.done, { face: drag.face, points: drag.points }]
        for (const segment of segments) {
          for (const point of segment.points) {
            const screen = faceScreenPoint(item, segment.face, point)
            if (screen) world.push({ x: screen.x + item.x, y: screen.y + item.y })
          }
        }
      }
    }
    if (world.length < 2) return null
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of world) {
      if (point.x < minX) minX = point.x
      if (point.y < minY) minY = point.y
      if (point.x > maxX) maxX = point.x
      if (point.y > maxY) maxY = point.y
    }
    const pad = Math.ceil(strokeWidth) + 2
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    const local = world.map((point) => ({ x: point.x - minX, y: point.y - minY }))
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      path: curvePath(local)
    }
  })()

  const throughPreview = (() => {
    if (!throughAnchor) return null
    const item = byId.get(throughAnchor.itemId)
    if (item?.kind !== 'solid') return null
    const anchor = faceScreenPoint(item, throughAnchor.face, throughAnchor.point)
    if (!anchor) return null
    const anchorWorld = { x: anchor.x + item.x, y: anchor.y + item.y }
    const hover =
      throughHover && throughHover.itemId === item.id
        ? faceScreenPoint(item, throughHover.face, throughHover.point)
        : null
    const hoverWorld = hover ? { x: hover.x + item.x, y: hover.y + item.y } : null
    let minX = anchorWorld.x
    let minY = anchorWorld.y
    let maxX = anchorWorld.x
    let maxY = anchorWorld.y
    if (hoverWorld) {
      minX = Math.min(minX, hoverWorld.x)
      minY = Math.min(minY, hoverWorld.y)
      maxX = Math.max(maxX, hoverWorld.x)
      maxY = Math.max(maxY, hoverWorld.y)
    }
    const pad = 6
    minX -= pad
    minY -= pad
    maxX += pad
    maxY += pad
    return {
      left: minX,
      top: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
      dotX: anchorWorld.x - minX,
      dotY: anchorWorld.y - minY,
      line: hoverWorld
        ? {
            x1: anchorWorld.x - minX,
            y1: anchorWorld.y - minY,
            x2: hoverWorld.x - minX,
            y2: hoverWorld.y - minY
          }
        : null
    }
  })()

  const saveTitle = async (): Promise<void> => {
    if (!doc) return
    const next = titleDraft.trim()
    if (!next || next === doc.title) return
    setDoc({ ...doc, title: next })
    try {
      await api.board.rename(doc.id, next)
      setLibrary(await api.library.get())
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <div className={present ? 'boardview boardview--ready boardview--present' : ready ? 'boardview boardview--ready' : 'boardview'}>
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
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void saveTitle()
                    setRenaming(false)
                  }
                  if (event.key === 'Escape') {
                    setTitleDraft(doc.title)
                    setRenaming(false)
                  }
                }}
                onBlur={() => void saveTitle()}
              />
            ) : (
              <div className="bbar__title truncate" onDoubleClick={() => !readOnly && setRenaming(true)} title={doc.title}>
                {doc.title}
              </div>
            )}
          </div>
          <div className="bbar__sep" />
          <button
            type="button"
            className="seg"
            data-active={!readOnly}
            onClick={() => setReadOnlyLocal(false)}
            title="Редактирование"
          >
            <Pencil size={14} /> Правка
          </button>
          <button type="button" className="seg" data-active={readOnly} onClick={() => setReadOnlyLocal(true)} title="Только просмотр">
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
              title="Отменить (Ctrl+Z)"
            >
              <Undo2 size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={redo}
              disabled={readOnly || !historyState.redo}
              aria-label="Вернуть"
              title="Вернуть (Ctrl+Y)"
            >
              <Redo2 size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              onClick={() => toggleOverlay('calculator')}
              aria-label="Калькулятор"
              title="Калькулятор"
              data-active={calculatorOpen}
              data-partner={partnerCalcOpen || undefined}
            >
              <Calculator size={16} />
            </button>
            <button
              type="button"
              className="toolbtn"
              data-board-details=""
              data-items={doc.stats.items}
              onClick={() => toggleOverlay('details')}
              aria-label="Подробнее о доске"
              title="Подробнее о доске: состав, файлы, происхождение"
              data-active={detailsOpen}
            >
              <Info size={16} />
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
              onClick={() => toggleOverlay('settings')}
              aria-label="Настройки доски"
              title="Настройки доски: сетка и привязка"
              data-active={boardSettingsOpen}
            >
              <SlidersHorizontal size={16} />
            </button>
            {live.role === 'host' && !live.code ? (
              <button type="button" className="toolbtn" onClick={startHosting} aria-label="Пригласить" title="Пригласить к доске">
                <Users size={16} />
              </button>
            ) : null}
            {live.code || live.role === 'guest' ? (
              <LivePanel
                role={live.role}
                code={live.code}
                myName={settings?.userName ?? ''}
                partner={live.partner}
                ping={live.ping}
                connected={live.connected}
                canEdit={live.canEdit}
                preparing={live.preparing}
                watching={live.watching}
                following={live.following}
                onTogglePermission={live.togglePermission}
                onWatchPartner={() => {
                  if (live.following) live.stopFollow()
                  else live.watchPartner()
                }}
                onPullPartner={() => {
                  const current = viewRef.current
                  live.pullPartner({ x: current.x, y: current.y, zoom: current.zoom })
                }}
                onTransferHost={live.transferHost}
                onSaveBoard={saveCopyToLibrary}
                onLeave={live.role === 'guest' ? live.leaveAndCleanup : live.leave}
                onToast={(text, kind) => toast(text, kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info')}
              />
            ) : null}
            <div className="bbar__sep" />
            <button type="button" className="btn btn--sm btn--primary" onClick={() => toggleOverlay('export')}>
              <Download size={15} /> Экспорт
            </button>
          </div>

          {missingImages ? (
            <div className="bbar bbar--panel bbar--warn">
              <ImageOff size={15} />
              <span>
                Без данных: {missingImages} картинок. Изображения при копировании не переносятся — выделите заглушки и перетащите в них файлы из проводника.
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
        ref={setCanvasNode}
        className="boardview__canvas"
        data-grid={gridMode !== 'none'}
        data-gridmode={gridMode}
        data-tool={tool}
        data-panning={drag.kind === 'pan'}
        data-drop={dropActive || undefined}
        onDragOver={onDragOver}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => void onDrop(event)}
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={onPointerDown}
        onPointerMove={(event) => {
          if (live.connected) {
            const point = toWorld(event.clientX, event.clientY)
            live.sendCursor(point.x, point.y)
          }
          onPointerMove(event)
        }}
        onPointerLeave={(event) => {
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.parentElement?.contains(next)) return
          if (live.connected) live.hideCursor()
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <ConnectorLayer
          doc={doc}
          viewRef={viewRef}
          size={size}
          visible={visible}
          dpr={dpr}
          liveRef={liveRef}
          livePosRef={livePosRef}
          previewPositions={movePreview ?? undefined}
        />
        <LiveCursors
          cursors={live.cursors}
          width={size.width}
          height={size.height}
          gutter={railGutter}
          toScreen={(worldX, worldY) => {
            const current = viewRef.current
            return {
              x: size.width / 2 + (worldX - current.x) * current.zoom,
              y: size.height / 2 + (worldY - current.y) * current.zoom
            }
          }}
        />
        <div className="boardview__world" ref={worldRef}>
          <ItemLayer
            items={rendered}
            doc={doc}
            assetUrl={assetUrl}
            selection={selection}
            selectable={tool === 'select' && !readOnly}
            interactive={(tool === 'select' || tool === 'pen' || tool === 'text') && !readOnly}
            moving={drag.kind === 'move'}
            editable={!readOnly}
            editingId={editing?.id ?? null}
            onPatch={patchItem}
            onNode={registerNode}
            onPointerDown={onItemPointerDown}
            onDoubleClick={readOnly ? undefined : startEditing}
            onLink={(href) => void openLinkPreview(href)}
            media={media}
            livePos={livePosRef.current}
            cropId={cropEdit?.id ?? null}
          />
          {resizeTargets.map((target) => {
            const box = itemBounds(target)
            const grip = 11 / Math.max(0.05, liveZoom)
            const half = grip / 2
            return (
              <div
                key={`rs${target.id}`}
                className="resizeframe"
                style={{
                  left: box.x,
                  top: box.y,
                  width: box.width,
                  height: box.height,
                  transform: target.rotation ? `rotate(${target.rotation}deg)` : undefined
                }}
              >
                {RESIZE_HANDLES.map((handle) => (
                  <span
                    key={handle.id}
                    className="resizehandle"
                    style={{
                      left: `calc(${handle.cx * 100}% - ${half}px)`,
                      top: `calc(${handle.cy * 100}% - ${half}px)`,
                      width: grip,
                      height: grip,
                      cursor: handle.cursor
                    }}
                    onPointerDown={(event) => startResize(target.id, handle.id, event)}
                  />
                ))}
                <span
                  className="rotatehandle"
                  style={{
                    left: `calc(50% - ${half}px)`,
                    top: `${-28 / Math.max(0.05, liveZoom) - half}px`,
                    width: grip,
                    height: grip
                  }}
                  title="Повернуть"
                  onPointerDown={(event) => startRotate(target.id, event)}
                />
              </div>
            )
          })}
          {cropEdit ? (
            <div
              className="cropframe"
              style={{
                left: cropEdit.origin.x,
                top: cropEdit.origin.y,
                width: cropEdit.imgW,
                height: cropEdit.imgH,
                transform: cropEdit.rotation ? `rotate(${cropEdit.rotation}deg)` : undefined
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <img className="cropframe__ghost" src={cropEdit.src} alt="" draggable={false} />
              <div
                className="cropframe__win"
                style={{ left: cropEdit.win.x, top: cropEdit.win.y, width: cropEdit.win.w, height: cropEdit.win.h }}
              >
                <div
                  className="cropframe__clip"
                  onPointerDown={cropHandleDown('move')}
                  onPointerMove={(event) => moveCrop('move', event)}
                  onPointerUp={endCropDrag}
                >
                  <img
                    className="cropframe__real"
                    src={cropEdit.src}
                    alt=""
                    draggable={false}
                    style={{
                      width: cropEdit.imgW,
                      height: cropEdit.imgH,
                      marginLeft: -cropEdit.win.x,
                      marginTop: -cropEdit.win.y
                    }}
                  />
                </div>
                {CROP_HANDLES.map((handle) => (
                  <span
                    key={handle}
                    className={`cropframe__handle cropframe__handle--${handle}`}
                    onPointerDown={cropHandleDown(handle)}
                    onPointerMove={(event) => moveCrop(handle, event)}
                    onPointerUp={endCropDrag}
                  />
                ))}
                <div
                  className="cropframe__bar"
                  style={{ transform: `scale(${1 / Math.max(0.05, liveZoom)})` }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <button type="button" className="btn btn--primary" onClick={applyCrop}>
                    Готово
                  </button>
                  <button type="button" className="btn" onClick={() => setCropEdit(null)}>
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          ) : null}
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
              {(textSelection.length > 0 && textSelection.every((item) => item.kind === 'sticky')
                ? STICKY_COLORS
                : QUICK_COLORS
              ).map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  aria-label={`Цвет ${color}`}
                  onClick={() => paintText(color)}
                  style={{
                    background: color,
                    outline:
                      textSelection.length > 0 && paintColorOf(textSelection[0]).toLowerCase() === color.toLowerCase()
                        ? '2px solid var(--inverse)'
                        : '1px solid var(--border)'
                  }}
                />
              ))}
            </div>
          ) : null}
          {editing && editingItem && editingBox ? (
            <textarea
              ref={editorRef}
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
                  commitEditing()
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
                fontSize: fontSizeOf(editingItem),
                fontFamily: editingItem.kind === 'text' ? editingItem.fontFamily : undefined,
                lineHeight: 1.25,
                textAlign: alignOf(editingItem),
                color: textColorOf(editingItem)
              }}
            />
          ) : null}
          {faceLabel && faceLabelBox ? (
            <textarea
              ref={faceLabelRef}
              className="texteditor"
              autoFocus
              value={faceLabel.value}
              placeholder="Текст на грани"
              onChange={(event) => setFaceLabel((current) => (current ? { ...current, value: event.target.value } : current))}
              onBlur={() => commitFaceLabel()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation()
                if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
                  event.preventDefault()
                  commitFaceLabel()
                }
              }}
              style={{
                left: faceLabelBox.x - 100,
                top: faceLabelBox.y - 20,
                width: 200,
                height: 40,
                fontSize: 16,
                lineHeight: 1.25,
                textAlign: 'center'
              }}
            />
          ) : null}
          {penBox ? (
            <div className="inkpreview" style={{ left: penBox.x, top: penBox.y, width: penBox.width, height: penBox.height }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, penBox.width)} ${Math.max(1, penBox.height)}`}>
                <path
                  d={penBox.path}
                  fill="none"
                  stroke={penBox.color}
                  strokeWidth={penMode === 'highlighter' ? 14 : Math.max(1, strokeWidth)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={penBox.opacity}
                />
              </svg>
            </div>
          ) : null}
          {inkGhost ? (
            <div
              className="inkpreview"
              style={{ left: inkGhost.x, top: inkGhost.y, width: inkGhost.width, height: inkGhost.height }}
            >
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, inkGhost.width)} ${Math.max(1, inkGhost.height)}`}>
                <path
                  d={inkGhost.path}
                  fill="none"
                  stroke={inkGhost.color}
                  strokeWidth={inkGhost.base}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={inkGhost.opacity}
                />
              </svg>
            </div>
          ) : null}
          {createPreview ? (
            <div
              className="createpreview"
              style={{ left: createPreview.x, top: createPreview.y, width: createPreview.w, height: createPreview.h }}
            >
              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${Math.max(1, createPreview.w)} ${Math.max(1, createPreview.h)}`}
              >
                {createPreview.kind === 'shape' ? (
                  <path
                    d={shapePath(createPreview.shape, createPreview.w, createPreview.h)}
                    fill="none"
                    stroke={NEW_SHAPE_STROKE}
                    strokeWidth={2}
                    strokeDasharray="7 5"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d={curvePath(createPreview.points)}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={Math.max(1, strokeWidth)}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </div>
          ) : null}
          {remotePreview?.kind === 'stroke' ? (
            <div
              className="inkpreview"
              style={{ left: remotePreview.x, top: remotePreview.y, width: remotePreview.w, height: remotePreview.h }}
            >
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, remotePreview.w)} ${Math.max(1, remotePreview.h)}`}>
                <path
                  d={curvePath(remotePreview.points)}
                  fill="none"
                  stroke={remotePreview.color}
                  strokeWidth={remotePreview.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity={remotePreview.opacity}
                />
              </svg>
            </div>
          ) : null}
          {remotePreview?.kind === 'shape' ? (
            <div
              className="createpreview"
              style={{ left: remotePreview.x, top: remotePreview.y, width: remotePreview.w, height: remotePreview.h }}
            >
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, remotePreview.w)} ${Math.max(1, remotePreview.h)}`}>
                {remotePreview.points ? (
                  <path
                    d={curvePath(remotePreview.points)}
                    fill="none"
                    stroke={remotePreview.color}
                    strokeWidth={remotePreview.width}
                    strokeDasharray="7 5"
                    strokeLinecap="round"
                  />
                ) : (
                  <path
                    d={shapePath(remotePreview.shape as ShapeName, remotePreview.w, remotePreview.h)}
                    fill="none"
                    stroke={remotePreview.color}
                    strokeWidth={remotePreview.width}
                    strokeDasharray="7 5"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
            </div>
          ) : null}
          {rubberRect ? (
            <div className="rubber" style={{ left: rubberRect.x, top: rubberRect.y, width: rubberRect.width, height: rubberRect.height }} />
          ) : null}
          {strokeBox ? (
            <div className="inkpreview" style={{ left: strokeBox.x, top: strokeBox.y, width: strokeBox.width, height: strokeBox.height }}>
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, strokeBox.width)} ${Math.max(1, strokeBox.height)}`}>
                <path
                  d={strokeBox.path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          ) : null}
          {throughPreview ? (
            <div
              className="inkpreview"
              style={{
                left: throughPreview.left,
                top: throughPreview.top,
                width: throughPreview.width,
                height: throughPreview.height
              }}
            >
              <svg width="100%" height="100%" viewBox={`0 0 ${Math.max(1, throughPreview.width)} ${Math.max(1, throughPreview.height)}`}>
                {throughPreview.line ? (
                  <line
                    x1={throughPreview.line.x1}
                    y1={throughPreview.line.y1}
                    x2={throughPreview.line.x2}
                    y2={throughPreview.line.y2}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                  />
                ) : null}
                <circle cx={throughPreview.dotX} cy={throughPreview.dotY} r={3} fill={strokeColor} stroke="#ffffff" strokeWidth={1} />
              </svg>
            </div>
          ) : null}
        </div>
        {promptElement}
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
            {menu.onItem ? (
              <>
                <div className="ctxmenu__title">{`Выбрано: ${selection.size}`}</div>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    bringSelection(true)
                    setMenu(null)
                  }}
                >
                  <ArrowUpToLine size={15} /> На самый верх
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    bringSelection(false)
                    setMenu(null)
                  }}
                >
                  <ArrowDownToLine size={15} /> На самый низ
                </button>
                {imageSelection.length === 1 ? (
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      const item = imageSelection[0]
                      setMenu(null)
                      if (item) void startCrop(item.id)
                    }}
                  >
                    <Crop size={15} /> Обрезать
                  </button>
                ) : null}
                <div className="ctxmenu__sep" />
                <button
                  type="button"
                  onClick={() => {
                    setMenu(null)
                    setShowInspector(true)
                  }}
                >
                  <Layers size={15} /> Свойства
                </button>
              </>
            ) : (
              <>
            <div className="ctxmenu__title">Доска</div>
            <button
              type="button"
              disabled={readOnly}
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
            <div className="ctxmenu__sep" />
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                if (present) stopPresent()
                else startPresent()
              }}
            >
              <Play size={15} /> Режим докладчика
            </button>
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                setCalculatorOpen(true)
                setDetailsOpen(false)
                setShowInspector(false)
              }}
            >
              <Calculator size={15} /> Калькулятор
            </button>
            <div className="ctxmenu__sep" />
            <button
              type="button"
              onClick={() => {
                setMenu(null)
                void openLinkPreview()
              }}
            >
              <Link2 size={15} /> Предпросмотр по ссылке
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
              </>
            )}
          </div>
        </>
      ) : null}

      <div className="boardview__tools">
        <BoardToolbar
          tool={tool}
          readOnly={readOnly}
          moreOpen={moreOpen}
          order={railOrder}
          extras={railExtras}
          onMore={(value) => setMoreOpen(value)}
          onLayout={setLayout}
          onTool={(next) => {
            if (next === 'link') setLinkFrom(null)
            setTool(next)
          }}
        />
        {panelKind === 'selection' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__grid">
              <button
                type="button"
                className="toolbtn"
                onClick={() => groupSelection()}
                disabled={selection.size < 2 || readOnly}
                title="Объединить выделенные в группу"
              >
                <Group size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                onClick={() => ungroupSelection()}
                disabled={!groupedSelection || readOnly}
                title="Разделить группу на отдельные объекты"
              >
                <Ungroup size={16} />
              </button>
            </div>
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
                  <button type="button" className="toolbtn" onClick={() => void replaceImage(imageSelection[0].id, 'url')} title="Заменить картинкой по ссылке">
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
            <div className="toolpalette__hint">{solidPanel.hint}</div>
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
            <div className="toolpalette__sep" />
            <div className="toolpalette__label">{solidMode === 'paint' ? 'Цвет грани' : 'Цвет рёбер и штрихов'}</div>
            <div className="toolpalette__row">
              {QUICK_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className="swatch"
                  aria-label={`Цвет ${color}`}
                  onClick={() => (solidMode === 'paint' ? setStrokeColor(color) : solidPanel.target ? patchSolid({ color }) : setStrokeColor(color))}
                  style={{
                    background: color,
                    outline: (solidMode === 'paint' ? strokeColor : solidPanel.color).toLowerCase() === color ? '2px solid var(--inverse)' : '1px solid var(--border)'
                  }}
                />
              ))}
              <label className="swatch swatch--custom" title="Свой цвет">
                <input
                  type="color"
                  value={solidMode === 'paint' ? strokeColor : solidPanel.color}
                  onChange={(event) =>
                    solidMode === 'paint' ? setStrokeColor(event.target.value) : solidPanel.target ? patchSolid({ color: event.target.value }) : setStrokeColor(event.target.value)
                  }
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
              </>
            ) : null}
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
                  onClick={() => (createIsLine ? setStrokeColor(color) : setShapeColor(color))}
                  style={{
                    background: color,
                    outline: (createIsLine ? strokeColor : shapeColor).toLowerCase() === color ? '2px solid var(--inverse)' : '1px solid var(--border)'
                  }}
                />
              ))}
              <label className="swatch swatch--custom" title="Свой цвет">
                <input
                  type="color"
                  value={createIsLine ? strokeColor : shapeColor}
                  onChange={(event) => (createIsLine ? setStrokeColor(event.target.value) : setShapeColor(event.target.value))}
                  aria-label="Свой цвет"
                />
                <Pipette size={14} />
              </label>
            </div>
            <label className="toolpalette__slider" title={createIsLine ? 'Толщина линии' : 'Толщина рамки'}>
              <span>Линия</span>
              <input
                type="range"
                min={1}
                max={24}
                step={1}
                value={createIsLine ? strokeWidth : shapeStroke}
                onChange={(event) => (createIsLine ? setStrokeWidth(Number(event.target.value)) : setShapeStroke(Number(event.target.value)))}
              />
              <span>{createIsLine ? strokeWidth : shapeStroke}</span>
            </label>
          </div>
        ) : null}
        {panelKind === 'pen' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__row">
              <button
                type="button"
                className="toolbtn"
                data-active={penMode === 'pen'}
                onClick={() => setPenMode('pen')}
                title="Ручка"
                aria-label="Ручка"
              >
                <PenTool size={16} />
              </button>
              <button
                type="button"
                className="toolbtn"
                data-active={penMode === 'highlighter'}
                onClick={() => setPenMode('highlighter')}
                title="Выделитель"
                aria-label="Выделитель"
              >
                <Highlighter size={16} />
              </button>
            </div>
            <div className="toolpalette__sep" />
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
              <span>Толщина</span>
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
          </div>
        ) : null}
        {panelKind === 'link' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__grid">
              <button
                type="button"
                className="toolbtn"
                data-active={linkStyle === 'straight'}
                onClick={() => setLinkStyle('straight')}
                title="Прямая линия"
              >
                <Minus size={15} />
              </button>
              <button
                type="button"
                className="toolbtn"
                data-active={linkStyle === 'curved'}
                onClick={() => setLinkStyle('curved')}
                title="Кривая"
              >
                <MoveUpRight size={15} />
              </button>
              <button
                type="button"
                className="toolbtn"
                data-active={linkStyle === 'elbowed'}
                onClick={() => setLinkStyle('elbowed')}
                title="Ломаная"
              >
                <Link2 size={15} />
              </button>
            </div>
            <label className="toolpalette__slider" title="Толщина линии">
              <span>Толщина</span>
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={linkWidth}
                onChange={(event) => setLinkWidth(Number(event.target.value))}
              />
              <span>{linkWidth}</span>
            </label>
            <label className="toolpalette__check">
              <input
                type="checkbox"
                checked={linkArrow}
                onChange={(event) => setLinkArrow(event.target.checked)}
              />
              Стрелка на конце
            </label>
            <div className="toolpalette__sep" />
            <div className="toolpalette__hint">
              {linkFrom ? 'Теперь по второму объекту' : 'Щёлкните по первому'}
            </div>
            {linkFrom ? (
              <button type="button" className="toolbtn" onClick={() => setLinkFrom(null)} title="Отменить выбор">
                <X size={15} />
              </button>
            ) : null}
            {linkPreview ? (
              <>
                <div className="toolpalette__sep" />
                <div className="toolpalette__hint truncate">{linkPreview}</div>
                <button
                  type="button"
                  className="toolbtn"
                  onClick={() => void openLinkPreview(linkPreview)}
                  title="Открыть в окне предпросмотра"
                >
                  <ExternalLink size={16} />
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {panelKind === 'erase' ? (
          <div className="toolgroup toolpalette">
            <label className="toolpalette__slider" title="Размер ластика">
              <span>Размер</span>
              <input
                type="range"
                min={6}
                max={48}
                step={2}
                value={eraseSize}
                onChange={(event) => setEraseSize(Number(event.target.value))}
              />
              <span>{eraseSize}</span>
            </label>
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
                onClick={() => {
                  void ask('Ссылка на картинку', '', 'https://').then((value) => {
                    const url = value?.trim()
                    if (!url) return
                    return insertImageFromUrl(url)
                  })
                }}
                title="Вставить картинку по ссылке"
              >
                <ExternalLink size={16} />
              </button>
            </div>
          </div>
        ) : null}
        {panelKind === 'text' || panelKind === 'sticky' ? (
          <div className="toolgroup toolpalette">
            <div className="toolpalette__label">
              {panelKind === 'text' ? 'Текст' : 'Стикер'}
            </div>
            <div className="toolpalette__row">
              <label className="swatch swatch--custom" title="Цвет текста">
                <input
                  type="color"
                  value={textColor}
                  onChange={(event) => setTextColor(event.target.value)}
                  aria-label="Цвет текста"
                />
                <Pipette size={14} />
              </label>
            </div>
            <label className="toolpalette__slider" title="Размер шрифта">
              <span>Шрифт</span>
              <input
                type="range"
                min={8}
                max={72}
                step={1}
                value={textSize}
                onChange={(event) => setTextSize(Number(event.target.value))}
              />
              <span>{textSize}</span>
            </label>
            <div className="toolpalette__hint">
              {panelKind === 'text' ? 'Щёлкните по доске или по грани 3D-фигуры' : 'Щёлкните по доске, чтобы поставить стикер.'}
            </div>
          </div>
        ) : null}
        {panelKind === 'graph' && graphPanel ? (
          <div className="toolgroup toolpalette">
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
            <div className="toolpalette__grid toolpalette__grid--3">
              <button type="button" className="toolbtn" onClick={() => fitGraphToView()} title="Вписать плоскость в окно">
                <Maximize2 size={16} />
              </button>
              <button type="button" className="toolbtn" onClick={() => patchGraph({ w: 360, h: 260 })} title="Маленькая плоскость">
                <span className="toolpalette__dims">360×260</span>
              </button>
              <button type="button" className="toolbtn" onClick={() => patchGraph({ w: 640, h: 440 })} title="Обычная плоскость">
                <span className="toolpalette__dims">640×440</span>
              </button>
            </div>
            <div className="toolpalette__grid toolpalette__grid--3">
              <button type="button" className="toolbtn" onClick={() => patchGraph({ w: 960, h: 640 })} title="Широкая плоскость">
                <span className="toolpalette__dims">960×640</span>
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
                    <span>{expression.lineWidth}</span>
                  </button>
                  <button
                    type="button"
                    className="toolbtn toolbtn--compact"
                    data-active={expression.visible}
                    onClick={() => patchExpression(expression.id, { visible: !expression.visible })}
                    title="Показать или скрыть"
                  >
                    {expression.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    type="button"
                    className="toolbtn toolbtn--compact"
                    onClick={() => patchGraph({ expressions: graphPanel.expressions.filter((entry) => entry.id !== expression.id) })}
                    title="Удалить график"
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
          </div>
        ) : null}
      </div>

      {present ? (
        <div className="presentbar">
          <button type="button" className="toolbtn" onClick={() => stepFrame(-1)} aria-label="Предыдущая рамка" title="Предыдущая рамка (стрелка влево)">
            <ChevronLeft size={17} />
          </button>
          <div className="presentbar__title">
            {frames.length ? frames[presentIndex]?.title || 'Без названия' : 'Вся доска'}
            {frames.length ? <span className="presentbar__count">{presentIndex + 1} из {frames.length}</span> : null}
          </div>
          <button type="button" className="toolbtn" onClick={() => stepFrame(1)} aria-label="Следующая рамка" title="Следующая рамка (стрелка вправо)">
            <ChevronRight size={17} />
          </button>
          <div className="bbar__sep" />
          <button type="button" className="toolbtn" onClick={stopPresent} aria-label="Выйти из режима докладчика" title="Выйти (Esc)">
            <X size={17} />
          </button>
        </div>
      ) : null}

      <div className="overlay bfloat bfloat--br">
        <div className="toolgroup">
          <button type="button" className="toolbtn" onClick={() => zoomBy(1 / 1.25)} aria-label="Уменьшить" title="Уменьшить">
            <ZoomOut size={17} />
          </button>
          <button
            type="button"
            className="zoomval"
            ref={zoomLabelRef}
            onClick={() => {
              const current = viewRef.current
              applyView({ ...current, zoom: 1 }, true)
            }}
            title="Вернуть 100%"
            aria-label="Вернуть 100%"
          >
            {Math.round(viewport.zoom * 100)}%
          </button>
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


      {showInspector && selection.size ? (
        <Inspector
          items={selectedItems}
          docTitle={doc.title}
          onClose={() => setShowInspector(false)}
          onPatch={patchItem}
          onPatchMany={patchItems}
          onPatchLive={patchItemsLive}
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
          alignSnap={snapEnabled}
          onMode={(mode) => changeGrid({ gridMode: mode })}
          onSize={(size) => changeGrid({ gridSize: size })}
          onSnap={(value) => changeGrid({ snapGrid: value })}
          onAlignSnap={(value) => changeGrid({ alignSnap: value })}
          onClose={() => setBoardSettingsOpen(false)}
        />
      ) : null}

      {showExport ? <ExportDialog doc={doc} onClose={() => setShowExport(false)} flush={flushPending} /> : null}

      {calculatorOpen ? (
        <div
          className="overlay calcwrap"
          onPointerMove={(event) => {
            if (!live.connected) return
            const point = toWorld(event.clientX, event.clientY)
            live.sendCursor(point.x, point.y)
          }}
        >
          <CalculatorPanel
            docId={doc.id}
            partner={partnerCalc}
            onClose={() => setCalculatorOpen(false)}
            onChange={(view) => {
              if (!live.connected) return
              pushPreview({ t: 'preview', kind: 'calc', source: view.source, result: view.result, open: true })
            }}
          />
        </div>
      ) : null}
    </div>
  )
}