import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowDownToLine,
  ArrowUpToLine,
  Bold,
  Calculator,
  Check,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  FileImage,
  Grid3x3,
  Group,
  Ungroup,
  Highlighter,
  ImageOff,
  ImagePlus,
  Info,
  Italic,
  Layers,
  Link2,
  List,
  ListOrdered,
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
  Magnet,
  PaintBucket,
  PenTool,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Search,
  Spline,
  SlidersHorizontal,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
  Users,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react'
import type { AssetRef, BoardDoc, BoardItem, BrushPreset, ConnectorBend, ConnectorItem, DocumentItem, GraphExpr, GraphItem, GridMode, PathItem, Rect, ShapeItem, ShapeName, SolidFace, SolidItem, SolidKind, StrokeEnd } from '@shared/types'
import { solidBounds, solidFaceAt, solidPolygons } from '@shared/three'
import { compileFormula } from '@shared/graph'
import { contrastColor, shadesOf } from '@shared/color'
import { faceLocalToWorld, faceWorldToLocal, polygonOverlapArea, projectPoint, solidProjection, solidScreenToLocal } from '@shared/three'
import { snapBox, unionBox } from './align'
import type { Guide, Placed } from './align'
import { boundsOfItems, clamp, fitTextBox, measureTextBox, rotatedBox, uid, withoutDanglingConnectors } from '@shared/util'
import { anchorPoint, arrowHeadPath, bendByGrip, boundaryPoint, connectorGrips, curveControl, deriveConnectorPoints, sampleConnector, straightenConnector } from '@shared/geometry'
import type { BendGrip } from '@shared/geometry'
import { curvePath } from '@shared/curve'
import { buildStroke, distanceToStroke, straightStroke } from '@shared/stroke'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { navigate } from '../router'
import { ItemLayer, itemBounds, shapeTextSize, visibleItems } from './scene'
import { reloadFileHtml } from './filePeek'
import { kindLabel } from './itemKinds'
import { sheetSize } from './tableView'
import { SHAPE_GROUPS, SHAPE_LABELS, cornerRadius, hasCornerRadius, isVertexShape, shapeHandleValue, shapeHandles, shapeParams, shapePath, shapeVertices, snapVertexPoint } from '@shared/shapes'
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
import { bracketKey, letterKey } from '../lib/letterKey'
import { encodeLiroClipboard, decodeLiroClipboard } from '../lib/liroClipboard'
import { useLiveBoard } from '../live/useLiveBoard'
import { useMediaSync } from '../live/mediaSync'
import { LiveCursors } from '../live/cursors'
import { LivePanel } from '../live/panel'
import { BoardToolbar, normalizeToolLayout, railTools, toolEntry } from './toolbar'
import { ContextMenu } from '../components/menu'
import type { MenuItem } from '../components/menu'
import { TextEditor, activeEditorNode, applyFormat, applyTextColor, currentFormat, emptyFormat } from './textEditor'
import type { TextFormatState } from './textEditor'
import { plainFromRichHtml, richHtmlFromPlain, sanitizeRichHtml } from './richHtml'
import {
  BrushDot,
  PaletteAction,
  PaletteCell,
  PaletteCheck,
  PaletteGrid,
  PaletteGroup,
  PaletteHead,
  PaletteNote,
  PaletteOption,
  PaletteSlider,
  PaletteSwatches,
  LineGlyph
} from '../components/palette'
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
  | { kind: 'textdraft'; startX: number; startY: number; currentX: number; currentY: number }
  | { kind: 'move'; startX: number; startY: number; ids: string[]; origins: Map<string, { x: number; y: number }>; moved: boolean }
  | { kind: 'erase'; removed: Set<string> }
  | { kind: 'create'; startX: number; startY: number; currentX: number; currentY: number; tool: CreateTool; shape: ShapeName }
  | { kind: 'link'; fromId: string; point: { x: number; y: number }; anchor: { x: number; y: number } }
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
      base: BoardItem
      moved: boolean
    }
  | {
      kind: 'adjust'
      id: string
      handle: ShapeAdjustHandle
      startX: number
      startY: number
      base: ShapeItem
      moved: boolean
    }
  | {
      kind: 'bend'
      id: string
      grip: BendGrip
      base: ConnectorBend[]
      connector: ConnectorItem
      from: { x: number; y: number }
      to: { x: number; y: number }
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

type CreateTool = 'shape' | 'line' | 'arrow'

type SolidMode = 'rotate' | 'move' | 'paint' | 'through'

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type ShapeAdjustHandle = string

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

const LINK_DOTS: Array<{ id: string; cx: number; cy: number; dx: number; dy: number }> = [
  { id: 'n', cx: 0.5, cy: 0, dx: 0, dy: -1 },
  { id: 'e', cx: 1, cy: 0.5, dx: 1, dy: 0 },
  { id: 's', cx: 0.5, cy: 1, dx: 0, dy: 1 },
  { id: 'w', cx: 0, cy: 0.5, dx: -1, dy: 0 }
]

const CROP_HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

function rotatePoint(point: { x: number; y: number }, degrees: number): { x: number; y: number } {
  const rad = (degrees * Math.PI) / 180
  return {
    x: Math.cos(rad) * point.x - Math.sin(rad) * point.y,
    y: Math.sin(rad) * point.x + Math.cos(rad) * point.y
  }
}

function attachOffset(item: BoardItem, point: { x: number; y: number }): { x: number; y: number } | null {
  const box = itemBounds(item)
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const dx = point.x - center.x
  const dy = point.y - center.y
  const distance = Math.hypot(dx, dy)
  if (distance < 0.5) return null
  const reach = Math.hypot(box.width, box.height)
  const edge = boundaryPoint(item, { x: center.x + (dx / distance) * reach, y: center.y + (dy / distance) * reach })
  const local = rotatePoint({ x: edge.x - center.x, y: edge.y - center.y }, -(item.rotation || 0))
  return {
    x: clamp((local.x + box.width / 2) / Math.max(1, box.width), 0, 1),
    y: clamp((local.y + box.height / 2) / Math.max(1, box.height), 0, 1)
  }
}

interface ResizeBox {
  x: number
  y: number
  width: number
  height: number
}

function resizedItem(item: BoardItem, origin: Rect, next: ResizeBox, handle: ResizeHandle): BoardItem {
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
    const corner = handle.length > 1
    if (handle === 'e' || handle === 'w') {
      const inner = measureTextBox(item.plain || '', item.fontSize, Math.max(20, width - 4))
      return {
        ...item,
        x,
        y,
        w: width,
        h: Math.max(Math.round(item.fontSize * 1.3), inner.height + 4),
        fontSize: item.fontSize,
        column: true
      }
    }
    const scale = corner
      ? Math.max(width / Math.max(1, origin.width), height / Math.max(1, origin.height))
      : 1
    const fontSize = corner ? Math.round(clamp(item.fontSize * scale, 6, 400)) : item.fontSize
    return { ...item, x, y, w: width, h: height, fontSize, column: corner ? item.column : true }
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

const CREATE_STROKES = new Set<CreateTool>(['line', 'arrow'])

function LinkDraft(props: {
  from: BoardItem | null
  to: BoardItem | null
  anchor: { x: number; y: number }
  point: { x: number; y: number }
  style: 'straight' | 'curved' | 'elbowed'
  color: string
  width: number
  zoom: number
  arrow: boolean
}): ReactNode {
  const { from: source, to: target, anchor, point, style, color, width, zoom, arrow } = props
  const offset = source ? attachOffset(source, anchor) : null
  const start = source ? (offset ? anchorPoint(source, offset) : boundaryPoint(source, point)) : anchor
  const end = target && target.id !== source?.id ? boundaryPoint(target, start) : point

  const dx = end.x - start.x
  const dy = end.y - start.y
  const bend = Math.abs(dx) >= Math.abs(dy)
  let control: { x: number; y: number } | null = null
  let tail = start
  let d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`
  if (style === 'curved') {
    control = curveControl(start, end)
    tail = control
    d = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`
  } else if (style === 'elbowed') {
    const corners = bend
      ? [{ x: start.x + dx / 2, y: start.y }, { x: start.x + dx / 2, y: end.y }]
      : [{ x: start.x, y: start.y + dy / 2 }, { x: end.x, y: start.y + dy / 2 }]
    tail = corners[1]
    d = [start, ...corners, end].map((entry, index) => `${index === 0 ? 'M' : 'L'} ${entry.x} ${entry.y}`).join(' ')
  }

  const angle = Math.atan2(end.y - tail.y, end.x - tail.x)
  const head = Math.min(34 / zoom, Math.max(16 / zoom, (width * 6) / zoom))
  const spread = head * 0.6
  const barbs = { x: end.x - Math.cos(angle) * head, y: end.y - Math.sin(angle) * head }
  const notch = { x: end.x - Math.cos(angle) * head * 0.55, y: end.y - Math.sin(angle) * head * 0.55 }
  const left = { x: barbs.x - Math.sin(angle) * spread, y: barbs.y + Math.cos(angle) * spread }
  const right = { x: barbs.x + Math.sin(angle) * spread, y: barbs.y - Math.cos(angle) * spread }

  const pad = head + 16 / zoom
  const box = {
    x: Math.min(start.x, end.x) - pad,
    y: Math.min(start.y, end.y) - pad,
    w: Math.abs(dx) + pad * 2,
    h: Math.abs(dy) + pad * 2
  }

  return (
    <div className="linkdraft" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
      <svg width="100%" height="100%" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} overflow="visible">
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={Math.max(width, 1.6 / zoom)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {arrow ? (
          <path
            d={`M ${end.x} ${end.y} L ${left.x} ${left.y} L ${notch.x} ${notch.y} L ${right.x} ${right.y} Z`}
            fill={color}
          />
        ) : null}
        <circle
          cx={start.x}
          cy={start.y}
          r={4.5 / zoom}
          fill="#ffffff"
          stroke={color}
          strokeWidth={1.8 / zoom}
        />
      </svg>
    </div>
  )
}

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

function shapeTextColorOf(item: { textColor?: string }): string {
  return item.textColor ?? '#1a1a1a'
}

function textColorOf(item: BoardItem): string {
  if (item.kind === 'text') return item.color
  if (item.kind === 'sticky') return item.textColor || contrastColor(item.color)
  if (item.kind === 'shape') return shapeTextColorOf(item)
  return '#1a1a1a'
}

function fillColorOf(item: BoardItem): string {
  if (item.kind === 'sticky') return item.color
  return '#ffffff'
}

function borderColorOf(item: BoardItem): string {
  if (item.kind === 'shape') return item.borderColor
  return NEW_SHAPE_BORDER
}

const SHAPE_ICON_BOX: Partial<Record<ShapeName, [number, number]>> = { pill: [20, 9] }

function shapeIcon(shape: ShapeName): ReactNode {
  const box = SHAPE_ICON_BOX[shape] ?? [20, 20]
  const shiftX = (20 - box[0]) / 2
  const shiftY = (20 - box[1]) / 2
  return (
    <svg width="19" height="19" viewBox="-1.6 -1.6 23.2 23.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d={shapePath(shape, box[0], box[1])} transform={shiftX || shiftY ? `translate(${shiftX} ${shiftY})` : undefined} />
    </svg>
  )
}

function dashIcon(style: 'normal' | 'dotted' | 'dashed'): ReactNode {
  const dash = style === 'dashed' ? '7 5' : style === 'dotted' ? '1.5 4' : undefined
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      {dash ? <line x1="1" y1="6" x2="21" y2="6" strokeDasharray={dash} /> : <line x1="1" y1="6" x2="21" y2="6" />}
    </svg>
  )
}

const ARROW_CAP_ICON = arrowHeadPath(9)

function capIcon(cap: StrokeEnd): ReactNode {
  const shape = cap.toLowerCase()
  const hollow = (shape.includes('diamond') || shape.includes('oval') || shape.includes('circle')) && !shape.includes('filled')
  const paint = hollow ? { fill: 'none', stroke: 'currentColor', strokeWidth: 1.4 } : { fill: 'currentColor', stroke: 'none' }
  const plain = !shape.includes('diamond') && !shape.includes('oval') && !shape.includes('circle') && !shape.includes('stealth')
  const body = shape.includes('diamond')
    ? '15,1.4 20.5,6 15,10.6 9.5,6'
    : shape.includes('stealth')
      ? '21,6 12.5,1.8 16.5,6 12.5,10.2'
      : ''
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="1" y1="6" x2={cap === 'none' ? '21' : '14'} y2="6" />
      {shape.includes('oval') || shape.includes('circle') ? (
        <ellipse cx="16.5" cy="6" rx="4.6" ry="3.4" {...paint} />
      ) : cap === 'none' ? null : plain ? (
        <path d={ARROW_CAP_ICON} transform="translate(21 6)" {...paint} />
      ) : (
        <polygon points={body} {...paint} />
      )}
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

const IMAGE_FILE_NAME = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|apng|jfif|heic|heif|tiff?)$/i
const FILE_WIDTH = 300
const FILE_HEIGHT = 424

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_FILE_NAME.test(file.name)
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(file)
  })
}

const MIN_ZOOM = 0.02
const MAX_ZOOM = 6
const HISTORY_LIMIT = 200
const FIRST_BATCH = 300
const MOVE_EASE = 0.4
const QUICK_COLORS = ['#1f2023', '#d6484a', '#e0873a', '#3d9a68', '#3f74cf']
const CONNECTOR_CAPS: StrokeEnd[] = ['none', 'arrow', 'stealth', 'filled_diamond', 'filled_oval']
const CONNECTOR_CAP_LABELS: Record<string, string> = {
  none: 'Без наконечника',
  arrow: 'Стрела',
  stealth: 'Узкая стрела',
  filled_diamond: 'Ромб',
  filled_oval: 'Овал'
}
const DEFAULT_BRUSHES: BrushPreset[] = [
  { color: '#1f2023', width: 3 },
  { color: '#d6484a', width: 6 },
  { color: '#3f74cf', width: 12 }
]
const DEFAULT_MARKERS: BrushPreset[] = [
  { color: '#fff9b1', width: 12 },
  { color: '#cfe8fb', width: 18 },
  { color: '#d9f2e3', width: 24 }
]
const STICKY_COLORS = ['#fff9b1', '#ffd8b1', '#cfe8fb', '#d9f2e3', '#f3e0ff']
const GRAPH_DIVISIONS = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100]
const COLOR_NAMES: Record<string, string> = {
  '#1f2023': 'Чёрный',
  '#d6484a': 'Красный',
  '#e0873a': 'Оранжевый',
  '#3d9a68': 'Зелёный',
  '#3f74cf': 'Синий',
  '#1a1a1a': 'Чёрный',
  '#7f1d1d': 'Бордовый',
  '#1d4ed8': 'Синий',
  '#15803d': 'Зелёный',
  '#b45309': 'Коричневый',
  '#fff9b1': 'Жёлтый',
  '#ffd8b1': 'Оранжевый',
  '#cfe8fb': 'Голубой',
  '#d9f2e3': 'Салатовый',
  '#f3e0ff': 'Сиреневый'
}

function colorName(color: string): string {
  return COLOR_NAMES[color.toLowerCase()] ?? color
}
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

const NEW_SHAPE_BORDER = '#1a1a1a'

function changed(base: BoardItem[], next: BoardItem[]): boolean {
  return next.some((entry, index) => entry !== base[index])
}

