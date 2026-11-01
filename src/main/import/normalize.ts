import { normalizeColor } from '@shared/color'
import { extractUrls, toPlainText } from '@shared/richtext'
import { boundsOfItems, isImageMime, measureTextBox, mimeToExtension } from '@shared/util'
import type {
  BoardItem,
  ConnectorItem,
  ConnectorShape,
  ItemKind,
  RelativeOffset,
  ShapeItem,
  ShapeName,
  StrokeEnd,
  TextPoint
} from '@shared/types'

export interface RawItem {
  id?: string
  type?: string
  data?: Record<string, any>
  position?: { x?: number; y?: number; origin?: string; relativeTo?: string }
  geometry?: { width?: number; height?: number; rotation?: number } | null
  style?: Record<string, any>
  parent?: { id?: string; type?: string } | null
  parentId?: string
  createdAt?: string
  modifiedAt?: string
  createdBy?: { name?: string } | null
  modifiedBy?: { name?: string } | null
  [key: string]: any
}

export interface NormalizeResult {
  items: BoardItem[]
  warnings: string[]
  byKind: Record<string, number>
}

const KIND_BY_TYPE: Record<string, ItemKind> = {
  sticky_note: 'sticky',
  text: 'text',
  shape: 'shape',
  image: 'image',
  frame: 'frame',
  connector: 'connector',
  card: 'card',
  embed: 'embed',
  preview: 'embed',
  video: 'video',
  table: 'table',
  table_text: 'table',
  vote: 'vote',
  group: 'group',
  tag: 'tag',
  document: 'document',
  struct_doc: 'document',
  app_card: 'app_card',
  code: 'code',
  comment: 'comment',
  path: 'path',
  paint: 'path',
  pen: 'path',
  drawing: 'path'
}

const SHAPE_BY_NAME: Record<string, ShapeName> = {
  rectangle: 'rectangle',
  round_rectangle: 'round_rectangle',
  wedge_round_rectangle_callout: 'round_rectangle',
  square: 'square',
  circle: 'circle',
  can: 'circle',
  triangle: 'triangle',
  right_triangle: 'right_triangle',
  diamond: 'diamond',
  rhombus: 'diamond',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  pentagon: 'pentagon',
  hexagon: 'hexagon',
  octagon: 'octagon',
  star: 'star',
  pie: 'pie',
  cross: 'cross',
  right_arrow: 'arrow_right',
  left_arrow: 'arrow_left',
  up_arrow: 'arrow_up',
  down_arrow: 'arrow_down',
  left_right_arrow: 'arrow_right',
  left_brace: 'cross',
  right_brace: 'cross',
  cloud: 'cloud' as ShapeName,
  flow_chart_predefined_process: 'flowchart_process',
  flowchart_start: 'flowchart_start',
  flow_chart_start: 'flowchart_start',
  flowchart_end: 'flowchart_end',
  flow_chart_end: 'flowchart_end',
  flowchart_process: 'flowchart_process',
  flow_chart_process: 'flowchart_process',
  flowchart_decision: 'flowchart_decision',
  flow_chart_decision: 'flowchart_decision',
  flowchart_input_output: 'flowchart_input_output',
  flow_chart_input_output: 'flowchart_input_output',
  flowchart_document: 'flowchart_document',
  flow_chart_document: 'flowchart_document'
}