function withPatch(item: BoardItem, patch: Partial<BoardItem>): BoardItem {
  if (item.locked && patch.locked === undefined) return item
  return { ...item, ...patch } as BoardItem
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

const SOLID_MODE_LABELS: Record<SolidMode, string> = {
  rotate: 'Вращение',
  move: 'Перенос',
  paint: 'Заливка',
  through: 'Внутри'
}

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
        .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    },
    [setSettings, fail]
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
  const dragKindRef = useRef<DragMode['kind']>('idle')
  useEffect(() => {
    dragKindRef.current = drag.kind
  }, [drag.kind])
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
  const [penOpacity, setPenOpacity] = useState(1)
  const [tool, setTool] = useState<Tool>('select')
  const [paletteHidden, setPaletteHidden] = useState(false)
  const [shapePoints, setShapePoints] = useState<string | null>(null)
  const [faceLabel, setFaceLabel] = useState<{
    itemId: string
    face: string
    point: { x: number; y: number }
    replaces: number | null
    value: string
  } | null>(null)

  useEffect(() => {
    if (!moreOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const node = event.target as HTMLElement | null
      if (node?.closest('.toolrail')) return
      setMoreOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [moreOpen])

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
  
  const [createTool, setCreateTool] = useState<CreateTool>('shape')
  const [createShape, setCreateShape] = useState<ShapeName>('rectangle')
  const [editing, setEditing] = useState<{ id: string; html: string; plain: string } | null>(null)
  const [textFormat, setTextFormat] = useState<TextFormatState>(emptyFormat)
  const [solidKind, setSolidKind] = useState<SolidKind>('cube')
  const [strokeColor, setStrokeColor] = useState(settings?.brushPresets?.[settings.brushIndex ?? 0]?.color ?? '#1f2023')
  const [strokeWidth, setStrokeWidth] = useState(settings?.brushPresets?.[settings.brushIndex ?? 0]?.width ?? 4)
  const [shapeBorder, setShapeBorder] = useState(NEW_SHAPE_BORDER)
  const [shapeStroke, setShapeStroke] = useState(2)
  const [penBrushes, setPenBrushes] = useState<BrushPreset[]>(
    settings?.brushPresets?.length ? settings.brushPresets : DEFAULT_BRUSHES
  )
  const [markerBrushes, setMarkerBrushes] = useState<BrushPreset[]>(
    settings?.markerPresets?.length ? settings.markerPresets : DEFAULT_MARKERS
  )
  const [penIndex, setPenIndex] = useState(settings?.brushIndex ?? 0)
  const [markerIndex, setMarkerIndex] = useState(settings?.markerIndex ?? 0)
  const markerMode = penMode === 'highlighter'
  const brushes = markerMode ? markerBrushes : penBrushes
  const brushIndex = markerMode ? markerIndex : penIndex
  const brushRestoreRef = useRef(false)
  const brushModeRef = useRef(penMode)
  const brushSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!settings || brushRestoreRef.current) return
    brushRestoreRef.current = true
    const savedPen = settings.brushPresets?.length ? settings.brushPresets : DEFAULT_BRUSHES
    const savedMarker = settings.markerPresets?.length ? settings.markerPresets : DEFAULT_MARKERS
    setPenBrushes(savedPen)
    setMarkerBrushes(savedMarker)
    const index = Math.min(Math.max(settings.brushIndex ?? 0, 0), savedPen.length - 1)
    setPenIndex(index)
    setMarkerIndex(Math.min(Math.max(settings.markerIndex ?? 0, 0), savedMarker.length - 1))
    const preset = savedPen[index]
    if (preset) {
      setStrokeColor(preset.color)
      setStrokeWidth(preset.width)
    }
  }, [settings])

  const persistBrushes = useCallback(
    (
      nextPen: BrushPreset[],
      nextPenIndex: number,
      nextMarker: BrushPreset[],
      nextMarkerIndex: number
    ): void => {
      if (brushSaveTimerRef.current !== null) window.clearTimeout(brushSaveTimerRef.current)
      brushSaveTimerRef.current = window.setTimeout(() => {
        brushSaveTimerRef.current = null
        void api.settings
          .set({
            brushPresets: nextPen,
            brushIndex: nextPenIndex,
            markerPresets: nextMarker,
            markerIndex: nextMarkerIndex
          })
          .then((saved) => setSettings(saved))
          .catch(() => undefined)
      }, 250)
    },
    [setSettings]
  )

  const selectBrush = useCallback(
    (index: number): void => {
      if (markerMode) setMarkerIndex(index)
      else setPenIndex(index)
      const preset = brushes[index]
      if (preset) {
        setStrokeColor(preset.color)
        setStrokeWidth(preset.width)
      }
      persistBrushes(penBrushes, markerMode ? penIndex : index, markerBrushes, markerMode ? index : markerIndex)
    },
    [brushes, markerMode, penBrushes, penIndex, markerBrushes, markerIndex, persistBrushes]
  )

  const editBrush = useCallback(
    (index: number, patch: { color?: string; width?: number }): void => {
      const next = brushes.map((preset, position) => (position === index ? { ...preset, ...patch } : preset))
      if (markerMode) setMarkerBrushes(next)
      else setPenBrushes(next)
      if (index === brushIndex) {
        if (patch.color !== undefined) setStrokeColor(patch.color)
        if (patch.width !== undefined) setStrokeWidth(patch.width)
      }
      persistBrushes(
        markerMode ? penBrushes : next,
        markerMode ? penIndex : brushIndex,
        markerMode ? next : markerBrushes,
        markerMode ? brushIndex : markerIndex
      )
    },
    [brushes, brushIndex, markerMode, penBrushes, penIndex, markerBrushes, markerIndex, persistBrushes]
  )

  useEffect(() => {
    if (!brushRestoreRef.current) return
    if (brushModeRef.current !== penMode) {
      brushModeRef.current = penMode
      const preset = brushes[brushIndex]
      if (preset) {
        setStrokeColor(preset.color)
        setStrokeWidth(preset.width)
      }
      return
    }
    const preset = brushes[brushIndex]
    if (!preset || (preset.color === strokeColor && preset.width === strokeWidth)) return
    const next = brushes.map((value, position) => (position === brushIndex ? { color: strokeColor, width: strokeWidth } : value))
    if (markerMode) setMarkerBrushes(next)
    else setPenBrushes(next)
    persistBrushes(markerMode ? penBrushes : next, penIndex, markerMode ? next : markerBrushes, markerIndex)
  }, [
    brushes,
    brushIndex,
    strokeColor,
    strokeWidth,
    penMode,
    markerMode,
    persistBrushes,
    penBrushes,
    penIndex,
    markerBrushes,
    markerIndex
  ])
  const createIsLine = CREATE_STROKES.has(createTool)
  const [renaming, setRenaming] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  const [liveZoom, setLiveZoom] = useState(40)
  const live = useLiveBoard({ userName: settings?.userName ?? '' })
  const media = useMediaSync(live.sendOps)
  const readOnly = readOnlyLocal || hostLocked
  const [menu, setMenu] = useState<{ x: number; y: number; onItem: string } | null>(null)
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 })
  const [eraserCursor, setEraserCursor] = useState<{ x: number; y: number; size: number } | null>(null)
  const eraseBaseRef = useRef<BoardItem[] | null>(null)
  const itemNodesRef = useRef(new Map<string, HTMLDivElement>())
  const liveRef = useRef(0)
  const livePosRef = useRef(new Map<string, { x: number; y: number }>())
  const moveFrameRef = useRef(0)
  const pendingFitRef = useRef(false)
  const moveDeltaRef = useRef({ x: 0, y: 0 })
  const pointerClientRef = useRef<{ x: number; y: number } | null>(null)
  const applyMoveDragRef = useRef<(point: { x: number; y: number }) => void>(() => {})
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
  const [textColor, setTextColor] = useState('#1f2023')
  const [stickyColor, setStickyColor] = useState('#cfe8fb')
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
    const live = livePosRef.current
    const index = new Map((docRef.current?.items ?? []).map((entry) => [entry.id, entry]))
    for (const [id, position] of live) {
      const node = itemNodesRef.current.get(id)
      if (!node) continue
      const item = index.get(id)
      const box = item && item.kind === 'connector' ? itemBounds(item, index) : null
      node.style.left = `${position.x + (box ? box.x - (item?.x ?? 0) : 0)}px`
      node.style.top = `${position.y + (box ? box.y - (item?.y ?? 0) : 0)}px`
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
    const base = Math.max(1, strokeWidth)
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
      opacity: penOpacity,
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
  const pointerWorldRef = useRef<{ x: number; y: number } | null>(null)

  const worldRef = useRef<HTMLDivElement | null>(null)
  const chromeRef = useRef<HTMLDivElement | null>(null)
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
  const docRef = useRef<BoardDoc | null>(null)

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

  const viewSettleRef = useRef<number | null>(null)

  const applyDom = useCallback(
    (next: Viewport): void => {
      const world = worldRef.current
      const chrome = chromeRef.current
      const prev = viewRef.current
      const moved = next.zoom !== prev.zoom || next.x !== prev.x || next.y !== prev.y
      viewRef.current = next
      const transform = `translate3d(${size.width / 2 - next.x * next.zoom}px, ${
        size.height / 2 - next.y * next.zoom
      }px, 0) scale(${next.zoom})`
      if (chrome) chrome.style.transform = transform
      if (world) {
        world.style.transform = transform
        if (moved) {
          world.classList.add('boardview__world--live')
          if (viewSettleRef.current !== null) clearTimeout(viewSettleRef.current)
          viewSettleRef.current = setTimeout(() => {
            viewSettleRef.current = null
            worldRef.current?.classList.remove('boardview__world--live')
          }, 160)
        }
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
    void api.update.check(true)
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

  const assetProgressRef = useRef(new Map<string, { done: number; total: number }>())
  const progressTickRef = useRef<number | null>(null)
  const [assetProgress, setAssetProgress] = useState<Map<string, { done: number; total: number }>>(() => new Map())

  const pushAssetProgress = useCallback((itemId: string, value: { done: number; total: number } | null): void => {
    if (value) assetProgressRef.current.set(itemId, value)
    else assetProgressRef.current.delete(itemId)
    if (progressTickRef.current !== null) return
    progressTickRef.current = window.setTimeout(() => {
      progressTickRef.current = null
      setAssetProgress(new Map(assetProgressRef.current))
    }, 120)
  }, [])

  const pushedAssetsRef = useRef(new Set<string>())

  const shareAssets = useCallback(
    (entries: Array<{ itemId: string; dataUrl: string; file?: string; mime?: string }>): void => {
      if (!live.connected) return
      for (const entry of entries) {
        remoteAssetsRef.current.set(entry.itemId, entry.dataUrl)
        pushedAssetsRef.current.add(entry.itemId)
        live.sendChunked(
          `asset/${entry.itemId}`,
          JSON.stringify({ dataUrl: entry.dataUrl, file: entry.file ?? '', mime: entry.mime ?? '' })
        )
      }
      touchAssets()
    },
    [live, touchAssets]
  )

  const askedAssetsRef = useRef(new Set<string>())

  const requestRemoteAssets = useCallback(
    async (list: BoardItem[]): Promise<void> => {
      if (!live.connected) return
      let asked = false
      for (const item of list) {
        if (item.kind !== 'image' && item.kind !== 'document') continue
        const file = item.asset?.file
        if (!file || item.asset?.dataUrl || remoteAssetsRef.current.has(item.id) || askedAssetsRef.current.has(item.id)) continue
        if (item.kind === 'document' && (await api.board.hasAsset(props.docId, file))) continue
        asked = true
        askedAssetsRef.current.add(item.id)
        live.sendOps({ t: 'asset', item: item.id })
      }
      if (asked) touchAssets()
    },
    [live, touchAssets, props.docId]
  )

  const deliverRemoteAsset = useCallback(
    (itemId: string): void => {
      if (pushedAssetsRef.current.has(itemId)) return
      const source = itemsRef.current.find((item) => item.id === itemId)
      const owned = source?.kind === 'image' || source?.kind === 'document' ? source : undefined
      const file = owned?.asset?.file ?? ''
      const mime = owned?.asset?.mime ?? ''
      const held = remoteAssetsRef.current.get(itemId)
      if (held) {
        live.sendChunked(`asset/${itemId}`, JSON.stringify({ dataUrl: held, file, mime }))
        return
      }
      if (!file) return
      void api.board
        .assetData(props.docId, file)
        .then((dataUrl) => {
          if (dataUrl) live.sendChunked(`asset/${itemId}`, JSON.stringify({ dataUrl, file, mime }))
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
          const parsed = JSON.parse(payload) as { dataUrl?: string; file?: string; mime?: string }
          const itemId = id.slice('asset/'.length)
          if (!parsed.dataUrl || remoteAssetsRef.current.has(itemId) || pushedAssetsRef.current.has(itemId)) return
          const target = itemsRef.current.find((item) => item.id === itemId)
          if (target?.kind === 'document' && parsed.file) {
            pushAssetProgress(itemId, null)
            void api.board
              .saveAsset({ docId: props.docId, file: parsed.file, mime: parsed.mime ?? '', dataUrl: parsed.dataUrl })
              .then(() => {
                pushedAssetsRef.current.add(itemId)
                if (parsed.file) reloadFileHtml(parsed.file)
                toast('Файл получен', 'file')
              })
              .catch(() => fail('Файл не сохранился'))
            return
          }
          remoteAssetsRef.current.set(itemId, parsed.dataUrl)
          pushAssetProgress(itemId, null)
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
          void requestRemoteAssets(parsed.items)
          if (parsed.title) {
            setDoc((current) => (current ? { ...current, title: parsed.title } : current))
            setTitleDraft(parsed.title)
          }
          toast(`Получена доска «${parsed.title}»`, 'board')
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
        void requestRemoteAssets(next)
      } catch {
        fail('Не удалось применить изменения')
      }
    })
  }, [live, applyRemoteItems, withRemoteAssets, clearPreviewWhenPainted, requestRemoteAssets, toast, fail, props.docId, pushAssetProgress])

  useEffect(() => {
    live.onChunkProgress((id, done, total) => {
      if (!id.startsWith('asset/')) return
      const itemId = id.slice('asset/'.length)
      if (remoteAssetsRef.current.has(itemId)) return
      pushAssetProgress(itemId, done >= total ? null : { done, total })
    })
  }, [live, pushAssetProgress])

  useEffect(() => {
    if (live.connected || !assetProgressRef.current.size) return
    assetProgressRef.current.clear()
    setAssetProgress(new Map())
  }, [live.connected])

  useEffect(() => {
    live.onRemoteOps((message: LiveMessage) => {
      media.handle(message)
      if (message.t === 'asset') {
        deliverRemoteAsset(message.item)
      }
      if (message.t === 'perm') {
        toast(message.canEdit ? 'Вам разрешили редактировать' : 'Редактирование запрещено', message.canEdit ? 'editable' : 'readonly')
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
  const selectionSpeech = useMemo(() => {
    if (selectedItems.length === 0) return ''
    if (selectedItems.length > 1) return `Выбрано объектов: ${selectedItems.length}`
    const item = selectedItems[0]
    const text = ('plain' in item ? item.plain : '').trim().replace(/\s+/g, ' ').slice(0, 80)
    return text ? `${kindLabel(item.kind)}: ${text}` : kindLabel(item.kind)
  }, [selectedItems])
  const solidSelection = useMemo(() => selectedItems.filter((item): item is SolidItem => item.kind === 'solid'), [selectedItems])
  const imageSelection = useMemo(() => selectedItems.filter((item) => item.kind === 'image'), [selectedItems])
  const documentSelection = useMemo(
    () => selectedItems.filter((item): item is DocumentItem => item.kind === 'document'),
    [selectedItems]
  )
  const graphSelection = useMemo(() => selectedItems.filter((item): item is GraphItem => item.kind === 'graph'), [selectedItems])
  const connectorTarget = selectedItems.length === 1 && selectedItems[0].kind === 'connector' ? (selectedItems[0] as ConnectorItem) : null
  const selectionLocked = selectedItems.length > 0 && selectedItems.every((item) => item.locked)
  const editingItem = editing ? byId.get(editing.id) : undefined
  const movingItems = drag.kind === 'move' && drag.moved
  const resizeTargets =
    tool === 'select' && !readOnly && !editingItem && !movingItems && !cropEdit
      ? selectedItems.filter((item) => !item.locked && item.kind !== 'solid' && item.kind !== 'connector')
      : []
  useEffect(() => {
    const chrome = chromeRef.current
    const world = worldRef.current
    if (chrome && world) chrome.style.transform = world.style.transform
  }, [resizeTargets])
  useEffect(() => {
    setShapePoints((current) => (current && selection.size === 1 && selection.has(current) ? current : null))
  }, [selection])
  const shapePanelTarget =
    resizeTargets.length === 1 && resizeTargets[0].kind === 'shape' ? (resizeTargets[0] as ShapeItem) : null
  const pointsTarget = shapePanelTarget && shapePoints === shapePanelTarget.id ? shapePanelTarget : null
  const toolPanelKind: 'none' | 'selection' | 'solid' | 'graph' | 'create' | 'erase' | 'link' | 'text' | 'sticky' | 'image' | 'table' | 'pen' = (() => {
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
  const panelKind = paletteHidden ? 'none' : toolPanelKind
  useEffect(() => setPaletteHidden(false), [tool, selection])
  const paletteHead = (id: Tool, hint?: string): ReactNode => {
    const entry = toolEntry(id)
    return <PaletteHead icon={entry.icon} label={entry.label} keyHint={entry.key} hint={hint} />
  }
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
      const anchor = palette.classList.contains('toolpalette--brush')
        ? rail.querySelector<HTMLElement>('.toolbtn[data-active="true"]')
        : null
      const shift = anchor
        ? Math.max(0, anchor.getBoundingClientRect().top - railBox.top)
        : Math.max(0, (railBox.height - palette.getBoundingClientRect().height) / 2)
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
  const [missingDismissed, setMissingDismissed] = useState(-1)
  const showMissing = missingImages > 0 && missingDismissed !== missingImages

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
    const view = viewRef.current
    if (
      Math.abs(target.x - view.x) > 0.5 ||
      Math.abs(target.y - view.y) > 0.5 ||
      Math.abs(target.zoom - view.zoom) > 1e-4
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
    void live.startHost(() => docRef.current).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  }, [live, fail])

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
      void api.board.saveItems(props.docId, pending).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    },
    [props.docId, fail]
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
        .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
    },
    [setSettings, fail]
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
    docRef.current = doc
  }, [doc])

  useEffect(() => {
    const flush = (appIsClosing: boolean): void => {
      const pending = pendingRef.current
      if (!pending) return
      pendingRef.current = null
      void api.board.saveItems(props.docId, pending).catch((error: unknown) => {
        if (appIsClosing) return
        fail(error instanceof Error ? error.message : String(error))
      })
    }
    const onLeave = (): void => {
      flush(true)
    }
    const onHide = (): void => {
      if (document.visibilityState === 'hidden') flush(false)
    }
    window.addEventListener('pagehide', onLeave)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', onLeave)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [props.docId, fail])

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
    await api.board
      .saveItems(props.docId, pending)
      .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  }, [props.docId, fail])

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
    if (!doc) return
    if (readOnly) {
      toast('Правка доступна только ведущему', 'readonly')
      return
    }
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
    if (!doc) return
    if (readOnly) {
      toast('Правка доступна только ведущему', 'readonly')
      return
    }
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

  const panRef = useRef(false)
  useEffect(() => {
    panRef.current = drag.kind === 'pan'
  }, [drag.kind])

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
      const target = {
        zoom: next,
        x: view.x + offsetX / view.zoom - offsetX / next,
        y: view.y + offsetY / view.zoom - offsetY / next
      }
      if (panRef.current) {
        applyView(target, true)
        setDrag((current) =>
          current.kind === 'pan'
            ? {
                ...current,
                startX: event.clientX,
                startY: event.clientY,
                originX: target.x,
                originY: target.y,
                velocityX: 0,
                velocityY: 0,
                movedAt: performance.now()
              }
            : current
        )
        return
      }
      targetRef.current = target
      smoothStep()
    },
    [size, smoothStep, applyView]
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
    if (!node) return
    node.addEventListener('wheel', dispatchWheel, { passive: false })
    if (node.contains(document.activeElement)) return
    node.focus({ preventScroll: true })
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
  const [linkFromPoint, setLinkFromPoint] = useState<{ x: number; y: number } | null>(null)

  const addConnector = useCallback(
    (
      fromId: string,
      toId: string,
      fromPoint?: { x: number; y: number },
      toPoint?: { x: number; y: number }
    ): void => {
      if (!doc || readOnly || fromId === toId) return
      const source = doc.items.find((item) => item.id === fromId)
      const target = doc.items.find((item) => item.id === toId)
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
        color: shapeBorder,
        lineWidth: linkWidth,
        lineStyle: 'normal',
        startStroke: 'none',
        endStroke: linkArrow ? 'arrow' : 'none',
        startItemId: fromId,
        endItemId: toId,
        startOffset: fromPoint ? attachOffset(source, fromPoint) ?? undefined : undefined,
        endOffset: toPoint && target ? attachOffset(target, toPoint) ?? undefined : undefined
      }
      commit([...doc.items, connector])
      setSelection(new Set([connector.id]))
      setTool('select')
    },
    [doc, readOnly, commit, linkStyle, linkWidth, linkArrow, shapeBorder]
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

  const connectorAt = useCallback(
    (point: { x: number; y: number }): string | null => {
      if (!doc) return null
      const zoom = Math.max(0.05, viewRef.current.zoom)
      for (const item of doc.items) {
        if (item.kind !== 'connector') continue
        const path = sampleConnector(item, deriveConnectorPoints(item, byId))
        if (path.length < 2) continue
        if (distanceToStroke(point, path) > Math.max(5, item.lineWidth / 2 + 5) / zoom) continue
        return item.id
      }
      return null
    },
    [doc, byId]
  )

  const startMove = useCallback(
    (ids: Iterable<string>, point: { x: number; y: number }): void => {
      if (!doc || readOnly) return
      const origins = new Map<string, { x: number; y: number }>()
      for (const itemId of ids) {
        const target = byId.get(itemId)
        if (!target || target.locked) continue
        if (target.kind === 'connector' && (target.startItemId || target.endItemId)) continue
        origins.set(itemId, { x: target.x, y: target.y })
      }
      if (!origins.size) return
      dragBaseRef.current = doc.items
      if (snapEnabled) {
        const near: Placed[] = []
        for (const item of doc.items) {
          if (origins.has(item.id) || item.kind === 'connector') continue
          const box = item.kind === 'solid' ? itemBounds(item) : rotatedBox(itemBounds(item), item.rotation)
          near.push({ id: item.id, x: box.x, y: box.y, width: box.width, height: box.height })
        }
        snapTargetsRef.current = near
      } else {
        snapTargetsRef.current = []
      }
      setDrag({ kind: 'move', startX: point.x, startY: point.y, ids: [...origins.keys()], origins, moved: false })
    },
    [byId, doc, readOnly, snapEnabled]
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
          commitAgainst(doc.items, loaded.items)
          shareAssets([{ itemId: id, dataUrl }])
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
    [doc, readOnly, props.docId, remember, toast, fail, flushPending, live, shareAssets, commitAgainst]
  )

  const createAt = useCallback(
    async (point: { x: number; y: number }, kind: 'text' | 'sticky' | 'image' | 'solid' | 'graph' | 'table', columnWidth?: number): Promise<void> => {
      if (!doc || readOnly) return
      if (kind === 'table') {
        const columns = 3
        const rows = 3
        const columnWidth = 168
        const rowHeight = 48
        const fontSize = 14
        const id = uid('tbl_')
        const box = sheetSize(columns, rows, columnWidth, rowHeight, fontSize)
        const item: BoardItem = {
          id,
          kind: 'table',
          x: Math.round(point.x - box.width / 2),
          y: Math.round(point.y - box.height / 2),
          w: box.width,
          h: box.height,
          rotation: 0,
          z: doc.items.length,
          columns,
          rows,
          columnWidths: new Array(columns).fill(columnWidth),
          rowHeights: new Array(rows).fill(rowHeight),
          cells: new Array(columns * rows).fill(''),
          fontSize
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
        setTool('select')
        return
      }
      if (kind === 'image') {
        const dataUrl = await api.dialog.pickImage()
        if (!dataUrl) {
          toast('Картинка не выбрана', 'image')
          return
        }
        setTool('select')
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
        const column = columnWidth && columnWidth >= 60 ? Math.round(columnWidth) : 0
        const width = column || 120
        const height = Math.round(textSize * 1.34) + 4
        const item: BoardItem = {
          ...base,
          kind: 'text',
          w: width,
          h: height,
          content: '',
          plain: '',
          color: textColor,
          align: 'left',
          fontSize: textSize,
          fontFamily: "'Inter', 'Segoe UI', sans-serif",
          column: column ? true : undefined,
          urls: []
        }
        commit([...doc.items, item])
        setSelection(new Set([id]))
        setEditing({ id, html: item.content, plain: item.plain })
        freshEditingRef.current = id
        editingBaseRef.current = null
        editingDirtyRef.current = false
        setTool('select')
        return
      }
      const stickyFit = fitTextBox('', { width: 200, minHeight: 200, fontSize: textSize, padX: 8, padY: 6 })
      const item: BoardItem = {
        ...base,
        kind: 'sticky',
        w: stickyFit.width,
        h: stickyFit.height,
        content: '',
        plain: '',
        color: stickyColor,
        textColor: contrastColor(stickyColor),
        shape: 'square',
        textAlign: 'center',
        textAlignVertical: 'middle',
        fontSize: stickyFit.fontSize,
        urls: [],
        linkToFrame: false
      }
      commit([...doc.items, item])
      setSelection(new Set([id]))
      setEditing({ id, html: '', plain: '' })
      freshEditingRef.current = id
      editingBaseRef.current = null
      editingDirtyRef.current = false
      setTool('select')
    },
    [doc, readOnly, commit, toast, solidKind, strokeColor, size, textColor, stickyColor, textSize, addImageAt]
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
          color: shapeBorder,
          lineWidth: shapeStroke,
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
        ...shapeParams(drag.shape),
        content: '',
        plain: '',
        fillColor: 'transparent',
        borderColor: shapeBorder,
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
    [doc, shapeBorder, shapeStroke]
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
      setDrag({ kind: 'resize', id, handle, startX: point.x, startY: point.y, origin: box, base: item, moved: false })
    },
    [byId, doc, readOnly, toWorld]
  )

  const startAdjust = useCallback(
    (id: string, handle: ShapeAdjustHandle, event: React.PointerEvent): void => {
      event.stopPropagation()
      if (readOnly || !doc) return
      const item = byId.get(id)
      if (!item || item.locked || item.kind !== 'shape') return
      dragBaseRef.current = doc.items
      event.currentTarget.setPointerCapture?.(event.pointerId)
      const insert = /^add(\d+)$/.exec(handle)
      if (insert && isVertexShape(item.shape)) {
        const index = Number(insert[1])
        const list = shapeVertices(item.shape, item)
        const before = list[index]
        const after = list[(index + 1) % list.length]
        if (before && after) {
          const spot = {
            x: Math.round(((before.x + after.x) / 2) * 1000) / 1000,
            y: Math.round(((before.y + after.y) / 2) * 1000) / 1000
          }
          list.splice(index + 1, 0, spot)
          const withCorner = { ...item, vertices: list }
          setDoc({ ...doc, items: doc.items.map((entry) => (entry.id === id ? (withCorner as BoardItem) : entry)) })
          liveRef.current += 1
          const point = toWorld(event.clientX, event.clientY)
          setDrag({
            kind: 'adjust',
            id,
            handle: `v${index + 1}`,
            startX: point.x,
            startY: point.y,
            base: withCorner,
            moved: true
          })
          return
        }
      }
      const point = toWorld(event.clientX, event.clientY)
      setDrag({ kind: 'adjust', id, handle, startX: point.x, startY: point.y, base: item, moved: false })
    },
    [byId, doc, readOnly, toWorld]
  )

  const startLinkDot = useCallback(
    (id: string, event: React.PointerEvent): void => {
      event.stopPropagation()
      if (readOnly || !doc) return
      const item = byId.get(id)
      if (!item || item.locked) return
      const point = toWorld(event.clientX, event.clientY)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDrag({ kind: 'link', fromId: id, point, anchor: point })
    },
    [byId, doc, readOnly, toWorld]
  )

  const startBend = useCallback(
    (id: string, grip: BendGrip, event: React.PointerEvent): void => {
      event.stopPropagation()
      event.preventDefault()
      if (readOnly || !doc) return
      const item = byId.get(id)
      if (!item || item.kind !== 'connector' || item.locked) return
      const ends = deriveConnectorPoints(item, byId)
      if (ends.length < 2) return
      const split = grip.role === 'apex' ? bendByGrip(item, grip, { x: grip.x, y: grip.y }, ends[0], ends[1]) : item.bends ?? []
      const target: BendGrip =
        grip.role === 'apex' ? { role: 'joint', index: grip.index, x: grip.x, y: grip.y } : grip
      dragBaseRef.current = doc.items
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDrag({ kind: 'bend', id, grip: target, base: split, connector: item, from: ends[0], to: ends[1], moved: false })
    },
    [byId, doc, readOnly, toWorld]
  )

  const clearBend = useCallback(
    (id: string): void => {
      if (!doc || readOnly) return
      const item = byId.get(id)
      if (!item || item.kind !== 'connector' || !item.bends?.length) return
      commit(doc.items.map((entry) => (entry.id === id ? ({ ...entry, bends: undefined } as BoardItem) : entry)))
    },
    [byId, commit, doc, readOnly]
  )

  const straightenBend = useCallback(
    (id: string, grip: BendGrip): void => {
      if (!doc || readOnly) return
      const item = byId.get(id)
      if (!item || item.kind !== 'connector' || !item.bends?.length) return
      const ends = deriveConnectorPoints(item, byId)
      if (ends.length < 2) return
      const bends = straightenConnector(item, grip, ends[0], ends[1])
      commit(
        doc.items.map((entry) =>
          entry.id === id ? ({ ...entry, bends: bends.length ? bends : undefined } as BoardItem) : entry
        )
      )
    },
    [byId, commit, doc, readOnly]
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
      if (!item || item.kind !== 'image') return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      if (item.locked) {
        toast('Объект заблокирован: снимите замок, чтобы обрезать', 'lock')
        return
      }
      const asset = item.asset
      const src = asset?.file ? assetUrl(asset.file) : asset?.dataUrl ?? asset?.sourceUrl ?? ''
      if (!src) return
      const natural = await imageSizeOf(src)
      if (!natural || !natural.width || !natural.height) {
        toast('Картинку не обрезать: файл не открывается', 'image')
        return
      }
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
    [byId, assetUrl, readOnly, toast]
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
    pushPreviewRef.current({ t: 'preview', kind: 'text', id: editing.id, content: editing.html, plain: editing.plain })
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
        if (current.kind === 'textdraft') return { ...current, currentX: point.x, currentY: point.y }
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
      if (target.closest('.overlay, .statusbar, .inspector, .topbar')) return
      if (menu) {
        setMenu(null)
        return
      }
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
      if (present) return
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
      if (tool === 'sticky' || tool === 'image' || tool === 'solid' || tool === 'graph' || tool === 'table') {
        if (event.button !== 0) return
        if (tool === 'sticky') event.preventDefault()
        void createAt(point, tool)
        return
      }
      if (tool === 'text') {
        if (event.button !== 0 || !doc || readOnly) return
        const under = itemAt(point)
        const existing = under ? byId.get(under) : undefined
        if (existing && (existing.kind === 'text' || existing.kind === 'sticky' || existing.kind === 'shape')) {
          event.preventDefault()
          startEditing(existing.id)
          return
        }
        event.preventDefault()
        setDrag({ kind: 'textdraft', startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
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
          setLinkFromPoint(null)
          return
        }
        if (linkFrom && linkFrom !== under) {
          addConnector(linkFrom, under, linkFromPoint ?? undefined, point)
          setLinkFrom(null)
          setLinkFromPoint(null)
          return
        }
        setLinkFrom(under)
        setLinkFromPoint(point)
        setDrag({ kind: 'link', fromId: under, point, anchor: point })
        return
      }
      if (tool === 'select' && !editing && event.button === 0) {
        const hit = connectorAt(point)
        if (hit) {
          const next = new Set(event.shiftKey ? selection : [])
          if (event.shiftKey && next.has(hit)) next.delete(hit)
          else next.add(hit)
          setSelection(next)
          startMove(next, point)
          return
        }
      }
      setEraserCursor(null)
      if (event.button !== 0) return
      setDrag({ kind: 'rubber', startX: point.x, startY: point.y, currentX: point.x, currentY: point.y })
    },
    [
      toWorld,
      toScreen,
      tool,
      doc,
      readOnly,
      eraseAt,
      createTool,
      createShape,
      createAt,
      itemAt,
      byId,
      linkFrom,
      linkFromPoint,
      addConnector,
      menu,
      connectorAt,
      startMove,
      editing,
      selection,
      present
    ]
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

  const holdBoardPointer = useCallback((event: React.PointerEvent): void => {
    pointerClientRef.current = { x: event.clientX, y: event.clientY }
    try {
      wrapRef.current?.setPointerCapture(event.pointerId)
    } catch {
      void 0
    }
  }, [])

  const onItemPointerDown = useCallback(
    (id: string, event: React.PointerEvent) => {
      if (event.button !== 0) return
      if (tool === 'pen' && !editing) {
        const itemNow = byId.get(id)
        if (itemNow?.locked) return
        if (itemNow?.kind === 'solid' && !readOnly) {
          const point = toWorld(event.clientX, event.clientY)
          const hit = faceAtLocal(itemNow, point)
          if (!hit) return
          const local = facePointOf(itemNow, hit.id, point)
          if (!local) return
          event.stopPropagation()
          holdBoardPointer(event)
          strokePointsRef.current = [local]
          dragBaseRef.current = doc?.items ?? null
          setSelection(new Set([id]))
          setDrag({ kind: 'face', id, face: hit.id, points: strokePointsRef.current, straight: event.shiftKey, done: [] })
          return
        }
        if (!doc || readOnly) return
        event.stopPropagation()
        holdBoardPointer(event)
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
        if (itemNow.locked) return
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
      holdBoardPointer(event)
      const item = byId.get(id)
      if (item?.locked) {
        const alreadySelected = selection.has(id)
        setSelection((current) => {
          if (!event.shiftKey) return new Set([id])
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        if (!alreadySelected) toast('Объект заблокирован', 'lock')
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
      startMove(next, point)
    },
    [selection, toWorld, byId, readOnly, tool, editing, doc, toast, solidMode, faceAtLocal, facePointOf, paintSolidFace, strokeColor, throughAnchor, commit, remember, strokeWidth, startMove, holdBoardPointer]
  )

  const applyMoveDrag = useCallback(
    (point: { x: number; y: number }): void => {
      if (drag.kind !== 'move' || !doc) return
      if (!drag.moved) solidMoveRef.current = { x: 0, y: 0 }
      let dx = point.x - drag.startX
      let dy = point.y - drag.startY
      if (snapEnabled && drag.origins.size) {
        const moving = unionBox(
          selectedItems
            .filter((item) => drag.origins.has(item.id))
            .map((item) => (item.kind === 'solid' ? itemBounds(item, byId) : rotatedBox(itemBounds(item, byId), item.rotation)))
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
    [drag, doc, snapEnabled, snapGrid, gridSize, selectedItems, showGuides, pushPreview, byId, solidsCollide, flushMovePositions]
  )

  useEffect(() => {
    applyMoveDragRef.current = applyMoveDrag
  }, [applyMoveDrag])

  useEffect(() => {
    const glides = drag.kind === 'move' || drag.kind === 'rubber' || drag.kind === 'textdraft' || drag.kind === 'link'
    if (!glides) return
    const edge = 30
    const limit = 900
    let last = performance.now()
    let frame = 0
    const glide = (now: number): void => {
      const dt = Math.min(64, now - last)
      last = now
      const client = pointerClientRef.current
      const rect = canvasRectRef.current
      const current = viewRef.current
      if (client && size.width && size.height) {
        const insetX = Math.min(client.x - rect.left, rect.left + size.width - client.x)
        const insetY = Math.min(client.y - rect.top, rect.top + size.height - client.y)
        const centerX = rect.left + size.width / 2
        const centerY = rect.top + size.height / 2
        const push = (inset: number, side: number): number => {
          if (inset >= edge) return 0
          const ratio = Math.min(1, (edge - inset) / edge)
          return ratio * ratio * side
        }
        const pushX = push(insetX, Math.sign(client.x - centerX))
        const pushY = push(insetY, Math.sign(client.y - centerY))
        if (pushX || pushY) {
          const step = (limit * dt) / 1000 / current.zoom
          applyView({ ...current, x: current.x + step * pushX, y: current.y + step * pushY })
          const world = toWorld(client.x, client.y)
          if (drag.kind === 'move') applyMoveDragRef.current(world)
          else {
            overlayPointRef.current = world
            scheduleOverlayRender()
          }
        }
      }
      frame = requestAnimationFrame(glide)
    }
    frame = requestAnimationFrame(glide)
    return () => cancelAnimationFrame(frame)
  }, [drag.kind, size, applyView, toWorld, scheduleOverlayRender])

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
      pointerClientRef.current = { x: event.clientX, y: event.clientY }
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
        const base = Math.max(1, strokeWidth)
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
          width: Math.max(1, strokeWidth),
          opacity: penOpacity
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
          items: doc.items.map((entry) =>
            entry.id === drag.id ? resizedItem(drag.base, drag.origin, { x, y, width, height }, drag.handle) : entry
          )
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
      if (drag.kind === 'adjust' && doc) {
        const item = byId.get(drag.id)
        if (!item || item.kind !== 'shape') return
        const center = { x: drag.base.x + drag.base.w / 2, y: drag.base.y + drag.base.h / 2 }
        const local = rotatePoint({ x: point.x - center.x, y: point.y - center.y }, -(drag.base.rotation || 0))
        const raw = { x: local.x + drag.base.w / 2, y: local.y + drag.base.h / 2 }
        const vertexIndex = /^v(\d+)$/.exec(drag.handle)
        const spot =
          vertexIndex && isVertexShape(drag.base.shape)
            ? snapVertexPoint(
                drag.base.shape,
                Number(vertexIndex[1]),
                raw,
                drag.base.w,
                drag.base.h,
                drag.base,
                7 / Math.max(0.05, viewRef.current.zoom)
              )
            : raw
        const params = shapeHandleValue(drag.base.shape, drag.handle, spot, drag.base.w, drag.base.h, drag.base)
        setDoc({
          ...doc,
          items: doc.items.map((entry) => (entry.id === drag.id ? ({ ...entry, ...params } as BoardItem) : entry))
        })
        liveRef.current += 1
        if (!drag.moved) setDrag({ ...drag, moved: true })
        return
      }
      if (drag.kind === 'bend' && doc) {
        const item = doc.items.find((entry) => entry.id === drag.id)
        if (item && item.kind === 'connector') {
          const bends = bendByGrip({ ...item, bends: drag.base }, drag.grip, point, drag.from, drag.to)
          setDoc({
            ...doc,
            items: doc.items.map((entry) => (entry.id === drag.id ? ({ ...entry, bends } as BoardItem) : entry))
          })
          liveRef.current += 1
        }
        if (!drag.moved) setDrag({ ...drag, moved: true })
        return
      }
      if (drag.kind === 'rubber' || drag.kind === 'textdraft') {
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
        let tip = point
        if (event.shiftKey && drag.tool === 'shape') {
          const side = Math.max(Math.abs(point.x - drag.startX), Math.abs(point.y - drag.startY))
          tip = {
            x: drag.startX + (point.x < drag.startX ? -side : side),
            y: drag.startY + (point.y < drag.startY ? -side : side)
          }
        }
        overlayPointRef.current = tip
        scheduleOverlayRender()
        const rawX = tip.x - drag.startX
        const rawY = tip.y - drag.startY
        const dragged = Math.hypot(rawX, rawY) > 8 / viewRef.current.zoom
        const stroke = drag.tool === 'line' || drag.tool === 'arrow'
        const width = dragged ? Math.abs(rawX) : stroke ? 1 : 220
        const height = dragged ? Math.abs(rawY) : stroke ? 1 : 220
        const left = dragged ? Math.min(drag.startX, tip.x) : drag.startX - (stroke ? 0 : width / 2)
        const top = dragged ? Math.min(drag.startY, tip.y) : drag.startY - (stroke ? 0 : height / 2)
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
                { x: tip.x - left, y: tip.y - top }
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
      if (drag.kind !== 'move') return
      applyMoveDrag(point)
    },
    [drag, toWorld, toScreen, applyView, doc, eraseAt, faceAtLocal, facePointOf, scheduleThroughRender, throughAnchor, byId, applyMoveDrag]
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
          setTool('select')
          if (created.kind === 'connector' && !created.startItemId) setLinkFrom(created.id)
          if (created.kind === 'shape') {
            setEditing({ id: created.id, html: '', plain: '' })
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
          addConnector(drag.fromId, target, drag.anchor, drag.point)
          setLinkFrom(null)
          setLinkFromPoint(null)
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
      if (drag.kind === 'adjust' && doc) {
        if (drag.moved && dragBaseRef.current) commitAgainst(dragBaseRef.current, doc.items)
        dragBaseRef.current = null
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'bend' && doc) {
        if (drag.moved && dragBaseRef.current) commitAgainst(dragBaseRef.current, doc.items)
        dragBaseRef.current = null
        setDrag({ kind: 'idle' })
        return
      }
      if (drag.kind === 'textdraft' && doc) {
        setDrag({ kind: 'idle' })
        const dx = drag.currentX - drag.startX
        const dy = drag.currentY - drag.startY
        const dragged = Math.hypot(dx, dy) > 8 / Math.max(0.05, viewRef.current.zoom)
        if (dragged && Math.abs(dx) >= 60) {
          void createAt({ x: Math.min(drag.startX, drag.currentX), y: drag.startY }, 'text', Math.abs(dx))
          return
        }
        void createAt({ x: drag.startX, y: drag.startY }, 'text')
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
            const box =
              item.kind === 'solid' ? itemBounds(item, byId) : rotatedBox(itemBounds(item, byId), item.rotation)
            return box.x < rect.x + rect.width && box.x + box.width > rect.x && box.y < rect.y + rect.height && box.y + box.height > rect.y
          })
          .map((item) => item.id)
        setSelection((current) => (event.shiftKey ? new Set([...current, ...picked]) : new Set(picked)))
      } else if (event.button === 0 && !event.shiftKey) {
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
      const index = new Map(next.map((entry) => [entry.id, entry]))
      for (const [id, node] of itemNodesRef.current) {
        if (!moved.has(id)) continue
        const item = index.get(id)
        if (!item || !node) continue
        const box = item.kind === 'connector' ? itemBounds(item, index) : null
        node.style.left = `${item.x + (box ? box.x - item.x : 0)}px`
        node.style.top = `${item.y + (box ? box.y - item.y : 0)}px`
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
      if (drag.button === 2 && !drag.moved && !present) {
        const hit = itemAt(toWorld(event.clientX, event.clientY))
        if (hit && !selection.has(hit) && !readOnly) setSelection(new Set([hit]))
        setMenu({ x: event.clientX, y: event.clientY, onItem: hit ?? '' })
      }
    }
    setDrag({ kind: 'idle' })
    },
    [drag, doc, persist, remember, commit, commitAgainst, strokeColor, strokeWidth, penOpacity, applyView, startInertia, size, itemAt, toWorld, createFromDrag, clearPreview, byId, addConnector, penMode, selection, readOnly, present]
  )

  const deleteItems = useCallback(
    (ids: string[]) => {
      if (!doc) return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      const remove = new Set(ids.filter((id) => !byId.get(id)?.locked))
      if (!remove.size) {
        toast(ids.length ? 'Все выбранные объекты заблокированы' : 'Сначала выделите объект', ids.length ? 'lock' : 'select')
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
      if (!doc) return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      if (!ids.length) {
        toast('Сначала выделите объект', 'copy')
        return
      }
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
      if (!doc) return
      const source = doc.items.filter((item) => ids.includes(item.id))
      if (!source.length) {
        toast('Сначала выделите объект', 'select')
        return
      }
      writeObjectClipboard(props.docId, source)
      const html = encodeLiroClipboard({ version: 1, docId: props.docId, items: source })
      void api.clipboard
        .writeHtml(html, source.map((item) => ('plain' in item ? item.plain : '')).filter(Boolean).join('\n'))
        .catch(() => toast('В чужие программы не скопировано: вставка только в Liro', 'clipboard'))
      toast('Объекты скопированы', 'copy')
    },
    [doc, props.docId, toast]
  )

  const cutItems = useCallback(
    (ids: string[]) => {
      if (!doc) return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      const keep = ids.filter((id) => !byId.get(id)?.locked)
      const source = doc.items.filter((item) => keep.includes(item.id))
      if (!source.length) {
        deleteItems(ids)
        return
      }
      writeObjectClipboard(props.docId, source)
      const html = encodeLiroClipboard({ version: 1, docId: props.docId, items: source })
      void api.clipboard
        .writeHtml(html, source.map((item) => ('plain' in item ? item.plain : '')).filter(Boolean).join('\n'))
        .catch(() => toast('В чужие программы не скопировано: вставка только в Liro', 'clipboard'))
      deleteItems(ids)
      toast('Объекты вырезаны', 'copy')
    },
    [doc, readOnly, byId, props.docId, deleteItems, toast]
  )

  const pasteShift = useCallback(
    (items: BoardItem[], sameBoard: boolean): { dx: number; dy: number } => {
      const pointer = pointerWorldRef.current
      if (!items.length || (!pointer && sameBoard)) return { dx: 28, dy: 28 }
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
      const target = pointer ?? viewRef.current
      if (sameBoard && target.x >= minX && target.x <= maxX && target.y >= minY && target.y <= maxY) return { dx: 28, dy: 28 }
      return {
        dx: Math.round(target.x - (minX + maxX) / 2),
        dy: Math.round(target.y - (minY + maxY) / 2)
      }
    },
    []
  )

  const pasteObjects = useCallback(async () => {
    if (!doc) return
    if (readOnly) {
      toast('Правка доступна только ведущему', 'readonly')
      return
    }
    const stored = readObjectClipboard()
    const source = stored?.items ?? []
    if (!source.length) {
      toast('В буфере нет объектов Liro', 'clipboard')
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
    if (!doc || readOnly) return
    if (selection.size < 2) {
      toast('Для группы нужно выделить минимум два объекта', 'layer')
      return
    }
    const groupId = uid('grp_')
    const target = new Set(selection)
    commit(doc.items.map((item) => (target.has(item.id) ? ({ ...item, groupId } as BoardItem) : item)))
    toast('Объекты объединены в группу', 'layer')
  }, [doc, commit, readOnly, selection, toast])

  const ungroupSelection = useCallback(() => {
    if (!doc || readOnly) return
    const groups = new Set(selectedItems.map((item) => item.groupId).filter((value): value is string => !!value))
    if (!groups.size) {
      toast('В выделении нет групп', 'layer')
      return
    }
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

  const shiftSelectionLayer = useCallback(
    (forward: boolean) => {
      if (!doc) return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      if (!selection.size) return
      const ordered = [...doc.items].sort((a, b) => a.z - b.z)
      if (forward) {
        for (let i = ordered.length - 2; i >= 0; i -= 1) {
          if (selection.has(ordered[i].id) && !selection.has(ordered[i + 1].id)) [ordered[i], ordered[i + 1]] = [ordered[i + 1], ordered[i]]
        }
      } else {
        for (let i = 1; i < ordered.length; i += 1) {
          if (selection.has(ordered[i].id) && !selection.has(ordered[i - 1].id)) [ordered[i], ordered[i - 1]] = [ordered[i - 1], ordered[i]]
        }
      }
      commit(ordered.map((item, index) => ({ ...item, z: index } as BoardItem)))
    },
    [doc, commit, readOnly, selection, toast]
  )

  const patchItem = useCallback(
    (id: string, patch: Partial<BoardItem>, silent?: boolean) => {
      if (!doc || readOnly) return
      const base = itemsRef.current
      const next = base.map((item) => (item.id === id ? withPatch(item, patch) : item))
      if (!changed(base, next)) return
      if (silent) persist(next)
      else commit(next)
    },
    [doc, commit, persist, readOnly]
  )

  const patchConnector = useCallback(
    (id: string, patch: Partial<ConnectorItem>, silent?: boolean): void => {
      if (!doc || readOnly) return
      const base = itemsRef.current
      const next = base.map((entry) => (entry.id === id && entry.kind === 'connector' ? ({ ...entry, ...patch } as BoardItem) : entry))
      if (!changed(base, next)) return
      if (silent) persist(next)
      else commit(next)
    },
    [doc, commit, persist, readOnly]
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

  const patchItemsSilent = useCallback(
    (ids: string[], patch: Partial<BoardItem>) => {
      if (!doc || readOnly || !ids.length) return
      const target = new Set(ids)
      const base = itemsRef.current
      const next = base.map((item) => (target.has(item.id) ? withPatch(item, patch) : item))
      if (changed(base, next)) persist(next)
    },
    [doc, persist, readOnly]
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

  const lockNoticeAt = useRef(0)

  const blockLockedPatch = useCallback(
    (ids: string[]): boolean => {
      if (!ids.length || !ids.every((id) => byId.get(id)?.locked)) return false
      const now = Date.now()
      if (now - lockNoticeAt.current > 2500) {
        lockNoticeAt.current = now
        toast('Объект заблокирован: снимите замок, чтобы менять свойства', 'lock')
      }
      return true
    },
    [byId, toast]
  )

  const inspectorPatch = useCallback(
    (id: string, patch: Partial<BoardItem>): void => {
      if (blockLockedPatch([id])) return
      patchItem(id, patch)
    },
    [blockLockedPatch, patchItem]
  )

  const inspectorPatchMany = useCallback(
    (ids: string[], patch: Partial<BoardItem>): void => {
      if (blockLockedPatch(ids)) return
      patchItems(ids, patch)
    },
    [blockLockedPatch, patchItems]
  )

  const inspectorPatchLive = useCallback(
    (ids: string[], patch: Partial<BoardItem>): void => {
      if (blockLockedPatch(ids)) return
      patchItemsLive(ids, patch)
    },
    [blockLockedPatch, patchItemsLive]
  )

  const fitTextHeight = useCallback(
    (id: string, height: number) => {
      if (readOnly || dragKindRef.current !== 'idle') return
      if (editing && editing.id === id) return
      const item = itemsRef.current.find((entry) => entry.id === id)
      if (!item || item.kind !== 'text' || item.locked) return
      if (Math.abs(item.h - height) <= 1) return
      patchItemsSilent([id], { h: height })
    },
    [readOnly, editing, patchItemsSilent]
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
      if (!doc) return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      const item = byId.get(id)
      if (!item || item.kind !== 'image') return
      if (item.locked) {
        toast('Объект заблокирован: снимите замок, чтобы заменить картинку', 'lock')
        return
      }
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

  const replaceImagesFromClipboard = useCallback(async (): Promise<void> => {
    if (!doc || readOnly || imageSelection.length === 0) return
    const dataUrl = await api.clipboard.readImage()
    if (!dataUrl) {
      toast('В буфере обмена нет картинки', 'clipboard')
      return
    }
    for (const item of imageSelection) await applyImageData(item.id, dataUrl)
    toast(imageSelection.length === 1 ? 'Картинка заменена' : `Картинок заменено: ${imageSelection.length}`, 'image')
  }, [doc, readOnly, imageSelection, applyImageData, toast])

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

  const addDroppedFile = useCallback(
    async (file: File, point: { x: number; y: number }): Promise<void> => {
      if (!doc || readOnly) return
      const dataUrl = await readDataUrl(file)
      if (!dataUrl) {
        toast('Файл не прочитан', 'file')
        return
      }
      try {
        await flushPending()
        const saved = await api.board.saveFile({ docId: props.docId, name: file.name, mime: file.type, dataUrl })
        const item: DocumentItem = {
          id: uid('doc_'),
          kind: 'document',
          x: Math.round(point.x - FILE_WIDTH / 2),
          y: Math.round(point.y - FILE_HEIGHT / 2),
          w: FILE_WIDTH,
          h: FILE_HEIGHT,
          rotation: 0,
          z: doc.items.length,
          title: saved.name,
          asset: { file: saved.file, mime: saved.mime, bytes: saved.bytes, local: true },
          excerpt: saved.excerpt
        }
        commit([...doc.items, item])
        if (live.connected) shareAssets([{ itemId: item.id, dataUrl, file: saved.file, mime: saved.mime }])
        setSelection(new Set([item.id]))
        toast('Файл на доске', 'file')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [doc, readOnly, props.docId, flushPending, commit, live, shareAssets, setSelection, toast, fail]
  )

  const placeFileImages = useCallback(
    async (item: DocumentItem): Promise<void> => {
      if (!doc || readOnly) return
      const file = item.asset?.file
      if (!file) {
        toast('Файл ещё не получен', 'file')
        return
      }
      try {
        const images = await api.board.fileImages(props.docId, file)
        if (images.length === 0) {
          toast('В файле нет картинок', 'file')
          return
        }
        await applyImageFiles(
          images.map((image) => image.dataUrl),
          { x: item.x + item.w + 260, y: item.y + 140 },
          []
        )
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [doc, readOnly, props.docId, applyImageFiles, fail, toast]
  )

  const onDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>): Promise<void> => {
      event.preventDefault()
      setDropActive(false)
      const entries = Array.from(event.dataTransfer.files)
      if (entries.length === 0) return
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      entries.sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      const point = toWorld(event.clientX, event.clientY)
      const images = entries.filter(isImageFile)
      if (images.length > 0) await applyImageFiles(await Promise.all(images.map(readDataUrl)), point)
      const files = entries.filter((file) => !isImageFile(file))
      for (const [index, file] of files.entries())
        await addDroppedFile(file, { x: point.x + index * (FILE_WIDTH + 60), y: point.y })
    },
    [applyImageFiles, addDroppedFile, toWorld, readOnly, toast]
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
      try {
        await api.preview.open({ kind: web ? 'web' : 'file', title, src })
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [ask, linkPreview, fail]
  )

  const openItemPreview = useCallback(
    (item: BoardItem): void => {
      const raw = (item.raw ?? {}) as { url?: string; link?: string; source?: string; embedUrl?: string; title?: string }
      const asset = (item as { asset?: { file?: string; src?: string; sourceUrl?: string } }).asset
      const title = (item as { title?: string }).title || raw.title || (item.kind === 'image' ? 'Картинка' : 'Объект')
      const file = asset?.file ? assetUrl(asset.file) : ''
      if (file) {
        void api.preview.open({ kind: 'file', title, src: file }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
        return
      }
      const sourceUrl = asset?.sourceUrl ?? asset?.src ?? ''
      const url = sourceUrl || raw.url || raw.link || raw.source || raw.embedUrl || ''
      if (url) {
        void api.preview.open({ kind: 'web', title, src: url }).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
        return
      }
      toast('У объекта нет ни файла, ни ссылки', 'link')
    },
    [assetUrl, toast, fail]
  )

const navigateTo = useCallback(
    (id: string) => {
      const item = byId.get(id)
      if (!item) return
      fitTo(itemBounds(item, byId), 2)
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

  const editorSizeRef = useRef<{ width: number; height: number } | null>(null)
  const editingBaseRef = useRef<BoardItem[] | null>(null)
  const editingDirtyRef = useRef(false)
  const autosaveTimerRef = useRef<number | null>(null)

  const startEditing = useCallback(
    (id: string) => {
      const item = byId.get(id)
      if (!item) return
      if (item.kind === 'document') {
        setSelection(new Set([id]))
        void openItemPreview(item)
        return
      }
      if (readOnly) {
        toast('Правка доступна только ведущему', 'readonly')
        return
      }
      if (item.kind === 'image') {
        if (item.locked) {
          toast('Объект заблокирован: снимите замок, чтобы обрезать или заменить', 'lock')
          return
        }
        setSelection(new Set([id]))
        const asset = item.asset
        const src = asset?.file ? assetUrl(asset.file) : asset?.dataUrl ?? asset?.sourceUrl ?? ''
        if (src) void startCrop(id)
        else void replaceImage(id, 'clipboard')
        return
      }
      if (item.kind !== 'text' && item.kind !== 'sticky' && item.kind !== 'shape') return
      if (item.locked) {
        toast('Объект заблокирован: снимите замок, чтобы редактировать текст', 'lock')
        return
      }
      setSelection(new Set([id]))
      const html = sanitizeRichHtml(item.content || '') || richHtmlFromPlain(item.plain || '')
      editorSizeRef.current = null
      freshEditingRef.current = null
      editingBaseRef.current = itemsRef.current
      editingDirtyRef.current = false
      setEditing({ id, html, plain: plainFromRichHtml(html) })
    },
    [byId, readOnly, replaceImage, startCrop, assetUrl, openItemPreview, toast]
  )

  const writeEditing = useCallback(
    (close: boolean) => {
      if (!editing || !doc) return
      const html = sanitizeRichHtml(editing.html)
      const value = plainFromRichHtml(html)
      const measured = editorSizeRef.current
      editorSizeRef.current = null
      const item = byId.get(editing.id)
      if (close) {
        setEditing(null)
        setTextFormat(emptyFormat)
        clearPreview()
        if (autosaveTimerRef.current !== null) {
          window.clearTimeout(autosaveTimerRef.current)
          autosaveTimerRef.current = null
        }
      }
      if (!item) return
      if (item.kind !== 'text' && item.kind !== 'sticky' && item.kind !== 'shape') return
      const blankNewSticky = item.kind === 'sticky' && freshEditingRef.current === editing.id
      if (!value && !item.sourceType && (item.kind === 'text' || blankNewSticky)) {
        if (!close) return
        setSelection(new Set())
        editingBaseRef.current = null
        freshEditingRef.current = null
        commit(doc.items.filter((entry) => entry.id !== editing.id))
        return
      }
      const untouched = item.plain === value && item.content === html
      if (untouched && !editingDirtyRef.current) return
      const next = doc.items.map((entry) => {
        if (entry.id !== editing.id) return entry
        if (entry.kind === 'text' || entry.kind === 'sticky' || entry.kind === 'shape') {
          const base = { ...entry, content: html, plain: value }
          if (entry.sourceType) return base as BoardItem
          if (entry.kind === 'text') {
            if (entry.column) {
              const inner = measured ? measured.height : measureTextBox(value, entry.fontSize, entry.w - 4).height + 4
              return { ...base, h: Math.max(Math.round(entry.fontSize * 1.3), Math.round(inner)) } as BoardItem
            }
            if (measured) {
              return {
                ...base,
                w: clamp(Math.round(measured.width), 24, 4000),
                h: clamp(Math.round(measured.height), Math.round(entry.fontSize * 1.3), 4000)
              } as BoardItem
            }
            const inner = measureTextBox(value, entry.fontSize, entry.w - 4)
            return { ...base, h: Math.max(Math.round(entry.fontSize * 1.3), inner.height + 4) } as BoardItem
          }
          if (entry.kind === 'sticky') {
            const fit = fitTextBox(value, { width: entry.w, minHeight: entry.h, fontSize: entry.fontSize, padX: 8, padY: 6 })
            return { ...base, h: fit.height, fontSize: fit.fontSize } as BoardItem
          }
          return base as BoardItem
        }
        return entry
      })
      if (!close) {
        editingDirtyRef.current = true
        persist(next)
        return
      }
      const base = editingBaseRef.current
      editingBaseRef.current = null
      if (base) commitAgainst(base, next)
      else commit(next)
    },
    [editing, doc, byId, commit, commitAgainst, persist, clearPreview]
  )

  const commitEditing = useCallback(() => writeEditing(true), [writeEditing])

  const autosaveEditing = useCallback(() => {
    if (autosaveTimerRef.current !== null) window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null
      writeEditing(false)
    }, 700)
  }, [writeEditing])

  const editingBox = editingItem ? itemBounds(editingItem, byId) : null
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
  const freshEditingRef = useRef<string | null>(null)
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
    const panelHeight = 70
    const knobClear = 46
    const gap = 10
    const screenMiddle = (textPanelBox.x + textPanelBox.width / 2 - view.x) * zoom + half
    const screenTop = (textPanelBox.y - view.y) * zoom + center
    const screenBottom = screenTop + textPanelBox.height * zoom
    const above = screenTop - knobClear - panelHeight
    const below = screenBottom + gap
    const fitsAbove = above >= 12
    const fitsBelow = below + panelHeight <= size.height - 12
    const targetScreenY = fitsAbove || !fitsBelow ? above : below
    const width = Math.min(392, size.width - 24)
    const screenX = clamp(screenMiddle - width / 2, 12, Math.max(12, size.width - width - 12))
    const screenY = clamp(targetScreenY, 12, Math.max(12, size.height - panelHeight - 12))
    return {
      x: (screenX - half) / zoom + view.x,
      y: (screenY - center) / zoom + view.y
    }
  })()

  const panelItem = editing && editingItem ? editingItem : textSelection[0] || null
  const panelHasFill = textSelection.some((item) => item.kind === 'sticky')
  const panelHasBorder = textSelection.some((item) => item.kind === 'shape')
  const textPanelShown =
    !!textPanelSpot && drag.kind !== 'move' && (!!editing || (textSelection.length > 0 && tool === 'select'))

  const keepFocus = (event: React.MouseEvent): void => {
    if ((event.target as HTMLElement).tagName === 'INPUT') return
    event.preventDefault()
  }

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
          if (item.kind === 'text') return { ...item, color }
          if (item.kind === 'sticky' || item.kind === 'shape') return { ...item, textColor: color }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const paintFill = useCallback(
    (color: string) => {
      if (!doc || readOnly) return
      const targets = new Set(textSelection.map((item) => item.id))
      if (!targets.size) return
      commit(
        doc.items.map((item) => {
          if (!targets.has(item.id)) return item
          if (item.kind === 'sticky') return { ...item, color }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const paintBorder = useCallback(
    (color: string) => {
      if (!doc || readOnly) return
      const targets = new Set(textSelection.map((item) => item.id))
      if (!targets.size) return
      commit(
        doc.items.map((item) => {
          if (!targets.has(item.id)) return item
          if (item.kind === 'shape') return { ...item, borderColor: color }
          return item
        })
      )
    },
    [doc, readOnly, commit, textSelection]
  )

  const syncEditor = useCallback((): void => {
    const node = activeEditorNode()
    if (!node) return
    const html = node.innerHTML
    setEditing((current) => (current ? { ...current, html, plain: plainFromRichHtml(html) } : current))
  }, [])

  const runFormat = useCallback(
    (command: 'bold' | 'italic' | 'underline' | 'strike' | 'list' | 'ordered') => {
      if (!editing) return
      applyFormat(command)
      syncEditor()
      setTextFormat(currentFormat())
    },
    [editing, syncEditor]
  )

  const pickTextColor = useCallback(
    (color: string) => {
      const node = editing ? activeEditorNode() : null
      const selection = window.getSelection()
      const anchor = selection?.anchorNode ?? null
      if (node && anchor && selection && !selection.isCollapsed && node.contains(anchor)) {
        applyTextColor(color)
        syncEditor()
        return
      }
      paintText(color)
    },
    [editing, syncEditor, paintText]
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
        toast('В буфере обмена нет объектов для вставки', 'clipboard')
        return
      }
      const bounds = pastePayloadBounds(payload.items)
      const view = viewRef.current
      const target = pointerWorldRef.current ?? view
      shiftPastePayload(
        payload.items,
        Math.round(target.x - (bounds.x + bounds.width / 2)),
        Math.round(target.y - (bounds.y + bounds.height / 2))
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
          commitAgainst(doc.items, loaded.items)
          shareAssets(payload.images.map((image) => ({ itemId: renamed[image.itemId] ?? image.itemId, dataUrl: image.dataUrl })))
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
      shareAssets
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
          commitAgainst(doc.items, loaded.items)
          shareAssets(items.map((item, index) => ({ itemId: item.id, dataUrl: entries[index].dataUrl })))
        } else if (doc) remember(doc.items)
        setDoc(loaded)
        setSelection(new Set(items.map((item) => item.id)))
        toast('Картинки добавлены', 'paste')
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error))
      }
    },
    [props.docId, toast, fail, doc, remember, setSelection, readOnly, flushPending, live, commitAgainst, shareAssets]
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
        toast('В буфере нет картинки', 'clipboard')
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
      else if (command === 'duplicate') duplicateItems([...selection])
      else if (command === 'copy') copyItems([...selection])
      else if (command === 'paste') void pasteObjects()
      else if (command === 'delete') deleteItems([...selection])
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
      const letter = letterKey(event)
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
        return
      }
      if (
        ['PageUp', 'PageDown', 'Home', 'End'].includes(event.key) &&
        !target?.isContentEditable &&
        !target?.closest('.modal, .overlay, .menu, .inspector')
      ) {
        event.preventDefault()
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'a' && doc) {
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
      if (plain && (letter === 'v' || letter === 'h' || letter === 'e')) {
        if (letter === 'e' && readOnly) {
          toast('Правка доступна только ведущему', 'readonly')
          return
        }
        const mode = letter
        setTool(mode === 'v' ? 'select' : mode === 'h' ? 'pan' : 'erase')
        return
      }
      const toolKeys: Record<string, Tool> = { s: 'create', r: 'create', o: 'create', l: 'link', c: 'link', t: 'text', n: 'sticky', i: 'image', d: 'solid', b: 'table', p: 'pen' }
      if (plain && letter === 'g') {
        changeGrid({ gridMode: gridMode === 'none' ? 'dots' : 'none' })
        return
      }
      const mapped = plain ? toolKeys[letter] : undefined
      if (mapped) {
        if (readOnly) {
          toast('Правка доступна только ведущему', 'readonly')
          return
        }
        if (letter === 'r') {
          setCreateShape('rectangle')
          setCreateTool('shape')
        }
        if (letter === 'o') {
          setCreateShape('circle')
          setCreateTool('shape')
        }
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
        if (editing) {
          commitEditing()
          return
        }
        if (cropEdit) {
          setCropEdit(null)
          return
        }
        if (menu) {
          setMenu(null)
          return
        }
        if (shapePoints) {
          setShapePoints(null)
          return
        }
        if (moreOpen) {
          setMoreOpen(false)
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
      if ((event.ctrlKey || event.metaKey) && letter === 'd') {
        event.preventDefault()
        duplicateItems([...selection])
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'g') {
        event.preventDefault()
        if (event.shiftKey) ungroupSelection()
        else groupSelection()
        return
      }
      const layerBracket = bracketKey(event)
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && layerBracket) {
        event.preventDefault()
        shiftSelectionLayer(layerBracket === ']')
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'c' && selection.size) {
        event.preventDefault()
        copyItems([...selection])
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'x' && selection.size) {
        event.preventDefault()
        cutItems([...selection])
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && letter === 'v' && imageSelection.length) {
        event.preventDefault()
        void replaceImagesFromClipboard().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'v' && readObjectClipboard()) {
        event.preventDefault()
        void pasteObjects()
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'y') {
        event.preventDefault()
        redo()
        return
      }
      if ((event.ctrlKey || event.metaKey) && letter === 'v') {
        event.preventDefault()
        void api.clipboard
          .readHtml()
          .then((html) => pasteIntoBoard(html || undefined))
          .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
        return
      }
      if (plain && letter === 'f') {
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
      if (event.key === 'Tab' && tool === 'select' && !editing && doc && target === wrapRef.current && doc.items.length) {
        event.preventDefault()
        const order = doc.items.filter((item) => !item.locked && item.kind !== 'connector')
        if (!order.length) return
        const at = selection.size === 1 ? order.findIndex((item) => selection.has(item.id)) : -1
        const index = at < 0 ? (event.shiftKey ? order.length - 1 : 0) : (at + (event.shiftKey ? -1 : 1) + order.length) % order.length
        const item = order[index]
        setSelection(new Set([item.id]))
        const box = itemBounds(item, byId)
        const view = viewRef.current
        const rect = wrapRef.current?.getBoundingClientRect()
        if (rect) {
          const halfWidth = rect.width / 2 / view.zoom
          const halfHeight = rect.height / 2 / view.zoom
          const outside =
            box.x + box.width < view.x - halfWidth ||
            box.x > view.x + halfWidth ||
            box.y + box.height < view.y - halfHeight ||
            box.y > view.y + halfHeight
          if (outside) animateTo({ x: box.x + box.width / 2, y: box.y + box.height / 2, zoom: view.zoom }, 180)
        }
        return
      }
      if (event.altKey && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        if (!selection.size || readOnly || !doc) return
        event.preventDefault()
        const step = event.shiftKey ? 40 : 10
        if (!doc.items.some((item) => selection.has(item.id) && !item.locked && item.kind !== 'connector')) {
          toast('Все выбранные объекты заблокированы', 'lock')
          return
        }
        const dw = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dh = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const next = doc.items.map((item) =>
          selection.has(item.id) && !item.locked && item.kind !== 'connector'
            ? ({ ...item, w: Math.max(8, item.w + dw), h: Math.max(8, item.h + dh) } as BoardItem)
            : item
        )
        const now = Date.now()
        const batched = now - nudgeAtRef.current < 700
        nudgeAtRef.current = now
        if (batched) persist(next)
        else commit(next)
        return
      }
      if (layerBracket && !event.ctrlKey && !event.metaKey) {
        if (!selection.size || readOnly || !doc) return
        event.preventDefault()
        if (!doc.items.some((item) => selection.has(item.id) && !item.locked)) {
          toast('Все выбранные объекты заблокированы', 'lock')
          return
        }
        const delta = (event.shiftKey ? 1 : 15) * (layerBracket === ']' ? 1 : -1)
        const next = doc.items.map((item) =>
          selection.has(item.id) && !item.locked
            ? ({ ...item, rotation: (((item.rotation ?? 0) + delta) % 360 + 360) % 360 } as BoardItem)
            : item
        )
        nudgeAtRef.current = Date.now()
        commit(next)
        return
      }
      if (plain && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        if (!selection.size || readOnly || !doc) return
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        if (!doc.items.some((item) => selection.has(item.id) && !item.locked)) {
          toast('Все выбранные объекты заблокированы', 'lock')
          return
        }
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
  }, [doc, selection, zoomBy, fitAll, deleteItems, cutItems, duplicateItems, copyItems, pasteObjects, commit, persist, undo, redo, readOnly, animateTo, pasteIntoBoard, fail, present, stopPresent, stepFrame, changeGrid, gridMode, railOrder, railExtras, menu, shapePoints, moreOpen, showExport, boardSettingsOpen, calculatorOpen, detailsOpen, showInspector, throughAnchor, editing, byId, startEditing, commitEditing, tool, imageSelection, replaceImagesFromClipboard, groupSelection, ungroupSelection, shiftSelectionLayer])

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

  const textDraftRect =
    drag.kind === 'textdraft'
      ? {
          x: Math.min(drag.startX, drag.currentX),
          y: drag.startY,
          width: Math.abs(drag.currentX - drag.startX),
          height: Math.max(24, textSize * 1.34)
        }
      : null

  const bendTarget = (() => {
    if (!doc || readOnly || selection.size !== 1) return null
    const id = [...selection][0]
    const item = byId.get(id)
    if (!item || item.kind !== 'connector' || item.locked) return null
    if (item.shape === 'elbowed') return null
    const ends = deriveConnectorPoints(item, byId)
    if (ends.length !== 2) return null
    return { id, bent: !!item.bends?.length, grips: connectorGrips(item, ends[0], ends[1]), ends }
  })()

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

  const boardMenuItems = (onItem: string): MenuItem[] => {
    if (onItem) {
      const locked = selectedItems.length > 0 && selectedItems.every((item) => item.locked)
      const groupable = selectedItems.length > 1
      const grouped = selectedItems.some((item) => !!item.groupId)
      const textTargets = selectedItems.filter((item) => item.kind === 'text' || item.kind === 'sticky' || item.kind === 'shape')
      const items: MenuItem[] = []
      if (textTargets.length && !readOnly)
        items.push({
          id: 'edit-text',
          label: textTargets.length > 1 ? 'Редактировать текст' : 'Редактировать',
          icon: <Pencil size={14} />,
          hint: textTargets.length === 1 ? 'Enter' : undefined,
          section: 'Объект',
          run: () => startEditing(textTargets[0].id)
        })
      items.push(
        {
          id: 'duplicate',
          label: 'Дублировать',
          icon: <Copy size={14} />,
          hint: 'Ctrl+D',
          section: items.length ? undefined : 'Объект',
          disabled: readOnly || locked,
          run: () => duplicateItems([...selection])
        },
        {
          id: 'copy',
          label: 'Копировать',
          icon: <ClipboardCopy size={14} />,
          hint: 'Ctrl+C',
          run: () => copyItems([...selection])
        },
        {
          id: 'lock',
          label: locked ? 'Разблокировать' : 'Заблокировать',
          icon: locked ? <LockOpen size={14} /> : <Lock size={14} />,
          disabled: readOnly,
          run: () => toggleLock([...selection])
        },
        {
          id: 'delete',
          label: 'Удалить',
          icon: <Trash2 size={14} />,
          hint: 'Delete',
          danger: true,
          disabled: readOnly || locked,
          line: true,
          run: () => deleteItems([...selection])
        },
        {
          id: 'raise',
          label: 'На самый верх',
          icon: <ArrowUpToLine size={14} />,
          section: 'Порядок',
          disabled: readOnly,
          run: () => bringSelection(true)
        },
        {
          id: 'lower',
          label: 'На самый низ',
          icon: <ArrowDownToLine size={14} />,
          disabled: readOnly,
          run: () => bringSelection(false)
        }
      )
      if (groupable && !readOnly)
        items.push({
          id: 'group',
          label: 'В группу',
          icon: <Group size={14} />,
          hint: 'Ctrl+G',
          section: 'Группа',
          run: () => groupSelection()
        })
      if (grouped && !readOnly)
        items.push({
          id: 'ungroup',
          label: 'Из группы',
          icon: <Ungroup size={14} />,
          hint: 'Ctrl+Shift+G',
          section: items.some((item) => item.section === 'Группа') ? undefined : 'Группа',
          run: () => ungroupSelection()
        })
      const singleShape = selectedItems.length === 1 && selectedItems[0].kind === 'shape' ? (selectedItems[0] as ShapeItem) : null
      if (singleShape && !readOnly && !singleShape.locked && isVertexShape(singleShape.shape))
        items.push({
          id: 'shape-points',
          label: shapePoints === singleShape.id ? 'Закончить правку углов' : 'Изменить углы',
          icon: <Spline size={14} />,
          section: 'Фигура',
          run: () => setShapePoints(shapePoints === singleShape.id ? null : singleShape.id)
        })
      if (imageSelection.length === 1) {
        const target = imageSelection[0]
        items.push(
          {
            id: 'crop',
            label: 'Обрезать',
            icon: <Crop size={14} />,
            section: 'Картинка',
            disabled: readOnly || target.locked,
            run: () => {
              void startCrop(target.id)
            }
          },
          {
            id: 'replace',
            label: 'Заменить',
            icon: <ImagePlus size={14} />,
            disabled: readOnly || target.locked,
            submenu: [
              { id: 'replace-clipboard', label: 'Из буфера', icon: <ClipboardPaste size={14} />, run: () => void replaceImage(target.id, 'clipboard') },
              { id: 'replace-file', label: 'Из файла', icon: <ImagePlus size={14} />, run: () => void replaceImage(target.id, 'file') },
              { id: 'replace-url', label: 'По ссылке', icon: <ExternalLink size={14} />, run: () => void replaceImage(target.id, 'url') }
            ]
          },
          {
            id: 'preview',
            label: 'Открыть предпросмотр',
            icon: <Search size={14} />,
            run: () => void openItemPreview(target)
          }
        )
      } else if (imageSelection.length > 1) {
        items.push({
          id: 'replace-many',
          label: 'Заменить файлами',
          icon: <ImagePlus size={14} />,
          section: 'Картинка',
          disabled: readOnly,
          run: () => void replaceImagesFromFiles()
        })
      }
      if (documentSelection.length === 1) {
        const target = documentSelection[0]
        items.push(
          {
            id: 'doc-preview',
            label: 'Открыть предпросмотр',
            icon: <Search size={14} />,
            section: 'Файл',
            disabled: !target.asset,
            run: () => void openItemPreview(target)
          },
          {
            id: 'doc-images',
            label: 'Картинки на доску',
            icon: <FileImage size={14} />,
            section: 'Файл',
            disabled: readOnly || !target.asset,
            run: () => void placeFileImages(target)
          }
        )
      }
      items.push(
        {
          id: 'fit-selection',
          label: 'Показать целиком',
          icon: <Maximize2 size={14} />,
          section: 'Вид',
          run: () => fitTo(boundsOfItems(selectedItems, 60))
        },
        {
          id: 'inspector',
          label: 'Свойства',
          icon: <Layers size={14} />,
          line: true,
          disabled: readOnly,
          run: () => setShowInspector(true)
        }
      )
      return items
    }
    return [
      {
        id: 'paste',
        label: 'Вставить объекты',
        icon: <ClipboardPaste size={14} />,
        hint: 'Ctrl+V',
        disabled: readOnly,
        run: () => {
          void api.clipboard
            .readHtml()
            .then((html) => pasteIntoBoard(html || undefined))
            .catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
        }
      },
      {
        id: 'select-all',
        label: 'Выделить всё',
        icon: <MousePointer2 size={14} />,
        hint: 'Ctrl+A',
        run: () => {
          if (doc) setSelection(new Set(doc.items.filter((item) => item.kind !== 'connector').map((item) => item.id)))
        }
      },
      {
        id: 'fit',
        label: 'Вписать доску',
        icon: <Maximize size={14} />,
        section: 'Вид',
        run: () => fitAll()
      },
      { id: 'zoom-out', label: 'Уменьшить', icon: <ZoomOut size={14} />, run: () => zoomBy(1 / 1.25) },
      { id: 'zoom-in', label: 'Увеличить', icon: <ZoomIn size={14} />, run: () => zoomBy(1.25) },
      {
        id: 'grid',
        label: 'Сетка',
        icon: <Grid3x3 size={14} />,
        submenu: [
          ...GRID_MODES.map((entry) => ({
            id: `grid-${entry.id}`,
            label: entry.label,
            radio: true,
            active: gridMode === entry.id,
            run: () => changeGrid({ gridMode: entry.id })
          })),
          {
            id: 'snap',
            label: 'Привязка к сетке',
            icon: <Magnet size={14} />,
            active: snapGrid,
            line: true,
            run: () => changeGrid({ snapGrid: !snapGrid })
          }
        ]
      },
      {
        id: 'present',
        label: 'Режим докладчика',
        icon: <Play size={14} />,
        section: 'Инструменты',
        run: () => {
          if (present) stopPresent()
          else startPresent()
        }
      },
      {
        id: 'calculator',
        label: 'Калькулятор',
        icon: <Calculator size={14} />,
        run: () => {
          setCalculatorOpen(true)
          setDetailsOpen(false)
          setShowInspector(false)
        }
      },
      {
        id: 'preview',
        label: 'Предпросмотр по ссылке',
        icon: <Link2 size={14} />,
        run: () => void openLinkPreview()
      }
    ]
  }

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
                aria-label="Название доски"
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
            disabled={hostLocked}
            title={hostLocked ? 'Правка доступна только ведущему' : 'Редактирование'}
          >
            <Pencil size={14} /> Правка
          </button>
          <button
            type="button"
            className="seg"
            data-active={readOnly}
            onClick={() => setReadOnlyLocal(true)}
            disabled={hostLocked}
            title={hostLocked ? 'Только просмотр: разрешает правку ведущий' : 'Только просмотр'}
          >
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
                onClick={() => void api.board.openSource(doc.id).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))}
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
                partnerAway={live.partnerAway}
                ping={live.ping}
                connected={live.connected}
                canEdit={live.canEdit}
                preparing={live.preparing}
                watching={live.watching}
                following={live.following}
                topMenuOpen={detailsOpen || boardSettingsOpen || calculatorOpen || showInspector}
                onTogglePermission={live.togglePermission}
                onWatchPartner={() => {
                  if (live.following) live.stopFollow()
                  else live.watchPartner()
                }}
                onPullPartner={() => {
                  const current = viewRef.current
                  live.pullPartner({ x: current.x, y: current.y, zoom: current.zoom })
                }}
                onGoToPartner={() => {
                  const at = live.cursors[0]
                  if (!at) return false
                  if (live.following) live.stopFollow()
                  animateTo({ x: at.targetX, y: at.targetY, zoom: viewRef.current.zoom }, 420)
                  return true
                }}
                onTransferHost={live.transferHost}
                onSaveBoard={saveCopyToLibrary}
                onLeave={live.role === 'guest' ? live.leaveAndCleanup : live.leave}
                onToast={(text, kind) => toast(text, kind)}
              />
            ) : null}
            <div className="bbar__sep" />
            <button type="button" className="btn btn--sm btn--primary" onClick={() => toggleOverlay('export')}>
              <Download size={15} /> Экспорт
            </button>
          </div>

          {showMissing ? (
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
              <button
                type="button"
                className="bbar__close"
                aria-label="Скрыть уведомление"
                onClick={() => setMissingDismissed(missingImages)}
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {selectionSpeech}
      </div>

      <div
        ref={setCanvasNode}
        className="boardview__canvas"
        tabIndex={0}
        role="application"
        aria-label="Доска"
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
          const point = toWorld(event.clientX, event.clientY)
          pointerWorldRef.current = point
          if (live.connected) live.sendCursor(point.x, point.y)
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
            selectable={tool === 'select' && !readOnly && !present}
            interactive={(tool === 'select' || tool === 'pen' || tool === 'text') && !readOnly && !present}
            moving={drag.kind === 'move'}
            editable={!readOnly && !present}
            editingId={editing?.id ?? null}
            onPatch={patchItem}
            onFit={fitTextHeight}
            onNode={registerNode}
            onPointerDown={onItemPointerDown}
            onDoubleClick={present ? undefined : startEditing}
            onLink={(href) => void openLinkPreview(href)}
            media={media}
            livePos={livePosRef.current}
            cropId={cropEdit?.id ?? null}
            loading={assetProgress}
          />
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
          {textPanelShown && textPanelSpot ? (
            <div
              className="textpanel"
              style={{
                left: textPanelSpot.x,
                top: textPanelSpot.y,
                transform: `scale(${1 / Math.max(0.25, liveZoom)})`
              }}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={keepFocus}
            >
              <div className="textpanel__row">
                <button
                  type="button"
                  className="toolbtn"
                  onClick={() => (editing ? commitEditing() : startEditing(editTargetId ?? [...selection][0]))}
                  title={editing ? 'Сохранить текст' : 'Изменить текст'}
                  aria-label={editing ? 'Сохранить текст' : 'Изменить текст'}
                >
                  {editing ? <Check size={16} /> : <Type size={16} />}
                </button>
                <div className="textpanel__sep" />
                <button
                  type="button"
                  className="toolbtn"
                  disabled={!editing}
                  data-active={textFormat.b ? 'true' : undefined}
                  onClick={() => runFormat('bold')}
                  title="Полужирный"
                  aria-label="Полужирный"
                >
                  <Bold size={16} />
                </button>
                <button
                  type="button"
                  className="toolbtn"
                  disabled={!editing}
                  data-active={textFormat.i ? 'true' : undefined}
                  onClick={() => runFormat('italic')}
                  title="Курсив"
                  aria-label="Курсив"
                >
                  <Italic size={16} />
                </button>
                <button
                  type="button"
                  className="toolbtn"
                  disabled={!editing}
                  data-active={textFormat.u ? 'true' : undefined}
                  onClick={() => runFormat('underline')}
                  title="Подчёркнутый"
                  aria-label="Подчёркнутый"
                >
                  <Underline size={16} />
                </button>
                <button
                  type="button"
                  className="toolbtn"
                  disabled={!editing}
                  data-active={textFormat.s ? 'true' : undefined}
                  onClick={() => runFormat('strike')}
                  title="Зачёркнутый"
                  aria-label="Зачёркнутый"
                >
                  <Strikethrough size={16} />
                </button>
                <div className="textpanel__sep" />
                <button
                  type="button"
                  className="toolbtn"
                  disabled={!editing}
                  data-active={textFormat.list ? 'true' : undefined}
                  onClick={() => runFormat('list')}
                  title="Маркированный список"
                  aria-label="Маркированный список"
                >
                  <List size={16} />
                </button>
                <button
                  type="button"
                  className="toolbtn"
                  disabled={!editing}
                  data-active={textFormat.ordered ? 'true' : undefined}
                  onClick={() => runFormat('ordered')}
                  title="Нумерованный список"
                  aria-label="Нумерованный список"
                >
                  <ListOrdered size={16} />
                </button>
                <div className="textpanel__sep" />
                <button type="button" className="toolbtn" onClick={() => adjustFontSize(-1)} title="Уменьшить шрифт"
aria-label="Уменьшить шрифт">
                  <Minus size={16} />
                </button>
                <span className="textpanel__size">
                  {panelItem ? fontSizeOf(panelItem) : 16}
                </span>
                <button type="button" className="toolbtn" onClick={() => adjustFontSize(1)} title="Увеличить шрифт"
aria-label="Увеличить шрифт">
                  <Plus size={16} />
                </button>
                <div className="textpanel__sep" />
                {(['left', 'center', 'right'] as const).map((align) => (
                  <button
                    key={align}
                    type="button"
                    className="toolbtn"
                    data-active={textSelection.every((item) => alignOf(item) === align)}
                    onClick={() => setTextAlign(align)}
                    title={align === 'left' ? 'Влево' : align === 'center' ? 'По центру' : 'Вправо'}
                    aria-label={align === 'left' ? 'Влево' : align === 'center' ? 'По центру' : 'Вправо'}
                  >
                    <AlignIcon align={align} />
                  </button>
                ))}
                {shapePanelTarget && isVertexShape(shapePanelTarget.shape) ? (
                  <>
                    <div className="textpanel__sep" />
                    <button
                      type="button"
                      className="toolbtn"
                      data-active={pointsTarget ? 'true' : undefined}
                      disabled={readOnly}
                      title="Перетащить углы фигуры и добавить новые"
                      aria-label="Перетащить углы фигуры и добавить новые"
                      onClick={() => setShapePoints(pointsTarget ? null : shapePanelTarget.id)}
                    >
                      <Spline size={16} />
                    </button>
                  </>
                ) : null}
              </div>
              <div className="textpanel__row textpanel__row--colors">
                <span className="textpanel__group">
                  <span className="textpanel__cap">Текст</span>
                  <PaletteSwatches
                    colors={QUICK_COLORS}
                    value={panelItem ? textColorOf(panelItem) : '#1a1a1a'}
                    nameFor={colorName}
                    customLabel="Свой цвет текста"
                    onPick={pickTextColor}
                    onCustom={pickTextColor}
                  />
                </span>
                {panelHasFill ? (
                  <span className="textpanel__group">
                    <span className="textpanel__cap">Заливка</span>
                    <PaletteSwatches
                      colors={STICKY_COLORS}
                      value={panelItem ? fillColorOf(panelItem) : '#ffffff'}
                      nameFor={colorName}
                      customLabel="Свой цвет заливки"
                      onPick={paintFill}
                      onCustom={paintFill}
                    />
                  </span>
                ) : null}
                {panelHasBorder ? (
                  <span className="textpanel__group">
                    <span className="textpanel__cap">Рамка</span>
                    <PaletteSwatches
                      colors={QUICK_COLORS}
                      value={panelItem ? borderColorOf(panelItem) : NEW_SHAPE_BORDER}
                      nameFor={colorName}
                      customLabel="Свой цвет рамки"
                      onPick={paintBorder}
                      onCustom={paintBorder}
                    />
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}
          {editing && editingItem && editingBox ? (
            <TextEditor
              itemId={editing.id}
              html={editing.html}
              placeholder={editingItem.kind === 'text' ? '' : 'Введите текст'}
              selectAll={freshEditingRef.current === editing.id}
              autoWidth={editingItem.kind !== 'text' ? false : editingItem.column !== true}
              box={{ x: editingBox.x, y: editingBox.y }}
              minWidth={120}
              onInput={(html, plain) => {
                setEditing({ id: editing.id, html, plain })
                autosaveEditing()
              }}
              onFormat={setTextFormat}
              onCommit={commitEditing}
              onMeasure={(width, height) => {
                editorSizeRef.current = { width, height }
              }}
              style={{
                width:
                  editingItem.kind === 'text'
                    ? editingItem.column
                      ? editingBox.width
                      : undefined
                    : editingItem.kind === 'shape'
                      ? editingBox.width
                      : Math.max(120, editingBox.width),
                height: editingItem.kind === 'shape' ? editingBox.height : undefined,
                minHeight: editingItem.kind === 'shape' ? undefined : Math.max(36, editingBox.height),
                display: editingItem.kind === 'shape' ? 'flex' : undefined,
                flexDirection: editingItem.kind === 'shape' ? 'column' : undefined,
                justifyContent: editingItem.kind === 'shape' ? 'center' : undefined,
                overflow: editingItem.kind === 'shape' ? 'hidden' : undefined,
                padding:
                  editingItem.kind === 'sticky' ? '6px 8px' : editingItem.kind === 'shape' ? '5px 6px' : '2px',
                fontSize:
                  editingItem.kind === 'shape'
                    ? shapeTextSize({ ...editingItem, plain: editing.plain })
                    : fontSizeOf(editingItem),
                fontFamily: editingItem.kind === 'text' ? editingItem.fontFamily : undefined,
                lineHeight: editingItem.kind === 'text' ? 1.34 : 1.25,
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
                  strokeWidth={Math.max(1, strokeWidth)}
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
                    stroke={shapeBorder}
                    strokeWidth={shapeStroke}
                    strokeDasharray="7 5"
                    strokeLinejoin="round"
                  />
                ) : (
                  <path
                    d={curvePath(createPreview.points)}
                    fill="none"
                    stroke={shapeBorder}
                    strokeWidth={Math.max(1, shapeStroke)}
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
            <div
              className="rubber"
              style={{
                left: rubberRect.x,
                top: rubberRect.y,
                width: rubberRect.width,
                height: rubberRect.height,
                borderWidth: 1 / Math.max(0.02, liveZoom)
              }}
            />
          ) : null}
          {textDraftRect ? (
            <div
              className="rubber"
              style={{
                left: textDraftRect.x,
                top: textDraftRect.y,
                width: textDraftRect.width,
                height: textDraftRect.height,
                borderWidth: 1 / Math.max(0.02, liveZoom)
              }}
            />
          ) : null}
          {bendTarget
            ? bendTarget.grips.map((grip) => {
                const main = grip.role === 'joint' || bendTarget.grips.length === 1
                const size = (main ? 14 : 11) / Math.max(0.05, liveZoom)
                return (
                  <span
                    key={`${grip.role}${grip.index}`}
                    className={`bendgrip bendgrip--${grip.role}${bendTarget.bent ? ' bendgrip--on' : ''}`}
                    style={{
                      left: grip.x - size / 2,
                      top: grip.y - size / 2,
                      width: size,
                      height: size,
                      borderWidth: 1.5 / Math.max(0.05, liveZoom)
                    }}
                    title={main ? 'Потянуть, чтобы вести изгиб. Правый клик — убрать' : 'Потянуть, чтобы добавить изгиб. Правый клик — убрать'}
                    onPointerDown={(event) => startBend(bendTarget.id, grip, event)}
                    onDoubleClick={() => clearBend(bendTarget.id)}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      straightenBend(bendTarget.id, grip)
                    }}
                  />
                )
              })
            : null}
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

      <div
        ref={chromeRef}
        className="boardview__chrome"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {drag.kind === 'link' ? (() => {
          const hoverId = itemAt(drag.point)
          return (
            <LinkDraft
              from={byId.get(drag.fromId) ?? null}
              to={hoverId && hoverId !== drag.fromId ? byId.get(hoverId) ?? null : null}
              anchor={drag.anchor}
              point={drag.point}
              style={linkStyle}
              color={shapeBorder}
              width={linkWidth}
              zoom={Math.max(0.05, liveZoom)}
              arrow={linkArrow}
            />
          )
        })() : null}
        {resizeTargets.map((target) => {
          const box = itemBounds(target)
          const zoom = Math.max(0.05, liveZoom)
          const grip = 13 / zoom
          const half = grip / 2
          const dot = 10 / Math.max(0.05, liveZoom)
          const dotGap = 13 / Math.max(0.05, liveZoom)
          const knob = 20 / zoom
          const stem = 15 / zoom
          const pointsMode = shapePoints === target.id && resizeTargets.length === 1
          const allShapeHandles =
            target.kind === 'shape' && resizeTargets.length === 1 && !target.locked && !readOnly
              ? shapeHandles(target.shape, box.width, box.height, target)
              : []
          const vertexHandles = allShapeHandles.filter((handle) => /^(v\d+|add\d+)$/.test(handle.id))
          const paramHandles = allShapeHandles.filter((handle) => !/^(v\d+|add\d+)$/.test(handle.id))
          const takenAt = (x: number, y: number): boolean =>
            vertexHandles.some((handle) => Math.hypot(handle.x - x, handle.y - y) < grip * 1.2)
          const handles = pointsMode
            ? []
            : (target.kind === 'image'
                ? RESIZE_HANDLES.filter((handle) => handle.id.length > 1)
                : target.kind === 'text'
                  ? RESIZE_HANDLES.filter((handle) => handle.id === 'e' || handle.id === 'w' || handle.id.length > 1)
                  : RESIZE_HANDLES
              ).filter((handle) => !takenAt(handle.cx * box.width, handle.cy * box.height))
          const dots = resizeTargets.length === 1 && !pointsMode && target.kind !== 'shape' ? LINK_DOTS : []
          const adjustHandles = pointsMode ? vertexHandles : paramHandles
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
              {handles.map((handle) => (
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
              {dots.map((link) => (
                <span
                  key={link.id}
                  className="linkdot"
                  style={{
                    left: `calc(${link.cx * 100}% + ${link.dx * dotGap - dot / 2}px)`,
                    top: `calc(${link.cy * 100}% + ${link.dy * dotGap - dot / 2}px)`,
                    width: dot,
                    height: dot
                  }}
                  title="Стрелка"
                  onPointerDown={(event) => startLinkDot(target.id, event)}
                />
              ))}
              {adjustHandles.map((handle) => {
                const vertex = /^v\d+$/.test(handle.id)
                const corner = /^add\d+$/.test(handle.id)
                const size = corner ? grip * 0.8 : grip
                return (
                  <span
                    key={handle.id}
                    className={`shapehandle${vertex ? ' shapehandle--vertex' : ''}${corner ? ' shapehandle--corner' : ''}`}
                    style={{
                      left: handle.x - size / 2,
                      top: handle.y - size / 2,
                      width: size,
                      height: size
                    }}
                    title={corner ? 'Добавить угол' : vertex ? 'Переместить угол' : 'Изменить форму'}
                    onPointerDown={(event) => startAdjust(target.id, handle.id, event)}
                  />
                )
              })}
              {resizeTargets.length === 1 && !pointsMode ? (
                <>
                  <span
                    className="rotatestem"
                    style={{
                      left: `calc(50% - ${0.7 / zoom}px)`,
                      top: `${-(stem + knob / 2)}px`,
                      width: 1.4 / zoom,
                      height: stem + knob / 2
                    }}
                  />
                  <span
                    className="rotatehandle"
                    style={{
                      left: `calc(50% - ${knob / 2}px)`,
                      top: `${-(stem + knob)}px`,
                      width: knob,
                      height: knob,
                      borderWidth: 1.5 / zoom
                    }}
                    title="Повернуть"
                    onPointerDown={(event) => startRotate(target.id, event)}
                  >
                    <RotateCw style={{ width: knob * 0.58, height: knob * 0.58 }} strokeWidth={2.6} />
                  </span>
                </>
              ) : null}
            </div>
          )
        })}
      </div>

      {menu ? (
        <ContextMenu
          title={menu.onItem ? `Выбрано: ${selection.size}` : 'Доска'}
          items={boardMenuItems(menu.onItem)}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
        />
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
            if (next === tool) {
              setPaletteHidden((hidden) => !hidden)
              return
            }
            if (next === 'link') setLinkFrom(null)
            setTool(next)
          }}
        />
        {panelKind === 'selection' ? (
          <div className="toolgroup toolpalette">
            <PaletteGroup title={selection.size > 1 ? `Выбрано: ${selection.size}` : 'Объект'}>
              <PaletteGrid columns={2}>
                <PaletteCell title={selection.size < 2 ? 'Объединить выделенные в группу: нужно выделить минимум два объекта' : 'Объединить выделенные в группу'} icon={<Group size={16} />} disabled={selection.size < 2 || readOnly} onClick={() => groupSelection()}>
                  В группу
                </PaletteCell>
                <PaletteCell
                  title={!groupedSelection ? 'Разделить группу: в выделении нет групп' : 'Разделить группу на отдельные объекты'}
                  icon={<Ungroup size={16} />}
                  disabled={!groupedSelection || readOnly}
                  onClick={() => ungroupSelection()}
                >
                  Из группы
                </PaletteCell>
                <PaletteCell title="Дублировать (Ctrl+D)" icon={<Copy size={16} />} disabled={!selection.size || readOnly} onClick={() => duplicateItems([...selection])}>
                  Дубликат
                </PaletteCell>
                <PaletteCell title="Удалить (Delete)" icon={<Trash2 size={16} />} disabled={!selection.size || readOnly} onClick={() => deleteItems([...selection])}>
                  Удалить
                </PaletteCell>
                <PaletteCell
                  title={selectionLocked ? 'Разблокировать' : 'Заблокировать'}
                  icon={selectionLocked ? <LockOpen size={16} /> : <Lock size={16} />}
                  active={selectionLocked}
                  disabled={!selection.size || readOnly}
                  onClick={() => toggleLock([...selection])}
                >
                  {selectionLocked ? 'Открыть' : 'Закрыть'}
                </PaletteCell>
                <PaletteCell title="Снять выделение (Escape)" icon={<X size={16} />} onClick={() => setSelection(new Set())}>
                  Снять
                </PaletteCell>
              </PaletteGrid>
            </PaletteGroup>
            {shapePanelTarget && hasCornerRadius(shapePanelTarget.shape) ? (
              <PaletteGroup title="Фигура">
                <PaletteSlider
                  label="Скругление углов"
                  suffix="%"
                  value={Math.round(cornerRadius(shapePanelTarget.shape, shapePanelTarget) * 100)}
                  min={0}
                  max={50}
                  onChange={(value) => patchItemsLive([shapePanelTarget.id], { adjust: value / 100 })}
                />
              </PaletteGroup>
            ) : null}
            {imageSelection.length === 1 ? (
              <PaletteGroup title="Заменить картинку">
                <PaletteGrid columns={2}>
                  <PaletteCell title="Заменить из буфера" icon={<ClipboardPaste size={16} />} onClick={() => void replaceImage(imageSelection[0].id, 'clipboard')}>
                    Буфер
                  </PaletteCell>
                  <PaletteCell title="Заменить из файла" icon={<ImagePlus size={16} />} onClick={() => void replaceImage(imageSelection[0].id, 'file')}>
                    Файл
                  </PaletteCell>
                  <PaletteCell title="Заменить картинкой по ссылке" icon={<ExternalLink size={16} />} onClick={() => void replaceImage(imageSelection[0].id, 'url')}>
                    Ссылка
                  </PaletteCell>
                  <PaletteCell title="Открыть предпросмотр" icon={<Search size={16} />} onClick={() => void openItemPreview(imageSelection[0])}>
                    Просмотр
                  </PaletteCell>
                </PaletteGrid>
              </PaletteGroup>
            ) : null}
            {imageSelection.length > 1 ? (
              <PaletteGroup title={`Картинок выбрано: ${imageSelection.length}`}>
                <PaletteAction label="Заменить файлами" icon={<ImagePlus size={15} />} disabled={readOnly} onClick={() => void replaceImagesFromFiles()} />
              </PaletteGroup>
            ) : null}
            {connectorTarget ? (
              <>
                <PaletteGroup title="Линия связи">
                  <PaletteGrid columns={3}>
                    <PaletteCell
                      title="Прямая линия"
                      icon={<LineGlyph shape="straight" />}
                      active={connectorTarget.shape === 'straight'}
                      disabled={readOnly}
                      onClick={() => patchConnector(connectorTarget.id, { shape: 'straight', bends: undefined })}
                    />
                    <PaletteCell
                      title="Кривая"
                      icon={<LineGlyph shape="curved" />}
                      active={connectorTarget.shape === 'curved'}
                      disabled={readOnly}
                      onClick={() => patchConnector(connectorTarget.id, { shape: 'curved' })}
                    />
                    <PaletteCell
                      title="Ломаная"
                      icon={<LineGlyph shape="elbowed" />}
                      active={connectorTarget.shape === 'elbowed'}
                      disabled={readOnly}
                      onClick={() => patchConnector(connectorTarget.id, { shape: 'elbowed', bends: undefined })}
                    />
                  </PaletteGrid>
                </PaletteGroup>
                <PaletteGroup title="Начертание">
                  <PaletteSlider
                    label="Толщина"
                    value={connectorTarget.lineWidth}
                    min={1}
                    max={24}
                    onChange={(value) => patchConnector(connectorTarget.id, { lineWidth: value }, true)}
                  />
                </PaletteGroup>
                <PaletteGroup title="Линия">
                  <PaletteGrid columns={3}>
                    <PaletteCell
                      title="Сплошная"
                      icon={dashIcon('normal')}
                      active={connectorTarget.lineStyle === 'normal'}
                      disabled={readOnly}
                      onClick={() => patchConnector(connectorTarget.id, { lineStyle: 'normal' })}
                    />
                    <PaletteCell
                      title="Пунктир"
                      icon={dashIcon('dashed')}
                      active={connectorTarget.lineStyle === 'dashed'}
                      disabled={readOnly}
                      onClick={() => patchConnector(connectorTarget.id, { lineStyle: 'dashed' })}
                    />
                    <PaletteCell
                      title="Точки"
                      icon={dashIcon('dotted')}
                      active={connectorTarget.lineStyle === 'dotted'}
                      disabled={readOnly}
                      onClick={() => patchConnector(connectorTarget.id, { lineStyle: 'dotted' })}
                    />
                  </PaletteGrid>
                </PaletteGroup>
                <PaletteGroup title="Начало">
                  <PaletteGrid columns={5}>
                    {CONNECTOR_CAPS.map((cap) => (
                      <PaletteCell
                        key={`start-${cap}`}
                        title={CONNECTOR_CAP_LABELS[cap]}
                        icon={capIcon(cap)}
                        active={connectorTarget.startStroke === cap}
                        disabled={readOnly}
                        onClick={() => patchConnector(connectorTarget.id, { startStroke: cap })}
                      />
                    ))}
                  </PaletteGrid>
                </PaletteGroup>
                <PaletteGroup title="Конец">
                  <PaletteGrid columns={5}>
                    {CONNECTOR_CAPS.map((cap) => (
                      <PaletteCell
                        key={`end-${cap}`}
                        title={CONNECTOR_CAP_LABELS[cap]}
                        icon={capIcon(cap)}
                        active={connectorTarget.endStroke === cap}
                        disabled={readOnly}
                        onClick={() => patchConnector(connectorTarget.id, { endStroke: cap })}
                      />
                    ))}
                  </PaletteGrid>
                </PaletteGroup>
                <PaletteGroup title="Цвет">
                  <PaletteSwatches
                    colors={QUICK_COLORS}
                    value={connectorTarget.color}
                    nameFor={colorName}
                    onPick={(color) => patchConnector(connectorTarget.id, { color })}
                    onCustom={(color) => patchConnector(connectorTarget.id, { color }, true)}
                  />
                </PaletteGroup>
              </>
            ) : null}
          </div>
        ) : null}
        {panelKind === 'solid' && solidPanel ? (
          <div className="toolgroup toolpalette">
            {tool === 'solid' ? paletteHead('solid') : null}
            <PaletteGroup title={solidPanel.target ? 'Фигура' : 'Новая фигура'}>
              <PaletteGrid columns={3}>
                {SOLID_KINDS.map((entry) => (
                  <PaletteCell
                    key={entry.id}
                    title={entry.label}
                    icon={solidIcon(entry.id)}
                    active={solidKind === entry.id}
                    onClick={() => {
                      setSolidKind(entry.id)
                      if (solidPanel.target) patchSolid({ solid: entry.id })
                    }}
                  />
                ))}
              </PaletteGrid>
            </PaletteGroup>
            <PaletteGroup title="Режим">
              <PaletteGrid columns={2}>
                {SOLID_MODES.map((entry) => (
                  <PaletteCell
                    key={entry.id}
                    title={entry.title}
                    icon={entry.icon}
                    active={solidMode === entry.id}
                    onClick={() => setSolidMode(entry.id)}
                  >
                    {SOLID_MODE_LABELS[entry.id]}
                  </PaletteCell>
                ))}
              </PaletteGrid>
            </PaletteGroup>
            <PaletteGroup title="Геометрия">
              <PaletteSlider label="Размер" value={solidPanel.edge} min={60} max={600} step={10} onChange={(value) => patchSolid({ edge: value }, true)} />
              <PaletteSlider label="Наклон" suffix="°" value={solidPanel.pitch} min={-80} max={80} onChange={(value) => patchSolid({ pitch: value }, true)} />
              <PaletteSlider label="Поворот" suffix="°" value={solidPanel.yaw} min={0} max={359} onChange={(value) => patchSolid({ yaw: value }, true)} />
              <PaletteSlider label="Линия" value={solidPanel.lineWidth} min={1} max={10} onChange={(value) => patchSolid({ lineWidth: value }, true)} />
            </PaletteGroup>
            <PaletteGroup title="Вид">
              <PaletteCheck label="Рёбра" checked={solidPanel.showEdges !== false} onChange={(value) => patchSolid({ showEdges: value })} />
              <PaletteCheck label="Скрытые линии пунктиром" checked={solidPanel.showHidden === true} onChange={(value) => patchSolid({ showHidden: value })} />
            </PaletteGroup>
            <PaletteGroup title={solidMode === 'paint' ? 'Цвет грани' : 'Цвет рёбер и штрихов'}>
              <PaletteSwatches
                colors={QUICK_COLORS}
                value={solidMode === 'paint' ? strokeColor : solidPanel.color}
                customLabel="Свой цвет"
                nameFor={colorName}
                onPick={(color) => (solidMode === 'paint' ? setStrokeColor(color) : solidPanel.target ? patchSolid({ color }) : setStrokeColor(color))}
                onCustom={(color) =>
                  solidMode === 'paint' ? setStrokeColor(color) : solidPanel.target ? patchSolid({ color }) : setStrokeColor(color)
                }
              />
            </PaletteGroup>
            {solidPanel.target ? (
              <PaletteGroup title="Грани">
                <PaletteSwatches
                  colors={SOLID_TINTS}
                  value={solidPanel.tint}
                  customLabel="Свой оттенок"
                  note="Собрать грани из оттенков этого цвета"
                  onPick={(tint) => patchSolid({ tint, faces: tintFaces(tint, solidPanel.faces.map((face) => face.id)) })}
                  onCustom={(tint) => patchSolid({ tint, faces: tintFaces(tint, solidPanel.faces.map((face) => face.id)) })}
                />
                <div className="toolpalette__colors">
                  {solidPanel.faces.slice(0, 8).map((face) => (
                    <button
                      key={face.id}
                      type="button"
                      className="swatch"
                      aria-label={`Грань ${face.id}`}
                      title={face.id}
                      onClick={() => paintSolidFace(doc?.items ?? [], solidPanel.targetId, face.id, strokeColor)}
                      style={{ background: face.color }}
                    />
                  ))}
                </div>
              </PaletteGroup>
            ) : null}
            <PaletteGroup>
              <PaletteNote>{solidPanel.hint}</PaletteNote>
            </PaletteGroup>
          </div>
        ) : null}
        {panelKind === 'create' ? (
          <div className="toolgroup toolpalette toolpalette--wide">
            {paletteHead(
              'create',
              createTool === 'line' ? 'Линия' : createTool === 'arrow' ? 'Стрелка' : SHAPE_LABELS[createShape]
            )}
            <PaletteGroup title="Линии">
              <PaletteGrid columns={2}>
                <PaletteCell title="Линия" icon={<LineGlyph shape="straight" />} active={createTool === 'line'} onClick={() => setCreateTool('line')}>
                  Линия
                </PaletteCell>
                <PaletteCell title="Стрелка" icon={<LineGlyph shape="arrow" />} active={createTool === 'arrow'} onClick={() => setCreateTool('arrow')}>
                  Стрелка
                </PaletteCell>
              </PaletteGrid>
            </PaletteGroup>
            <PaletteGroup title={createIsLine ? 'Цвет линии' : 'Цвет рамки'}>
              <PaletteSwatches
                colors={QUICK_COLORS}
                value={shapeBorder}
                nameFor={colorName}
                onPick={setShapeBorder}
                onCustom={setShapeBorder}
              />
            </PaletteGroup>
            {SHAPE_GROUPS.map((group) => (
              <PaletteGroup key={group.title} title={group.title}>
                <PaletteGrid columns={6}>
                  {group.items.map((shape) => (
                    <PaletteCell
                      key={shape}
                      title={SHAPE_LABELS[shape]}
                      active={!createIsLine && createShape === shape}
                      icon={shapeIcon(shape)}
                      onClick={() => {
                        setCreateShape(shape)
                        setCreateTool('shape')
                      }}
                    />
                  ))}
                </PaletteGrid>
              </PaletteGroup>
            ))}
            <PaletteGroup title="Начертание">
              <PaletteSlider
                label={createIsLine ? 'Толщина' : 'Толщина рамки'}
                value={shapeStroke}
                min={1}
                max={24}
                onChange={setShapeStroke}
              />
            </PaletteGroup>
          </div>
        ) : null}
        {panelKind === 'pen' ? (
          <div className="toolgroup toolpalette toolpalette--brush">
            <div className="brushrail__modes">
              <button
                type="button"
                className="brushrail__mode"
                data-active={penMode === 'pen' ? 'true' : undefined}
                title="Ручка"
                aria-label="Ручка"
                onClick={() => {
                  setPenMode('pen')
                  setPenOpacity(1)
                }}
              >
                <PenTool size={18} />
              </button>
              <button
                type="button"
                className="brushrail__mode"
                data-active={penMode === 'highlighter' ? 'true' : undefined}
                title="Выделитель"
                aria-label="Выделитель"
                onClick={() => {
                  setPenMode('highlighter')
                  setPenOpacity(0.35)
                }}
              >
                <Highlighter size={18} />
              </button>
            </div>
            <div className="brushrail__dots">
              {brushes.map((preset, index) => (
                <BrushDot
                  key={index}
                  color={preset.color}
                  width={preset.width}
                  max={24}
                  active={index === brushIndex}
                  nameFor={colorName}
                  onSelect={() => selectBrush(index)}
                  onChange={(patch) => editBrush(index, patch)}
                />
              ))}
            </div>
          </div>
        ) : null}
        {panelKind === 'link' ? (
          <div className="toolgroup toolpalette">
            {paletteHead('link', linkStyle === 'straight' ? 'Прямая' : linkStyle === 'curved' ? 'Кривая' : 'Ломаная')}
            <PaletteGroup title="Линия связи">
              <PaletteGrid columns={3}>
                <PaletteCell title="Прямая линия" icon={<LineGlyph shape="straight" />} active={linkStyle === 'straight'} onClick={() => setLinkStyle('straight')} />
                <PaletteCell title="Кривая" icon={<LineGlyph shape="curved" />} active={linkStyle === 'curved'} onClick={() => setLinkStyle('curved')} />
                <PaletteCell title="Ломаная" icon={<LineGlyph shape="elbowed" />} active={linkStyle === 'elbowed'} onClick={() => setLinkStyle('elbowed')} />
              </PaletteGrid>
            </PaletteGroup>
            <PaletteGroup title="Вид">
              <PaletteSlider label="Толщина" value={linkWidth} min={1} max={12} onChange={setLinkWidth} />
              <PaletteCheck label="Стрелка на конце" checked={linkArrow} onChange={setLinkArrow} />
            </PaletteGroup>
            <PaletteGroup title="Как связать">
              <PaletteNote
                action={
                  linkFrom ? (
                    <button type="button" className="toolbtn" onClick={() => setLinkFrom(null)} title="Отменить выбор" aria-label="Отменить выбор">
                      <X size={14} />
                    </button>
                  ) : null
                }
              >
                {linkFrom ? 'Теперь по второму объекту' : 'Щёлкните по первому объекту'}
              </PaletteNote>
            </PaletteGroup>
            {linkPreview ? (
              <PaletteGroup title="Ссылка">
                <PaletteNote
                  action={
                    <button
                      type="button"
                      className="toolbtn"
                      onClick={() => void openLinkPreview(linkPreview)}
                      title="Открыть в окне предпросмотра"
                      aria-label="Открыть в окне предпросмотра"
                    >
                      <ExternalLink size={14} />
                    </button>
                  }
                >
                  <span className="truncate">{linkPreview}</span>
                </PaletteNote>
              </PaletteGroup>
            ) : null}
          </div>
        ) : null}
        {panelKind === 'erase' ? (
          <div className="toolgroup toolpalette">
            {paletteHead('erase')}
            <PaletteGroup title="Размер">
              <PaletteSlider label="Размер" value={eraseSize} min={6} max={48} step={2} onChange={setEraseSize} />
            </PaletteGroup>
          </div>
        ) : null}
        {panelKind === 'image' ? (
          <div className="toolgroup toolpalette">
            {paletteHead('image')}
            <PaletteGroup title="Вставить">
              <PaletteOption
                label="Из файла"
                icon={<ImagePlus size={15} />}
                title="Вставить картинку из файла"
                onClick={() =>
                  void api.dialog.pickImage().then((dataUrl) => {
                    if (!dataUrl) return
                    return addImageAt(dataUrl, { x: viewRef.current.x, y: viewRef.current.y })
                  })
                }
              />
              <PaletteOption
                label="Из буфера"
                icon={<ClipboardPaste size={15} />}
                title="Вставить картинку из буфера"
                onClick={() =>
                  void api.clipboard.readImage().then((dataUrl) => {
                    if (!dataUrl) {
                      toast('В буфере нет картинки', 'clipboard')
                      return
                    }
                    return addImageAt(dataUrl, { x: viewRef.current.x, y: viewRef.current.y })
                  })
                }
              />
              <PaletteOption
                label="По ссылке"
                icon={<ExternalLink size={15} />}
                title="Вставить картинку по ссылке"
                onClick={() => {
                  void ask('Ссылка на картинку', '', 'https://').then((value) => {
                    const url = value?.trim()
                    if (!url) return
                    return insertImageFromUrl(url)
                  })
                }}
              />
            </PaletteGroup>
          </div>
        ) : null}
        {panelKind === 'text' || panelKind === 'sticky' ? (
          <div className="toolgroup toolpalette">
            {paletteHead(panelKind)}
            <PaletteGroup title={panelKind === 'sticky' ? 'Цвет стикера' : 'Цвет текста'}>
              {panelKind === 'sticky' ? (
                <PaletteSwatches colors={STICKY_COLORS} value={stickyColor} nameFor={colorName} onPick={setStickyColor} onCustom={setStickyColor} />
              ) : (
                <PaletteSwatches colors={QUICK_COLORS} value={textColor} nameFor={colorName} onPick={setTextColor} onCustom={setTextColor} />
              )}
            </PaletteGroup>
            <PaletteGroup title="Начертание">
              <PaletteSlider label="Размер" value={textSize} min={8} max={72} onChange={setTextSize} />
            </PaletteGroup>
            <PaletteGroup>
              <PaletteNote>
                {panelKind === 'text'
                  ? 'Щёлкните по доске или протяните ширину колонки.'
                  : 'Щёлкните по доске, чтобы поставить стикер.'}
              </PaletteNote>
            </PaletteGroup>
          </div>
        ) : null}
        {panelKind === 'graph' && graphPanel ? (
          <div className="toolgroup toolpalette">
            {tool === 'graph' ? paletteHead('graph') : null}
            <PaletteGroup title="Плоскость">
              <PaletteSlider label="Масштаб" value={graphPanel.scale} min={10} max={160} step={5} onChange={(value) => patchGraph({ scale: value }, true)} />
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
            </PaletteGroup>
            <PaletteGroup title="Размер">
              <PaletteGrid columns={3}>
                <PaletteCell title="Маленькая плоскость" icon={<span className="toolpalette__dims">360×260</span>} onClick={() => patchGraph({ w: 360, h: 260 })} />
                <PaletteCell title="Обычная плоскость" icon={<span className="toolpalette__dims">640×440</span>} onClick={() => patchGraph({ w: 640, h: 440 })} />
                <PaletteCell title="Широкая плоскость" icon={<span className="toolpalette__dims">960×640</span>} onClick={() => patchGraph({ w: 960, h: 640 })} />
              </PaletteGrid>
              <PaletteAction label="Вписать в окно" icon={<Maximize2 size={15} />} title="Вписать плоскость в окно" onClick={() => fitGraphToView()} />
            </PaletteGroup>
            <PaletteGroup title="Показывать">
              <PaletteCheck label="Сетка" checked={graphPanel.showGrid} onChange={(value) => patchGraph({ showGrid: value })} />
              <PaletteCheck label="Подписи чисел" checked={graphPanel.showLabels} onChange={(value) => patchGraph({ showLabels: value })} />
            </PaletteGroup>
            <PaletteGroup title="Графики">
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
                      aria-label="Формула графика"
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
                      aria-label="Толщина линии графика"
                    >
                      <span>{expression.lineWidth}</span>
                    </button>
                    <button
                      type="button"
                      className="toolbtn toolbtn--compact"
                      data-active={expression.visible}
                      onClick={() => patchExpression(expression.id, { visible: !expression.visible })}
                      title="Показать или скрыть"
                      aria-label="Показать или скрыть"
                    >
                      {expression.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      type="button"
                      className="toolbtn toolbtn--compact"
                      onClick={() => patchGraph({ expressions: graphPanel.expressions.filter((entry) => entry.id !== expression.id) })}
                      title="Удалить график"
                      aria-label="Удалить график"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )
              })}
              <PaletteAction
                label="Добавить график"
                icon={<Plus size={15} />}
                title="Добавить график"
                onClick={() =>
                  patchGraph({
                    expressions: [
                      ...graphPanel.expressions,
                      { id: uid('ex_'), formula: 'x', color: QUICK_COLORS[(graphPanel.expressions.length + 1) % QUICK_COLORS.length], lineWidth: 3, visible: true }
                    ]
                  })
                }
              />
            </PaletteGroup>
          </div>
        ) : null}
      </div>

      {present ? (
        <div className="presentbar">
          {frames.length ? (
            <button type="button" className="toolbtn" onClick={() => stepFrame(-1)} aria-label="Предыдущая рамка" title="Предыдущая рамка (стрелка влево)">
              <ChevronLeft size={17} />
            </button>
          ) : null}
          <div className="presentbar__title">
            {frames.length ? frames[presentIndex]?.title || 'Без названия' : 'Вся доска'}
            {frames.length ? <span className="presentbar__count">{presentIndex + 1} из {frames.length}</span> : null}
          </div>
          {frames.length ? (
            <button type="button" className="toolbtn" onClick={() => stepFrame(1)} aria-label="Следующая рамка" title="Следующая рамка (стрелка вправо)">
              <ChevronRight size={17} />
            </button>
          ) : null}
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
          onPatch={inspectorPatch}
          onPatchMany={inspectorPatchMany}
          onPatchLive={inspectorPatchLive}
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