const FONT_BY_NAME: Record<string, string> = {
  arial: "Arial, 'Segoe UI', sans-serif",
  abril_fatface: "'Abril Fatface', Georgia, serif",
  bangers: "Bangers, Impact, sans-serif",
  eb_garamond: "'EB Garamond', Georgia, serif",
  georgia: "Georgia, serif",
  graduate: "Graduate, Georgia, serif",
  gravitas_one: "'Gravitas One', Impact, sans-serif",
  fredoka_one: "'Fredoka One', sans-serif",
  nixie_one: "'Nixie One', monospace",
  open_sans: "'Open Sans', 'Segoe UI', sans-serif",
  permanent_marker: "'Permanent Marker', cursive",
  pt_sans: "'PT Sans', 'Segoe UI', sans-serif",
  pt_sans_narrow: "'PT Sans Narrow', 'Segoe UI', sans-serif",
  pt_serif: "'PT Serif', Georgia, serif",
  rammetto_one: "'Rammetto One', cursive",
  roboto: "Roboto, 'Segoe UI', sans-serif",
  roboto_condensed: "'Roboto Condensed', 'Segoe UI', sans-serif",
  roboto_slab: "'Roboto Slab', Georgia, serif",
  caveat: "Caveat, cursive",
  times_new_roman: "'Times New Roman', serif",
  titan_one: "'Titan One', Impact, sans-serif",
  lemon_tuesday: "'Lemon Tuesday', cursive",
  roboto_mono: "'Roboto Mono', Consolas, monospace",
  noto_sans: "'Noto Sans', 'Segoe UI', sans-serif",
  plex_sans: "'IBM Plex Sans', 'Segoe UI', sans-serif",
  plex_serif: "'IBM Plex Serif', Georgia, serif",
  plex_mono: "'IBM Plex Mono', Consolas, monospace",
  spoof: "Spoof, Georgia, serif",
  tiempos_text: "'Times New Roman', serif",
  formular: "Formular, 'Segoe UI', sans-serif"
}

const MIRI_PALETTE: Record<string, string> = {
  gray: '#f5f6f8',
  light_yellow: '#fff9b1',
  yellow: '#f5d128',
  orange: '#ff9d48',
  light_green: '#d5f692',
  green: '#93d275',
  dark_green: '#67c6c0',
  cyan: '#23bfe7',
  light_pink: '#ffcee0',
  pink: '#f16c7f',
  violet: '#b384bb',
  red: '#ea94bb',
  light_blue: '#a6ccf5',
  blue: '#7b92ff',
  dark_blue: '#7b92ff',
  black: '#000000',
  light_pink_v2: '#ffcee0'
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/[^0-9.eE+-]/g, ''))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof typeof value === 'boolean') return String(value)
  return fallback
}

function pick<T>(...values: Array<T | undefined | null | false>): T | undefined {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '' && value !== false) return value
  }
  return undefined
}

function alignOf(value: unknown, fallback: 'left' | 'center' | 'right'): 'left' | 'center' | 'right' {
  const raw = str(value).toLowerCase()
  if (raw === 'left' || raw === 'start') return 'left'
  if (raw === 'right' || raw === 'end') return 'right'
  if (raw === 'center' || raw === 'centre' || raw === 'middle') return 'center'
  return fallback
}

function verticalOf(value: unknown, fallback: 'top' | 'middle' | 'bottom'): 'top' | 'middle' | 'bottom' {
  const raw = str(value).toLowerCase()
  if (raw === 'top' || raw === 'start') return 'top'
  if (raw === 'bottom' || raw === 'end') return 'bottom'
  if (raw === 'middle' || raw === 'center' || raw === 'centre') return 'middle'
  return fallback
}

function color(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback
  const raw = str(value).toLowerCase()
  if (MIRI_PALETTE[raw]) return MIRI_PALETTE[raw]
  return normalizeColor(raw, fallback)
}

function relativeOffsetOf(value: unknown): RelativeOffset | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const inner = (source.position ?? source) as Record<string, unknown>
  const x = num(inner.x, NaN)
  const y = num(inner.y, NaN)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined
  const px = x > 1 ? x / 100 : x
  const py = y > 1 ? y / 100 : y
  return { x: Math.max(0, Math.min(1, px)), y: Math.max(0, Math.min(1, py)) }
}

export function normalizeItems(raws: RawItem[]): NormalizeResult {
  const items: BoardItem[] = []
  const warnings: string[] = []
  const byKind: Record<string, number> = {}
  const unknownTypes = new Set<string>()
  const seen = new Set<string>()
  raws.forEach((raw, index) => {
    try {
      const item = normalizeOne(raw, index)
      if (!item) return
      if (seen.has(item.id)) return
      seen.add(item.id)
      items.push(item)
      byKind[item.kind] = (byKind[item.kind] ?? 0) + 1
      if (item.kind === 'unknown') unknownTypes.add(item.sourceType ?? '?')
    } catch (error) {
      warnings.push(`Итем ${str(raw?.id, String(index))} пропущен: ${error instanceof Error ? error.message : String(error)}`)
    }
  })
  resolvePositions(items)
  for (const type of unknownTypes) {
    warnings.push(`Тип «${type}» не поддерживается — сохранён как исходные данные`)
  }
  return { items, warnings, byKind }
}

export function resolvePositions(items: BoardItem[]): void {
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const item of items) {
    if (item.relative === 'parent_top_left' && item.parentId) {
      const parent = byId.get(item.parentId)
      if (parent) {
        item.x += parent.x
        item.y += parent.y
        item.relative = 'canvas_center'
      }
    }
  }
  const byId2 = new Map(items.map((item) => [item.id, item]))
  for (const item of items) {
    if (item.kind !== 'connector') continue
    const connector = item
    let a: TextPoint | undefined
    let b: TextPoint | undefined
    if (connector.startItemId && connector.endItemId) {
      const start = byId2.get(connector.startItemId)
      const end = byId2.get(connector.endItemId)
      if (start && end && start.id !== connector.id && end.id !== connector.id) {
        a = pointOn(start, connector.startOffset)
        b = pointOn(end, connector.endOffset)
      }
    }
    if (!a || !b) continue
    const mid: TextPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
    const minX = Math.min(a.x, b.x, mid.x)
    const minY = Math.min(a.y, b.y, mid.y)
    connector.x = minX
    connector.y = minY
    connector.w = Math.max(a.x, b.x, mid.x) - minX || 1
    connector.h = Math.max(a.y, b.y, mid.y) - minY || 1
    connector.points = connector.shape === 'elbowed' ? [a, { x: b.x, y: a.y }, b] : [a, b]
  }
}

export function pointOn(item: BoardItem, offset?: RelativeOffset): TextPoint {
  const x = item.x + (offset ? offset.x * Math.max(1, item.w) : item.w / 2)
  const y = item.y + (offset ? offset.y * Math.max(1, item.h) : item.h / 2)
  return { x, y }
}

function normalizeOne(raw: RawItem, index: number): BoardItem | null {
  if (!raw || typeof raw !== 'object') return null
  const data = (raw.data ?? {}) as Record<string, any>
  const style: Record<string, any> = { ...(raw.style ?? {}), ...(data.style ?? {}) }
  const position = (raw.position ?? {}) as Record<string, any>
  const geometry = (raw.geometry ?? {}) as Record<string, any>
  const sourceType = str(raw.type, 'unknown').toLowerCase()
  const kind = KIND_BY_TYPE[sourceType] ?? 'unknown'
  const id = str(raw.id, `item_${index}`)

  const w = num(pick(geometry.width, raw.width, data.width), 0)
  const h = num(pick(geometry.height, raw.height, data.height), 0)
  const origin = str(pick(position.origin, raw.origin), 'center').toLowerCase()
  const relativeTo = str(pick(position.relativeTo, raw.relativeTo), 'canvas_center')
  const px = num(pick(position.x, raw.x, data.x), 0)
  const py = num(pick(position.y, raw.y, data.y), 0)
  const topLeftOrigin = origin === 'x_y' || origin === 'top_left' || relativeTo === 'parent_top_left'

  const rotation = num(pick(geometry.rotation, raw.rotation, data.rotation, style.rotation), 0)
  const parentId = pick(raw.parent?.id, raw.parentId, data.parentId, data.frameId)
  const groupId = str(pick(raw.groupId, data.groupId), '')
  const base = {
    id,
    sourceType,
    rotation,
    z: index,
    parentId,
    groupId: groupId || undefined,
    relative: relativeTo === 'parent_top_left' ? ('parent_top_left' as const) : ('canvas_center' as const),
    createdAt: str(pick(raw.createdAt, data.createdAt)) || undefined,
    modifiedAt: str(pick(raw.modifiedAt, data.modifiedAt)) || undefined,
    author: str(pick(raw.createdBy?.name, data.createdBy?.name)) || undefined,
    tagIds: Array.isArray(raw.tagIds) ? raw.tagIds.map((v: unknown) => str(v)) : undefined,
    raw
  }

  const rect = (fw: number, fh: number): { x: number; y: number; w: number; h: number } => {
    const sizeW = w > 0 ? w : fw
    const sizeH = h > 0 ? h : fh
    const baseLeft = w > 0 ? (topLeftOrigin ? px : px - w / 2) : px
    const baseTop = h > 0 ? (topLeftOrigin ? py : py - h / 2) : py
    return { x: baseLeft, y: baseTop, w: sizeW, h: sizeH }
  }

  const content = str(pick(raw.content, data.content, data.text, data.html, data.description), '')
  const shapeName = str(pick(raw.shape, data.shape), '').toLowerCase()
  const fontSize = num(pick(style.fontSize, data.fontSize), 0)
  const fontFamily = fontOf(pick(style.fontFamily, data.fontFamily))

  switch (kind) {
    case 'sticky': {
      const box = rect(100, 100)
      return {
        ...base,
        kind: 'sticky',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        content,
        plain: toPlainText(content),
        color: color(pick(style.fillColor, data.color), '#fff9b1'),
        shape: shapeName === 'round' || shapeName === 'round_rectangle' ? 'round' : 'square',
        textAlign: alignOf(pick(style.textAlign, data.textAlign), 'center'),
        textAlignVertical: verticalOf(pick(style.textAlignVertical, data.textAlignVertical), 'top'),
        fontSize: fontSize > 0 ? fontSize : 14,
        urls: extractUrls(content),
        linkToFrame: data.attachedToFrame === true || str(data.attachedToFrame) === 'true'
      }
    }
    case 'text': {
      const box = rect(Math.max(80, fontSize * 6), Math.max(24, fontSize * 1.6))
      const size = fontSize > 0 ? fontSize : 14
      const plain = toPlainText(content)
      const needed = measureTextBox(plain, size, Math.max(8, box.w - 4)).height + 4
      return {
        ...base,
        kind: 'text',
        x: box.x,
        y: box.y,
        w: box.w,
        h: Math.max(box.h, needed),
        content,
        plain,
        color: color(pick(style.color, style.textColor, data.color), '#1a1a1a'),
        align: alignOf(pick(style.textAlign, data.textAlign), 'left'),
        fontSize: size,
        fontFamily,
        urls: extractUrls(content)
      }
    }
    case 'shape': {
      const box = rect(160, 90)
      const fill = color(pick(style.fillColor, data.color), '#ffffff')
      const textColor = color(pick(style.color, style.textColor), contrastOf(fill))
      return {
        ...base,
        kind: 'shape',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        shape: SHAPE_BY_NAME[shapeName] ?? 'rectangle',
        content,
        plain: toPlainText(content),
        fillColor: fill,
        borderColor: color(pick(style.borderColor, data.borderColor), '#1a1a1a'),
        borderWidth: num(pick(style.borderWidth, data.borderWidth), 2),
        borderStyle: borderStyleOf(pick(style.borderStyle, data.borderStyle)),
        opacity: clamp01(num(pick(style.fillOpacity, data.opacity), 1)),
        textAlign: alignOf(pick(style.textAlign, data.textAlign), 'center'),
        textAlignVertical: verticalOf(pick(style.textAlignVertical, data.textAlignVertical), 'middle'),
        fontSize: fontSize > 0 ? fontSize : 14,
        fontFamily,
        urls: extractUrls(content),
        textColor
      } as ShapeItem
    }
    case 'image': {
      const resource = (data.resource ?? {}) as Record<string, any>
      const box = rect(
        num(pick(data.crop?.width, resource.width, data.naturalWidth), 320),
        num(pick(data.crop?.height, resource.height, data.naturalHeight), 240)
      )
      const url = str(pick(data.imageUrl, data.url, data.src, raw.imageUrl, raw.url), '')
      const resourceId = str(pick(data.resourceId, resource.id, raw.resourceId), '')
      const alt = str(pick(data.altText, data.alt, raw.altText), str(pick(data.title, raw.title), ''))
      const naturalW = num(pick(resource.width, data.naturalWidth), 0)
      const naturalH = num(pick(resource.height, data.naturalHeight), 0)
      const crop = data.crop as { x?: number; y?: number; width?: number; height?: number } | undefined
      const cropX = num(crop?.x, 0)
      const cropY = num(crop?.y, 0)
      const cropW = num(pick(crop?.width, naturalW), 0)
      const cropH = num(pick(crop?.height, naturalH), 0)
      const cropBox =
        crop && naturalW > 0 && naturalH > 0 && (cropX > 0 || cropY > 0)
          ? {
              top: clamp01(cropY / naturalH),
              left: clamp01(cropX / naturalW),
              right: clamp01((naturalW - cropX - cropW) / naturalW),
              bottom: clamp01((naturalH - cropY - cropH) / naturalH)
            }
          : undefined
      const asset = url || resourceId
        ? {
            file: '',
            mime: url ? mimeOf(url) : '',
            bytes: 0,
            sourceUrl: url || undefined,
            sourceId: resourceId || undefined,
            width: naturalW || undefined,
            height: naturalH || undefined,
            local: false
          }
        : undefined
      return {
        ...base,
        kind: 'image',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        asset,
        alt,
        title: str(pick(data.title, raw.title), ''),
        crop: cropBox,
        opacity: clamp01(num(pick(style.opacity, data.opacity), 1)),
        urls: url ? [url] : []
      }
    }
    case 'path': {
      const points = pointsOf(pick(data.points, raw.points))
      if (points.length < 2) return null
      const box = rect(320, 240)
      return {
        ...base,
        kind: 'path',
        x: box.x,
        y: box.y,
        w: Math.max(1, box.w),
        h: Math.max(1, box.h),
        points,
        color: color(pick(style.strokeColor, style.lineColor, style.color, data.color), '#1a1a1a'),
        lineWidth: Math.max(1, num(pick(style.strokeWidth, style.lineWidth, style.thickness, data.lineWidth), 2)),
        opacity: clamp01(num(pick(style.opacity, data.opacity), 1)),
        closed: data.closed === true
      }
    }
    case 'frame': {
      const box = rect(800, 600)
      const fill = color(pick(style.fillColor, data.color), 'transparent')
      return {
        ...base,
        kind: 'frame',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title: str(pick(data.title, raw.title), ''),
        titleColor: '#1a1a1a',
        color: fill === 'transparent' ? '#e9e9ea' : fill,
        fillColor: fill,
        format: str(pick(data.format), '') || undefined,
        frameType: str(pick(data.type, raw.frameType), '') || undefined,
        showContent: data.showContent !== false
      }
    }
    case 'connector': {
      const startRef = pick(data.startItem, raw.startItem, data.from, raw.from)
      const endRef = pick(data.endItem, raw.endItem, data.to, raw.to)
      const startItemId = str(pick(startRef?.id, raw.startItemId, data.startItemId), '')
      const endItemId = str(pick(endRef?.id, raw.endItemId, data.endItemId), '')
      const shapeRaw = str(pick(raw.shape, data.shape, raw.connectorShape), 'curved').toLowerCase()
      const shape: ConnectorShape = shapeRaw === 'straight' ? 'straight' : shapeRaw === 'elbowed' ? 'elbowed' : 'curved'
      const strokeColor = color(pick(style.strokeColor, style.lineColor, style.color, data.color), '#1a1a1a')
      return {
        ...base,
        kind: 'connector',
        x: px,
        y: py,
        w: Math.max(1, w),
        h: Math.max(1, h),
        points: pointsOf(pick(data.points, data.segments, raw.points)),
        shape,
        color: strokeColor,
        lineWidth: Math.max(0.5, num(pick(style.strokeWidth, style.lineWidth, data.lineWidth), 2)),
        lineStyle: borderStyleOf(pick(style.strokeStyle, style.lineStyle)),
        startStroke: strokeEndOf(pick(style.startStrokeCap, style.startStroke, data.startStroke)),
        endStroke: strokeEndOf(pick(style.endStrokeCap, style.endStroke, data.endStroke)),
        startItemId: startItemId || undefined,
        endItemId: endItemId || undefined,
        startOffset: relativeOffsetOf(startRef),
        endOffset: relativeOffsetOf(endRef),
        captions: Array.isArray(data.captions)
          ? data.captions.map((c: any) => str(c?.content)).filter(Boolean)
          : undefined,
        unsupported: raw.isSupported === false,
        textColor: color(pick(style.color), contrastOf('#ffffff'))
      } as ConnectorItem
    }
    case 'card': {
      const box = rect(240, 160)
      const title = str(pick(data.title, raw.title), '')
      const description = str(pick(data.description, raw.description), '')
      const theme = color(pick(style.cardTheme, style.fillColor, data.color), '#f4f4f4')
      const thumbnail = str(pick(data.thumbnailId, data.thumbnailUrl, raw.thumbnailId), '')
      return {
        ...base,
        kind: 'card',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title,
        description,
        color: theme,
        thumbnail: thumbnail
          ? { file: '', mime: mimeOf(thumbnail), bytes: 0, sourceUrl: thumbnail, local: false }
          : undefined,
        urls: extractUrls(`${title}${description}`),
        dueDate: str(pick(data.dueDate), '') || undefined,
        assigneeId: str(pick(data.assigneeId), '') || undefined
      }
    }
    case 'embed': {
      const box = rect(480, 320)
      const url = str(pick(data.url, raw.url), '')
      const preview = str(pick(data.previewUrl, data.imageUrl), '')
      return {
        ...base,
        kind: 'embed',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        url,
        provider: str(pick(data.providerName, data.provider, raw.providerName), ''),
        title: str(pick(data.title, raw.title), url),
        description: str(pick(data.description, raw.description), '') || undefined,
        contentType: str(pick(data.contentType), '') || undefined,
        asset: preview ? { file: '', mime: mimeOf(preview), bytes: 0, sourceUrl: preview, local: false } : undefined
      }
    }
    case 'video': {
      const box = rect(480, 270)
      const url = str(pick(data.url, raw.url), '')
      return {
        ...base,
        kind: 'video',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        url,
        title: str(pick(data.title, raw.title), ''),
        asset: str(pick(data.thumbnailUrl, data.imageUrl), '')
          ? { file: '', mime: 'image/png', bytes: 0, sourceUrl: str(data.thumbnailUrl ?? data.imageUrl), local: false }
          : undefined
      }
    }
    case 'table': {
      const box = rect(600, 300)
      const columnWidths = Array.isArray(data.columnWidths)
        ? data.columnWidths.map((v: unknown) => num(v, 0)).filter((v: number) => v > 0)
        : Array.isArray(data.columnWidths2)
          ? []
          : []
      const rowHeights = Array.isArray(data.rowHeights)
        ? data.rowHeights.map((v: unknown) => num(v, 0)).filter((v: number) => v > 0)
        : []
      const cells: string[] = []
      const rawCells = Array.isArray(data.cells) ? data.cells : []
      for (const row of rawCells) {
        const list = Array.isArray(row) ? row : [row]
        for (const cell of list) cells.push(typeof cell === 'string' ? cell : str(cell?.content ?? cell?.text, ''))
      }
      const columns = Math.max(1, columnWidths.length || (rawCells[0] ? (Array.isArray(rawCells[0]) ? rawCells[0].length : 1) : 1))
      const rows = Math.max(1, rowHeights.length || rawCells.length)
      return {
        ...base,
        kind: 'table',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        columns,
        rows,
        columnWidths: columnWidths.length === columns ? columnWidths : new Array(columns).fill(box.w / columns),
        rowHeights: rowHeights.length === rows ? rowHeights : new Array(rows).fill(box.h / rows),
        cells,
        fontSize: fontSize > 0 ? fontSize : 14
      }
    }
    case 'vote': {
      const box = rect(160, 120)
      return {
        ...base,
        kind: 'vote',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title: str(pick(data.title, raw.title), ''),
        total: num(pick(data.votesCount, data.votes, raw.votesCount), 0),
        variant: str(pick(data.variant), '') || undefined
      }
    }
    case 'group': {
      const box = rect(400, 300)
      const itemIds = Array.isArray(data.items)
        ? data.items.map((v: unknown) => str((v as any)?.id ?? v))
        : Array.isArray(raw.items)
          ? raw.items.map((v: unknown) => str((v as any)?.id ?? v))
          : []
      return {
        ...base,
        kind: 'group',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title: str(pick(data.title, raw.title), ''),
        itemIds: itemIds.filter(Boolean),
        color: color(pick(style.fillColor), 'transparent')
      }
    }
    case 'tag': {
      const box = rect(96, 28)
      return {
        ...base,
        kind: 'tag',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title: str(pick(data.title, raw.title), ''),
        color: color(pick(data.fillColor, style.fillColor, raw.fillColor), '#e4e4e4')
      }
    }
    case 'document': {
      const box = rect(420, 560)
      const docUrl = str(pick(data.documentUrl, data.url, raw.documentUrl), '')
      return {
        ...base,
        kind: 'document',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title: str(pick(data.title, raw.title), 'Документ'),
        pages: num(pick(data.pageCount, data.pages), 0) || undefined,
        asset: docUrl ? { file: '', mime: mimeOf(docUrl), bytes: 0, sourceUrl: docUrl, local: false } : undefined
      }
    }
    case 'app_card': {
      const box = rect(300, 180)
      const viewLink = str(pick(data.viewLink, raw.viewLink), '')
      const fields = Array.isArray(data.fields)
        ? data.fields.map((f: any) => ({
            value: str(f?.value),
            textColor: str(f?.textColor) || undefined,
            fillColor: str(f?.fillColor) || undefined,
            tooltip: str(f?.tooltip) || undefined,
            iconUrl: str(f?.iconUrl) || undefined
          }))
        : undefined
      return {
        ...base,
        kind: 'app_card',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        title: str(pick(data.title, raw.title), ''),
        description: str(pick(data.description, raw.description), ''),
        appId: str(pick(data.appInstanceId, data.appId, raw.appInstanceId), ''),
        viewLink,
        urls: viewLink ? [viewLink] : [],
        fields,
        status: str(pick(data.status), '') || undefined
      }
    }
    case 'code': {
      const box = rect(320, 200)
      const value = str(pick(data.content, data.code, raw.content), '')
      return {
        ...base,
        kind: 'code',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        content: value,
        plain: toPlainText(value),
        language: str(pick(data.language, style.language), '') || undefined,
        color: color(pick(style.backgroundColor, style.fillColor), '#f6f6f6'),
        fontSize: fontSize > 0 ? fontSize : 12
      }
    }
    case 'comment': {
      const box = rect(200, 60)
      return {
        ...base,
        kind: 'comment',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        content,
        plain: toPlainText(content),
        author: str(pick(raw.createdBy?.name, data.createdBy?.name)) || undefined,
        resolved: data.resolved === true
      }
    }
    default: {
      const box = rect(120, 80)
      return {
        ...base,
        kind: 'unknown',
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        label: sourceType
      }
    }
  }
}

function borderStyleOf(value: unknown): 'normal' | 'dotted' | 'dashed' {
  const raw = str(value).toLowerCase()
  if (raw === 'dashed' || raw === 'dashed_2') return 'dashed'
  if (raw === 'dotted') return 'dotted'
  return 'normal'
}

function strokeEndOf(value: unknown): StrokeEnd {
  const raw = str(value).toLowerCase()
  const allowed: StrokeEnd[] = [
    'none',
    'stealth',
    'rounded_stealth',
    'diamond',
    'filled_diamond',
    'oval',
    'filled_oval',
    'arrow',
    'triangle',
    'filled_triangle'
  ]
  if (raw === 'normal') return 'arrow'
  return (allowed.find((item) => item === raw) ?? 'none') as StrokeEnd
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function fontOf(value: unknown): string | undefined {
  const raw = str(value)
  if (!raw) return undefined
  return FONT_BY_NAME[raw.toLowerCase().replace(/[\s-]+/g, '_')] ?? raw
}

function contrastOf(background: string): string {
  const value = background.replace('#', '')
  if (value.length < 6) return '#1a1a1a'
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff'
}

export function mimeOf(url: string): string {
  const ext = mimeToExtension('', url)
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    ico: 'image/x-icon',
    pdf: 'application/pdf'
  }
  return map[ext] ?? 'application/octet-stream'
}

function pointsOf(value: unknown): TextPoint[] {
  if (!Array.isArray(value)) return []
  const out: TextPoint[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const x = num((entry as any).x, NaN)
    const y = num((entry as any).y, NaN)
    if (Number.isFinite(x) && Number.isFinite(y)) out.push({ x, y })
    else {
      const sx = num((entry as any).start?.x, NaN)
      const sy = num((entry as any).start?.y, NaN)
      const ex = num((entry as any).end?.x, NaN)
      const ey = num((entry as any).end?.y, NaN)
      if ([sx, sy].every(Number.isFinite)) out.push({ x: sx, y: sy })
      if ([ex, ey].every(Number.isFinite)) out.push({ x: ex, y: ey })
    }
  }
  return out.length >= 2 ? out : []
}

export function isImageAsset(mime: string): boolean {
  return isImageMime(mime)
}

export function computeDocBounds(items: BoardItem[], padding = 140) {
  return boundsOfItems(items, padding)
}