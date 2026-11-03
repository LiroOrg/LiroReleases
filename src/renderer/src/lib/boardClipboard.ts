const DATA_TAG = 'miro-data-v'
const DATA_PATTERN = /\(miro-data-v(\d+)\)([\s\S]*?)\(\/miro-data-v\d+\)/
const DATA_OFFSET = 59
const DATA_FORMAT = 1
const DATA_VERSION = 2
const SOURCE_HOST = 'miro.com'
const WIDGET_TYPE = 14
const GROUP_TYPE = 10
const MAX_LOCAL_ID = 100000000
const FREE_END_INDEX = -1

export const IMAGE_EXPORT_SUPPORTED = false

export interface StyleMap {
  [key: string]: unknown
}

export interface WidgetJson {
  [key: string]: any
}

export interface SourcePoint {
  x: number
  y: number
}

export interface Anchor {
  point: SourcePoint
  positionType: number
  widgetIndex: number
}

export interface ClipboardObject {
  type: number
  id: number
  initialId?: string
  items?: number[]
  widgetData?: {
    type: string
    json: WidgetJson
  }
}

export interface ClipboardShift {
  x: number
  y: number
  tokenizerIdDec?: string
}

export interface ClipboardPayload {
  isProtected: boolean
  boardId: string
  data: {
    meta: unknown
    objects: ClipboardObject[]
    shift?: ClipboardShift
  }
  version: number
  host: string
}

export interface RawItemStyle {
  fillColor?: string
  fillOpacity?: number
  opacity?: number
  borderColor?: string
  borderWidth?: number
  borderStyle?: string
  color?: string
  fontSize?: number
  fontFamily?: string
  textAlign?: string
  textAlignVertical?: string
  strokeColor?: string
  strokeWidth?: number
  strokeStyle?: string
  startStrokeCap?: string
  endStrokeCap?: string
  [key: string]: unknown
}

export interface RawItemAnchor {
  id: string
  position: SourcePoint
}

export interface RawItemData {
  content?: string
  shape?: string
  title?: string
  description?: string
  points?: SourcePoint[]
  closed?: boolean
  captions?: Array<{ content: string }>
  startItem?: RawItemAnchor
  endItem?: RawItemAnchor
  startOffset?: SourcePoint
  endOffset?: SourcePoint
  startStroke?: string
  endStroke?: string
  imageUrl?: string
  url?: string
  resourceId?: string
  altText?: string
  naturalWidth?: number
  naturalHeight?: number
  crop?: { x: number; y: number; width: number; height: number }
  [key: string]: unknown
}

export type RawItemType =
  | 'sticky_note'
  | 'text'
  | 'shape'
  | 'connector'
  | 'card'
  | 'frame'
  | 'image'
  | 'path'

export interface RawItem {
  id: string
  type: RawItemType
  x: number
  y: number
  width: number
  height: number
  position: {
    x: number
    y: number
    origin: 'center'
    relativeTo: 'canvas_center'
  }
  geometry: {
    width: number
    height: number
    rotation: number
  }
  style: RawItemStyle
  data: RawItemData
  parentId?: string
  groupId?: string
  [key: string]: unknown
}

export interface SourceBoardItem {
  id: string
  kind: string
  x: number
  y: number
  w: number
  h: number
  rotation?: number
  z?: number
  parentId?: string
  relative?: string
  sourceType?: string
  content?: string
  plain?: string
  color?: string
  shape?: string
  fillColor?: string
  borderColor?: string
  borderWidth?: number
  borderStyle?: string
  opacity?: number
  textColor?: string
  fontSize?: number
  fontFamily?: string
  align?: string
  textAlign?: string
  textAlignVertical?: string
  title?: string
  description?: string
  alt?: string
  asset?: unknown
  points?: SourcePoint[]
  lineWidth?: number
  lineStyle?: string
  startStroke?: string
  endStroke?: string
  startItemId?: string
  endItemId?: string
  startOffset?: SourcePoint
  endOffset?: SourcePoint
  captions?: string[]
  urls?: string[]
  unsupported?: boolean
  bends?: unknown
}

export type BoardItem = SourceBoardItem

interface WidgetInfo {
  object: ClipboardObject
  id: string
  widgetType: string
  json: WidgetJson
  style: StyleMap
  box: WidgetBox
  origin: SourcePoint
  center: SourcePoint
  width: number
  height: number
  rotation: number
  startAnchor: Anchor | null
  endAnchor: Anchor | null
  startWorld: SourcePoint
  endWorld: SourcePoint
  points: SourcePoint[]
  rawItemId: string | null
}

const DEFAULT_SIZES: Record<string, [number, number]> = {
  sticker: [200, 200],
  shape: [160, 90],
  text: [200, 96],
  card: [240, 160],
  image: [320, 240],
  frame: [800, 600],
  line: [1, 1]
}

const SHAPE_BY_TYPE: Record<string, string> = {
  '3': 'square',
  '4': 'circle',
  '5': 'triangle',
  '6': 'round_rectangle',
  '7': 'round_rectangle',
  '8': 'diamond',
  '10': 'parallelogram',
  '11': 'star',
  '12': 'right_arrow',
  '13': 'left_arrow',
  '16': 'pentagon',
  '17': 'hexagon',
  '18': 'octagon',
  '19': 'trapezoid',
  '20': 'flowchart_process',
  '21': 'right_arrow',
  '22': 'cloud',
  '23': 'left_brace',
  '24': 'right_brace',
  '25': 'cross',
  '26': 'rectangle'
}

const TYPE_BY_SHAPE: Record<string, string> = {
  rectangle: '3',
  square: '3',
  round_rectangle: '7',
  circle: '4',
  triangle: '5',
  right_triangle: '5',
  diamond: '8',
  pentagon: '16',
  hexagon: '17',
  octagon: '18',
  star: '11',
  pie: '4',
  trapezoid: '19',
  parallelogram: '10',
  cross: '25',
  arrow_right: '12',
  arrow_left: '13',
  arrow_up: '12',
  arrow_down: '13',
  flowchart_start: '3',
  flowchart_end: '3',
  flowchart_process: '20',
  flowchart_decision: '8',
  flowchart_input_output: '10',
  flowchart_document: '7',
  cloud: '22',
  unknown: '3'
}

const ALIGN_FROM_CODE: Record<string, string> = {
  l: 'left',
  c: 'center',
  r: 'right',
  left: 'left',
  center: 'center',
  right: 'right',
  start: 'left',
  end: 'right',
  middle: 'center'
}

const ALIGN_TO_CODE: Record<string, string> = {
  left: 'l',
  start: 'l',
  center: 'c',
  middle: 'c',
  right: 'r',
  end: 'r'
}

const VALIGN_FROM_CODE: Record<string, string> = {
  t: 'top',
  m: 'middle',
  b: 'bottom',
  top: 'top',
  middle: 'middle',
  bottom: 'bottom',
  center: 'middle',
  start: 'top',
  end: 'bottom'
}

const VALIGN_TO_CODE: Record<string, string> = {
  top: 't',
  start: 't',
  middle: 'm',
  center: 'm',
  bottom: 'b',
  end: 'b'
}

const BORDER_STYLE_FROM_CODE: Record<number, string> = {
  0: 'normal',
  1: 'dashed',
  2: 'dashed'
}

const BORDER_STYLE_TO_CODE: Record<string, number> = {
  normal: 0,
  solid: 0,
  dashed: 1,
  dotted: 2
}

const LINE_STYLE_FROM_CODE: Record<number, string> = {
  1: 'dashed',
  2: 'normal',
  4: 'dotted'
}

const LINE_STYLE_TO_CODE: Record<string, number> = {
  normal: 2,
  solid: 2,
  dashed: 1,
  dotted: 4
}

const LINE_TYPE_FROM_CODE: Record<number, string> = {
  0: 'straight',
  1: 'elbowed',
  2: 'curved'
}

const LINE_TYPE_TO_CODE: Record<string, number> = {
  straight: 0,
  elbowed: 1,
  curved: 2
}

const STROKE_FROM_CODE: Record<number, string> = {
  0: 'none',
  1: 'stealth',
  2: 'diamond',
  3: 'filled_diamond',
  4: 'oval',
  5: 'filled_oval',
  6: 'triangle',
  7: 'stealth',
  8: 'filled_triangle',
  9: 'arrow',
  10: 'none',
  11: 'none',
  12: 'none',
  13: 'none',
  14: 'none',
  15: 'none'
}

const STROKE_TO_CODE: Record<string, number> = {
  none: 0,
  stealth: 1,
  rounded_stealth: 1,
  diamond: 2,
  filled_diamond: 3,
  oval: 4,
  filled_oval: 5,
  triangle: 6,
  filled_triangle: 8,
  arrow: 9
}

const FONT_BY_NAME: Record<string, string> = {
  opensans: 'Open Sans',
  'open_sans': 'Open Sans',
  roboto: 'Roboto',
  'roboto_condensed': 'Roboto Condensed',
  'roboto_mono': 'Roboto Mono',
  georgia: 'Georgia',
  arial: 'Arial',
  verdana: 'Verdana',
  tahoma: 'Tahoma',
  times_new_roman: 'Times New Roman',
  courier_new: 'Courier New',
  caveat: 'Caveat',
  permanent_marker: 'Permanent Marker',
  lato: 'Lato',
  montserrat: 'Montserrat',
  'pt_sans': 'PT Sans',
  'pt_serif': 'PT Serif',
  'noto_sans': 'Noto Sans',
  nixie_one: 'Nixie One',
  titillium_web: 'Titillium Web',
  raleway: 'Raleway',
  'roboto_slab': 'Roboto Slab',
  ibm_plex_sans: 'IBM Plex Sans'
}

const NAME_BY_FONT: Record<string, string> = {
  'open sans': 'OpenSans',
  roboto: 'Roboto',
  'roboto condensed': 'RobotoCondensed',
  'roboto mono': 'RobotoMono',
  'roboto slab': 'RobotoSlab',
  georgia: 'Georgia',
  arial: 'Arial',
  verdana: 'Verdana',
  tahoma: 'Tahoma',
  'times new roman': 'TimesNewRoman',
  'courier new': 'CourierNew',
  caveat: 'Caveat',
  'permanent marker': 'PermanentMarker',
  lato: 'Lato',
  montserrat: 'Montserrat',
  'pt sans': 'PTSans',
  'pt serif': 'PTSerif',
  'noto sans': 'NotoSans',
  'ibm plex sans': 'IBMPlexSans'
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {}
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return fallback
}

function numOr(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function num(value: unknown, fallback = 0): number {
  const parsed = numOr(value)
  return parsed === undefined ? fallback : parsed
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function decodePayloadString(base64: string): string {
  const cleaned = base64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const remainder = cleaned.length % 4
  const padded = remainder === 0 ? cleaned : cleaned + '='.repeat(4 - remainder)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = (binary.charCodeAt(index) - DATA_OFFSET + 256) % 256
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function encodePayloadString(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const parts: string[] = []
  let chunk = ''
  for (let index = 0; index < bytes.length; index += 1) {
    chunk += String.fromCharCode((bytes[index] + DATA_OFFSET) % 256)
    if (chunk.length >= 8192) {
      parts.push(chunk)
      chunk = ''
    }
  }
  if (chunk) parts.push(chunk)
  return btoa(parts.join(''))
}

function parseStyleValue(raw: string): unknown {
  const value = raw.trim()
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replace(/\\(.)/g, '$1')
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(value)) return Number(value)
  return value
}

function parseLooseStyle(text: string): StyleMap {
  const result: StyleMap = {}
  const body = text.trim().replace(/^\{/, '').replace(/\}$/, '')
  const pattern = /(?:^|,)\s*"?([A-Za-z_][\w-]*)"?\s*:\s*("(?:[^"\\]|\\.)*"|[^,}]+)/g
  let match = pattern.exec(body)
  while (match !== null) {
    result[match[1]] = parseStyleValue(match[2])
    match = pattern.exec(body)
  }
  return result
}

function parseStyle(value: unknown): StyleMap {
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return {}
    try {
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === 'object' ? (parsed as StyleMap) : {}
    } catch {
      return parseLooseStyle(text)
    }
  }
  if (value && typeof value === 'object') return value as StyleMap
  return {}
}

function styleString(style: StyleMap): string {
  return JSON.stringify(style)
}

function styleColor(value: unknown): string | undefined {
  const int = numOr(value)
  if (int === undefined || int < 0) return undefined
  return colorFromInt(int)
}



function fontFamilyOf(value: unknown): string | undefined {
  const name = str(value).trim()
  if (!name) return undefined
  const key = name.replace(/[\s-]+/g, '_').toLowerCase()
  const family = FONT_BY_NAME[key]
  if (family) return family
  return name
}

function fontNameOf(value: unknown): string {
  const family = str(value).split(',')[0].trim().replace(/^['"]|['"]$/g, '')
  if (!family) return 'OpenSans'
  const known = NAME_BY_FONT[family.toLowerCase()]
  if (known) return known
  return family.replace(/\s+/g, '')
}

export function colorFromInt(value: unknown): string {
  const int = numOr(value)
  if (int === undefined || int < 0) return 'transparent'
  const hex = (Math.round(int) & 0xffffff).toString(16).padStart(6, '0')
  return '#' + hex
}

export function intFromColor(color: string): number {
  const raw = str(color).trim()
  if (!raw) return -1
  const lower = raw.toLowerCase()
  if (lower === 'transparent' || lower === 'none') return -1
  if (lower.startsWith('#')) {
    const hex = lower.slice(1)
    const full =
      hex.length === 3 || hex.length === 4
        ? hex
            .slice(0, 3)
            .split('')
            .map((char) => char + char)
            .join('')
        : hex.slice(0, 6)
    return /^[0-9a-f]{6}$/.test(full) ? parseInt(full, 16) : -1
  }
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(lower)
  if (rgb) {
    const channel = (value: string): number => Math.max(0, Math.min(255, Math.round(Number(value))))
    return (channel(rgb[1]) << 16) | (channel(rgb[2]) << 8) | channel(rgb[3])
  }
  if (/^\d+$/.test(lower)) {
    const int = Number(lower)
    return int <= 0xffffff ? int : -1
  }
  return -1
}

function normalizeObject(value: unknown): ClipboardObject | null {
  const source = asRecord(value)
  const id = numOr(source.id)
  if (id === undefined) return null
  const object: ClipboardObject = {
    type: numOr(source.type) ?? WIDGET_TYPE,
    id
  }
  const initialId = source.initialId
  if (typeof initialId === 'string' && initialId) object.initialId = initialId
  else if (typeof initialId === 'number') object.initialId = String(initialId)
  if (Array.isArray(source.items)) {
    object.items = source.items.map(numOr).filter((entry): entry is number => entry !== undefined)
  }
  const widget = asRecord(source.widgetData)
  const json = asRecord(widget.json)
  if (widget.type !== undefined && Object.keys(json).length > 0) {
    object.widgetData = { type: str(widget.type) || 'shape', json: json as WidgetJson }
  }
  return object
}

function normalizeShift(value: unknown): ClipboardShift | undefined {
  const source = asRecord(value)
  const x = numOr(source.x)
  const y = numOr(source.y)
  if (x === undefined && y === undefined) return undefined
  const shift: ClipboardShift = { x: x ?? 0, y: y ?? 0 }
  if (typeof source.tokenizerIdDec === 'string') shift.tokenizerIdDec = source.tokenizerIdDec
  return shift
}

function normalizePayload(value: unknown): ClipboardPayload {
  const source = asRecord(value)
  const data = asRecord(source.data)
  const objects = Array.isArray(data.objects)
    ? data.objects.map(normalizeObject).filter((entry): entry is ClipboardObject => entry !== null)
    : []
  const shift = normalizeShift(data.shift)
  return {
    isProtected: source.isProtected === true,
    boardId: str(source.boardId),
    data: {
      meta: data.meta === undefined ? [] : data.meta,
      objects,
      shift
    },
    version: numOr(source.version) ?? DATA_VERSION,
    host: str(source.host) || SOURCE_HOST
  }
}

export function isBoardClipboardHtml(html: string): boolean {
  if (typeof html !== 'string' || !html) return false
  return html.indexOf(DATA_TAG) !== -1 && DATA_PATTERN.test(html)
}

export function decodeBoardClipboard(html: string): ClipboardPayload {
  const match = typeof html === 'string' ? DATA_PATTERN.exec(html) : null
  if (!match) throw new Error('Буфер обмена не содержит данных доски')
  let parsed: unknown
  try {
    parsed = JSON.parse(decodePayloadString(match[2]))
  } catch (error) {
    throw new Error(`Не удалось прочитать данные доски: ${error instanceof Error ? error.message : String(error)}`)
  }
  return normalizePayload(parsed)
}

export function encodeBoardClipboard(payload: ClipboardPayload): string {
  const json = JSON.stringify(normalizePayload(payload))
  const base64 = encodePayloadString(json)
  return `<span data-meta="<--(${DATA_TAG}${DATA_FORMAT})${base64}(/${DATA_TAG}${DATA_FORMAT})-->"></span>`
}

function readPoints(value: unknown): SourcePoint[] {
  if (!Array.isArray(value)) return []
  const points: SourcePoint[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const source = entry as Record<string, unknown>
    const x = numOr(source.x)
    const y = numOr(source.y)
    if (x !== undefined && y !== undefined) {
      points.push({ x, y })
      continue
    }
    const start = asRecord(source.start)
    const end = asRecord(source.end)
    const sx = numOr(start.x)
    const sy = numOr(start.y)
    if (sx !== undefined && sy !== undefined) points.push({ x: sx, y: sy })
    const ex = numOr(end.x)
    const ey = numOr(end.y)
    if (ex !== undefined && ey !== undefined) points.push({ x: ex, y: ey })
  }
  return points
}

function readAnchor(value: unknown): Anchor | null {
  const source = asRecord(value)
  const point = asRecord(source.point)
  const x = numOr(point.x)
  const y = numOr(point.y)
  if (x === undefined || y === undefined) return null
  return {
    point: { x, y },
    positionType: numOr(source.positionType) ?? 0,
    widgetIndex: numOr(source.widgetIndex) ?? FREE_END_INDEX
  }
}

function readSize(json: WidgetJson, widgetType: string): [number, number] {
  const size = asRecord(json.size)
  const crop = asRecord(json.crop)
  const cropWidth = numOr(crop.width)
  const cropHeight = numOr(crop.height)
  if (cropWidth !== undefined && cropHeight !== undefined && cropWidth > 0 && cropHeight > 0) {
    return [cropWidth, cropHeight]
  }
  const resource = asRecord(json.resource)
  const resourceWidth = numOr(resource.width)
  const resourceHeight = numOr(resource.height)
  if (resourceWidth !== undefined && resourceHeight !== undefined && resourceWidth > 0 && resourceHeight > 0) {
    return [resourceWidth, resourceHeight]
  }
  const fallback = DEFAULT_SIZES[widgetType] ?? DEFAULT_SIZES.shape
  const width = numOr(size.width) ?? numOr(json.width)
  const height = numOr(size.height) ?? numOr(json.height)
  const w = width !== undefined && width > 0 ? width : fallback[0]
  const h = height !== undefined && height > 0 ? height : fallback[1]
  return [w, h]
}

function widgetScale(json: WidgetJson): number {
  const absolute = numOr(asRecord(json.scale).scale)
  const relative = numOr(json.relativeScale)
  const value = absolute ?? relative ?? 1
  return value > 0 ? value : 1
}

interface WidgetBox {
  x: number
  y: number
  width: number
  height: number
  scale: number
  topLeft: boolean
}

function widgetBox(json: WidgetJson, widgetType: string, origin?: SourcePoint): WidgetBox {
  const scale = widgetScale(json)
  const [baseWidth, baseHeight] = readSize(json, widgetType)
  const offset = asRecord(asRecord(json._position).offsetPx)
  const offsetX = origin ? origin.x : numOr(offset.x)
  const offsetY = origin ? origin.y : numOr(offset.y)
  if (offsetX !== undefined && offsetY !== undefined) {
    return {
      x: offsetX - (baseWidth * scale) / 2,
      y: offsetY - (baseHeight * scale) / 2,
      width: baseWidth * scale,
      height: baseHeight * scale,
      scale,
      topLeft: true
    }
  }
  const position = asRecord(json.position)
  const px = numOr(position.x)
  const py = numOr(position.y)
  if (px !== undefined && py !== undefined) {
    return { x: px - baseWidth / 2, y: py - baseHeight / 2, width: baseWidth, height: baseHeight, scale: 1, topLeft: false }
  }
  return { x: 0, y: 0, width: baseWidth, height: baseHeight, scale: 1, topLeft: true }
}

function strokeBox(widgetType: string, json: WidgetJson, origin?: SourcePoint): WidgetBox {
  const base = widgetBox(json, widgetType, origin)
  if (widgetType !== 'paint' && widgetType !== 'pen' && widgetType !== 'drawing') return base
  const scale = base.scale
  const points = readPoints(json.points).map((point) => ({ x: point.x * scale, y: point.y * scale }))
  if (points.length === 0) return base
  const shape = boxOfPoints(points)
  return {
    x: base.x + base.width / 2 - shape.width / 2,
    y: base.y + base.height / 2 - shape.height / 2,
    width: Math.max(1, shape.width),
    height: Math.max(1, shape.height),
    scale,
    topLeft: true
  }
}

function strokePointsOf(info: WidgetInfo): SourcePoint[] {
  const scale = info.box.scale
  const local = readPoints(info.json.points).map((point) => ({ x: point.x * scale, y: point.y * scale }))
  if (local.length === 0) return []
  let minX = Infinity
  let minY = Infinity
  for (const point of local) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
  }
  return local.map((point) => ({ x: point.x - minX, y: point.y - minY }))
}

function readRotation(json: WidgetJson): number {
  const rotation = asRecord(json.rotation)
  const value = numOr(rotation.rotation) ?? numOr(json.relativeRotation) ?? numOr(rotation)
  return value ?? 0
}

function boxOfPoints(points: SourcePoint[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = points[0].x
  let maxX = points[0].x
  let minY = points[0].y
  let maxY = points[0].y
  for (const point of points) {
    if (point.x < minX) minX = point.x
    if (point.x > maxX) maxX = point.x
    if (point.y < minY) minY = point.y
    if (point.y > maxY) maxY = point.y
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }
}

function anchorToWorld(anchor: Anchor | null, byObjectId: Map<number, WidgetInfo>): SourcePoint | null {
  if (!anchor) return null
  if (anchor.widgetIndex === FREE_END_INDEX) return { x: anchor.point.x, y: anchor.point.y }
  const target = byObjectId.get(anchor.widgetIndex)
  if (!target) return null
  return {
    x: target.center.x + (anchor.point.x - 0.5) * target.width,
    y: target.center.y + (anchor.point.y - 0.5) * target.height
  }
}

function dedupePoints(points: SourcePoint[]): SourcePoint[] {
  const result: SourcePoint[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (last && Math.abs(last.x - point.x) < 1e-6 && Math.abs(last.y - point.y) < 1e-6) continue
    result.push(point)
  }
  return result
}

function connectorGeometry(info: WidgetInfo, byObjectId: Map<number, WidgetInfo>): void {
  const primary = readAnchor(info.json.primary)
  const secondary = readAnchor(info.json.secondary)
  const waypoints = readPoints(info.json.points).map((point) => ({
    x: point.x + info.origin.x,
    y: point.y + info.origin.y
  }))
  let start = anchorToWorld(primary, byObjectId) ?? waypoints[0] ?? { x: info.center.x, y: info.center.y }
  let end = anchorToWorld(secondary, byObjectId) ?? waypoints[waypoints.length - 1] ?? start
  if (start.x === end.x && start.y === end.y) end = { x: end.x + 1, y: end.y }
  const middle = waypoints.length >= 2 ? waypoints.slice(1, waypoints.length - 1) : []
  info.startAnchor = primary
  info.endAnchor = secondary
  info.startWorld = start
  info.endWorld = end
  info.points = dedupePoints([start, ...middle, end])
  const box = boxOfPoints(info.points)
  info.width = box.width
  info.height = box.height
  info.origin = { x: box.x, y: box.y }
  info.center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

function connectorAnchor(
  anchor: Anchor | null,
  world: SourcePoint,
  selfObjectId: number,
  box: { x: number; y: number; width: number; height: number },
  byObjectId: Map<number, WidgetInfo>
): RawItemAnchor {
  if (anchor && anchor.widgetIndex !== FREE_END_INDEX) {
    const target = byObjectId.get(anchor.widgetIndex)
    if (target && target.object.id !== selfObjectId) {
      return { id: target.id, position: { x: clamp01(anchor.point.x), y: clamp01(anchor.point.y) } }
    }
  }
  return {
    id: '',
    position: {
      x: clamp01((world.x - box.x) / Math.max(1, box.width)),
      y: clamp01((world.y - box.y) / Math.max(1, box.height))
    }
  }
}

function buildRawItem(info: WidgetInfo, byObjectId: Map<number, WidgetInfo>): RawItem | null {
  const width = Math.max(1, info.width)
  const height = Math.max(1, info.height)
  const item: RawItem = {
    id: info.id,
    type: 'shape',
    x: info.center.x - width / 2,
    y: info.center.y - height / 2,
    width,
    height,
    position: { x: info.center.x, y: info.center.y, origin: 'center', relativeTo: 'canvas_center' },
    geometry: { width, height, rotation: info.rotation },
    style: {},
    data: {}
  }
  const text = str(info.json.text)
  const title = str(info.json.title)
  const description = str(info.json.description)
  const fillColor = styleColor(info.style.bc)
  const borderColor = styleColor(info.style.brc)
  const textColor = styleColor(info.style.tc)
  const rawFontSize = numOr(info.style.st) ?? numOr(info.style.fs)
  const fontSize = rawFontSize === undefined ? undefined : Math.max(1, Math.round(rawFontSize * info.box.scale * 10) / 10)
  const fontFamily = fontFamilyOf(info.style.ffn)
  const textAlign = ALIGN_FROM_CODE[str(info.style.ta).toLowerCase()]
  const textAlignVertical = VALIGN_FROM_CODE[str(info.style.tav).toLowerCase()]
  const borderWidth = numOr(info.style.brw)
  const fillOpacity = numOr(info.style.bo)
  const borderStyle = info.style.brs === undefined ? undefined : BORDER_STYLE_FROM_CODE[num(info.style.brs, 0)]

  if (fontSize !== undefined) item.style.fontSize = fontSize
  if (fontFamily) item.style.fontFamily = fontFamily
  if (textAlign) item.style.textAlign = textAlign
  if (textAlignVertical) item.style.textAlignVertical = textAlignVertical
  if (fillOpacity !== undefined) item.style.fillOpacity = clamp01(fillOpacity)
  if (borderWidth !== undefined) item.style.borderWidth = borderWidth
  if (borderStyle) item.style.borderStyle = borderStyle
  if (borderColor) item.style.borderColor = borderColor

  switch (info.widgetType) {
    case 'sticker': {
      item.type = 'sticky_note'
      item.style.fillColor = fillColor ?? (info.style.bc === -1 ? 'transparent' : undefined)
      if (textColor) item.style.color = textColor
      item.data.content = text
      item.data.shape = ['6', '7'].indexOf(str(info.json.shape)) >= 0 ? 'round' : 'square'
      return item
    }
    case 'text': {
      item.type = 'text'
      if (textColor) item.style.color = textColor
      item.data.content = text
      if (textAlign) item.style.textAlign = textAlign
      if (fontSize !== undefined) item.style.fontSize = fontSize
      return item
    }
    case 'card': {
      item.type = 'card'
      if (fillColor) item.style.fillColor = fillColor
      if (textColor) item.style.color = textColor
      item.data.title = title
      item.data.description = description
      const url = str(info.json.url) || str(info.json.src) || str(info.json.imageUrl)
      if (url) item.data.url = url
      return item
    }
    case 'image':
    case 'preview':
    case 'embed': {
      item.type = 'image'
      if (fillColor) item.style.fillColor = fillColor
      const resource = asRecord(info.json.resource)
      const resourceId = str(resource.id) || str(info.json.resourceId)
      if (resourceId) item.data.resourceId = resourceId
      item.data.naturalWidth = numOr(resource.width)
      item.data.naturalHeight = numOr(resource.height)
      const crop = asRecord(info.json.crop)
      if (numOr(crop.width) !== undefined && numOr(crop.height) !== undefined) {
        item.data.crop = {
          x: num(crop.x, 0),
          y: num(crop.y, 0),
          width: num(crop.width, 0),
          height: num(crop.height, 0)
        }
      }
      const url = str(info.json.imageUrl) || str(info.json.src) || str(info.json.url)
      if (url) item.data.imageUrl = url
      const resourceInfo = asRecord(info.json.resource)
      item.data.title = str(info.json.title, title) || str(resourceInfo.name)
      item.data.altText = str(info.json.altText)
      return item
    }
    case 'paint':
    case 'pen':
    case 'drawing': {
      const points = strokePointsOf(info)
      if (points.length === 0) return null
      item.type = 'path'
      const stroke = styleColor(info.style.lc) ?? '#1a1a1a'
      const lineWidth = Math.max(1, num(info.style.t, 2))
      item.style.strokeColor = stroke
      item.style.strokeWidth = lineWidth
      item.style.opacity = clamp01(num(info.style.lo, 1))
      if (points.length === 1) {
        const side = lineWidth
        const center = { x: info.box.x + points[0].x, y: info.box.y + points[0].y }
        item.x = center.x - side / 2
        item.y = center.y - side / 2
        item.width = side
        item.height = side
        item.position = { x: center.x, y: center.y, origin: 'center', relativeTo: 'canvas_center' }
        item.geometry = { width: side, height: side, rotation: info.rotation }
        item.data.points = [{ x: side / 2, y: side / 2 }, { x: side / 2, y: side / 2 }]
      } else {
        item.data.points = points
      }
      item.data.closed = false
      return item
    }
    case 'frame':
    case 'section': {
      item.type = 'frame'
      if (fillColor) item.style.fillColor = fillColor
      item.data.title = title
      return item
    }
    case 'line':
    case 'connector': {
      item.type = 'connector'
      const box = boxOfPoints(info.points)
      item.x = box.x
      item.y = box.y
      item.width = box.width
      item.height = box.height
      item.position = {
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
        origin: 'center',
        relativeTo: 'canvas_center'
      }
      item.geometry = { width: box.width, height: box.height, rotation: info.rotation }
      const stroke = styleColor(info.style.lc)
      if (stroke) item.style.strokeColor = stroke
      item.style.strokeWidth = num(info.style.t, 2)
      item.style.strokeStyle = info.style.ls === undefined ? 'normal' : LINE_STYLE_FROM_CODE[num(info.style.ls, 2)]
      const startStroke = info.style.a_start === undefined ? 'none' : STROKE_FROM_CODE[num(info.style.a_start, 0)]
      const endStroke = info.style.a_end === undefined ? 'none' : STROKE_FROM_CODE[num(info.style.a_end, 0)]
      item.style.startStrokeCap = startStroke
      item.style.endStrokeCap = endStroke
      item.data.shape = info.style.lt === undefined ? 'straight' : LINE_TYPE_FROM_CODE[num(info.style.lt, 0)]
      const startRef = connectorAnchor(info.startAnchor, info.startWorld, info.object.id, box, byObjectId)
      const endRef = connectorAnchor(info.endAnchor, info.endWorld, info.object.id, box, byObjectId)
      item.data.startItem = startRef
      item.data.endItem = endRef
      item.data.startOffset = { x: startRef.position.x, y: startRef.position.y }
      item.data.endOffset = { x: endRef.position.x, y: endRef.position.y }
      item.data.startStroke = startStroke
      item.data.endStroke = endStroke
      item.data.points = info.points.map((point) => ({ x: point.x, y: point.y }))
      if (info.json.bends) item.data.bends = info.json.bends
      const captions = readCaptions(info.json)
      if (captions.length > 0) item.data.captions = captions.map((caption) => ({ content: caption }))
      return item
    }
    default: {
      const imageUrl = str(info.json.imageUrl)
      if (imageUrl) {
        item.type = 'image'
        item.data.imageUrl = imageUrl
        item.data.title = title
        if (text) item.data.content = text
        return item
      }
      const shapeCode = str(info.json.shape)
      const label = text || title || description
      if (!label && !shapeCode) return null
      item.type = 'shape'
      if (fillColor) item.style.fillColor = fillColor
      if (textColor) item.style.color = textColor
      item.data.content = label
      item.data.shape = SHAPE_BY_TYPE[shapeCode] ?? 'rectangle'
      return item
    }
  }
}

function readCaptions(json: WidgetJson): string[] {
  const line = asRecord(json.line)
  if (!Array.isArray(line.captions)) return []
  const captions: string[] = []
  for (const entry of line.captions) {
    const source = asRecord(entry)
    const text = str(source.text) || str(source.content)
    if (text) captions.push(text)
  }
  return captions
}

function uniqueId(object: ClipboardObject, used: Set<string>): string {
  const base = str(object.initialId) || `item_${object.id}`
  let id = base
  let counter = 2
  while (used.has(id)) {
    id = `${base}_${counter}`
    counter += 1
  }
  used.add(id)
  return id
}

function widgetParentIndex(json: WidgetJson): number | undefined {
  const parent = json._parent
  if (typeof parent === 'number' && Number.isFinite(parent)) return parent
  return numOr(asRecord(parent).index)
}

function resolveWidgetOrigins(list: ClipboardObject[]): Map<number, SourcePoint> {
  const byId = new Map<number, ClipboardObject>()
  const groupMembers = new Map<number, number[]>()
  for (const object of list) {
    if (object.widgetData) byId.set(object.id, object)
    else if (object.type === GROUP_TYPE && Array.isArray(object.items)) groupMembers.set(object.id, object.items)
  }
  const origins = new Map<number, SourcePoint>()
  const attachedTo = (object: ClipboardObject): boolean =>
    str(asRecord(asRecord(object.widgetData?.json)._position).schema) === 'parentOffsetPx'
  const groupOrigin = (id: number): SourcePoint | null => {
    const members = groupMembers.get(id)
    if (!members) return null
    let point: SourcePoint | null = null
    for (const memberId of members) {
      const member = byId.get(memberId)
      if (!member || attachedTo(member)) continue
      const resolved = parentTopLeft(member, visit(member, new Set([id])))
      if (!resolved) continue
      point = point ? { x: Math.min(point.x, resolved.x), y: Math.min(point.y, resolved.y) } : resolved
    }
    return point
  }
  const parentTopLeft = (object: ClipboardObject, anchor: SourcePoint | null): SourcePoint | null => {
    if (!anchor) return null
    const widget = asRecord(object.widgetData)
    const type = str(widget.type).toLowerCase() || 'shape'
    const box = strokeBox(type, asRecord(widget.json), anchor)
    return { x: box.x, y: box.y }
  }
  const visit = (object: ClipboardObject, trail: Set<number>): SourcePoint | null => {
    const cached = origins.get(object.id)
    if (cached) return cached
    const json = object.widgetData?.json ?? {}
    const position = asRecord(json._position)
    const offset = asRecord(position.offsetPx)
    const x = numOr(offset.x)
    const y = numOr(offset.y)
    if (x === undefined || y === undefined) return null
    const parentIndex = widgetParentIndex(json)
    const attached = str(position.schema) === 'parentOffsetPx'
    let point = { x, y }
    if (attached && parentIndex !== undefined && !trail.has(object.id)) {
      const parent = byId.get(parentIndex)
      const next = new Set(trail)
      next.add(object.id)
      const base = parent && parent !== object ? parentTopLeft(parent, visit(parent, next)) : groupOrigin(parentIndex)
      if (base) point = { x: base.x + x, y: base.y + y }
    }
    origins.set(object.id, point)
    return point
  }
  for (const object of list) {
    if (object.widgetData) visit(object, new Set())
  }
  return origins
}

export function clipboardObjectsToRawItems(
  objects: ClipboardObject[],
  shift?: { x: number; y: number }
): RawItem[] {
  const list = Array.isArray(objects) ? objects : []
  const shiftX = numOr(shift?.x) ?? 0
  const shiftY = numOr(shift?.y) ?? 0
  const byObjectId = new Map<number, WidgetInfo>()
  const used = new Set<string>()
  const infos: WidgetInfo[] = []
  const origins = resolveWidgetOrigins(list)

  for (const object of list) {
    if (!object.widgetData || object.type === GROUP_TYPE) continue
    const widgetType = str(object.widgetData.type).toLowerCase() || 'shape'
    const json = object.widgetData.json ?? {}
    const box = strokeBox(widgetType, json, origins.get(object.id))
    const width = Math.max(1, box.width)
    const height = Math.max(1, box.height)
    const info: WidgetInfo = {
      object,
      id: uniqueId(object, used),
      widgetType,
      json,
      style: parseStyle(json.style),
      box,
      origin: { x: box.x - shiftX, y: box.y - shiftY },
      center: { x: box.x + width / 2 - shiftX, y: box.y + height / 2 - shiftY },
      width,
      height,
      rotation: readRotation(json),
      startAnchor: null,
      endAnchor: null,
      startWorld: { x: 0, y: 0 },
      endWorld: { x: 0, y: 0 },
      points: [],
      rawItemId: null
    }
    byObjectId.set(object.id, info)
    infos.push(info)
  }

  for (const info of infos) {
    if (info.widgetType === 'line' || info.widgetType === 'connector') connectorGeometry(info, byObjectId)
  }

  const rawByObjectId = new Map<number, RawItem>()
  for (const info of infos) {
    const item = buildRawItem(info, byObjectId)
    if (!item) continue
    info.rawItemId = item.id
    rawByObjectId.set(info.object.id, item)
  }

  const result: RawItem[] = []
  for (const info of infos) {
    const item = rawByObjectId.get(info.object.id)
    if (!item) continue
    const parentId = widgetParentIndex(info.json)
    if (parentId !== undefined && parentId !== null) {
      const parent = rawByObjectId.get(parentId)
      if (parent) item.parentId = parent.id
    }
    result.push(item)
  }

  for (const object of list) {
    if (object.type !== GROUP_TYPE) continue
    const children = Array.isArray(object.items) ? object.items : []
    const members = children
      .map((childId) => rawByObjectId.get(childId))
      .filter((child): child is RawItem => child !== undefined)
    if (members.length < 2) continue
    const groupId = uniqueId(object, used)
    for (const member of members) {
      if (!member.parentId) member.groupId = groupId
    }
  }

  return result
}

function buildStyleString(style: StyleMap): string {
  return styleString(style)
}

function anchorForExport(
  itemId: unknown,
  offset: SourcePoint | undefined,
  fallback: SourcePoint,
  localIds: Map<string, number>
): Anchor {
  const id = str(itemId)
  const localId = localIds.get(id)
  if (id && localId !== undefined) {
    return {
      point: { x: clamp01(offset?.x ?? 0.5), y: clamp01(offset?.y ?? 0.5) },
      positionType: 0,
      widgetIndex: localId
    }
  }
  return { point: { x: fallback.x, y: fallback.y }, positionType: 1, widgetIndex: FREE_END_INDEX }
}

function exportWidgetObject(
  item: SourceBoardItem,
  kind: string,
  localId: number,
  localIds: Map<string, number>,
  itemsById: Map<string, SourceBoardItem>
): ClipboardObject {
  const object: ClipboardObject = {
    type: WIDGET_TYPE,
    id: localId,
    initialId: str(item.id, String(localId))
  }
  const width = Math.max(1, num(item.w, 1))
  const height = Math.max(1, num(item.h, 1))
  const center = { x: num(item.x, 0) + width / 2, y: num(item.y, 0) + height / 2 }
  const json: WidgetJson = {
    position: center,
    size: { width, height },
    rotation: { rotation: num(item.rotation, 0) }
  }
  const style: StyleMap = {}
  const textColor = str(item.textColor)
  const addFont = (): void => {
    const fontSize = numOr(item.fontSize)
    if (fontSize !== undefined) {
      style.st = fontSize
      style.fs = fontSize
    }
    const font = fontNameOf(item.fontFamily)
    if (font) style.ffn = font
    const align = ALIGN_TO_CODE[str(item.textAlign ?? item.align ?? '').toLowerCase()]
    if (align) style.ta = align
    const valign = VALIGN_TO_CODE[str(item.textAlignVertical ?? '').toLowerCase()]
    if (valign) style.tav = valign
  }

  if (kind === 'sticky') {
    object.widgetData = { type: 'sticker', json }
    json.shape = item.shape === 'round' || item.shape === 'round_rectangle' ? '7' : '3'
    json.text = str(item.content)
    style.bc = intFromColor(str(item.color))
    style.bo = 1
    addFont()
    json.style = buildStyleString(style)
    return object
  }

  if (kind === 'text') {
    object.widgetData = { type: 'text', json }
    json.text = str(item.content)
    style.tc = intFromColor(textColor && textColor !== 'transparent' ? textColor : '#1a1a1a')
    addFont()
    json.style = buildStyleString(style)
    return object
  }

  if (kind === 'card') {
    object.widgetData = { type: 'card', json }
    json.title = str(item.title)
    json.description = str(item.description)
    json.url = str(item.urls && item.urls.length > 0 ? item.urls[0] : '')
    style.bc = intFromColor(str(item.color, '#f4f4f4'))
    addFont()
    json.style = buildStyleString(style)
    return object
  }

  if (kind === 'image') {
    object.widgetData = { type: 'shape', json }
    json.shape = '3'
    json.text = str(item.alt) || str(item.title)
    const imageUrl = str((item.asset as { sourceUrl?: string } | undefined)?.sourceUrl) || str(item.urls && item.urls.length > 0 ? item.urls[0] : '')
    if (imageUrl) json.imageUrl = imageUrl
    style.bc = -1
    style.brc = -1
    addFont()
    json.style = buildStyleString(style)
    return object
  }

  if (kind === 'connector') {
    const points = Array.isArray(item.points) ? item.points.map((point) => ({ x: num(point.x, 0), y: num(point.y, 0) })) : []
    const source = itemsById.get(str(item.startItemId))
    const target = itemsById.get(str(item.endItemId))
    const start = points[0] ?? { x: num(item.x, 0), y: num(item.y, 0) }
    const end = points[points.length - 1] ?? start
    const box = boxOfPoints(points.length >= 2 ? points : [start, end])
    const origin = { x: box.x, y: box.y }
    object.widgetData = { type: 'line', json }
    json.position = origin
    json.size = { width: box.width, height: box.height }
    json.points = points.map((point) => ({ x: point.x - origin.x, y: point.y - origin.y }))
    if (item.bends) json.bends = item.bends
    json.primary = anchorForExport(source ? source.id : item.startItemId, item.startOffset, start, localIds)
    json.secondary = anchorForExport(target ? target.id : item.endItemId, item.endOffset, end, localIds)
    style.lc = intFromColor(str(item.color, '#1a1a1a'))
    style.ls = LINE_STYLE_TO_CODE[str(item.lineStyle ?? 'normal').toLowerCase()] ?? 2
    style.t = num(item.lineWidth, 2)
    style.lt = LINE_TYPE_TO_CODE[str(item.shape ?? 'curved').toLowerCase()] ?? 2
    style.a_start = STROKE_TO_CODE[str(item.startStroke ?? 'none').toLowerCase()] ?? 0
    style.a_end = STROKE_TO_CODE[str(item.endStroke ?? 'none').toLowerCase()] ?? 0
    const captions = Array.isArray(item.captions) ? item.captions.filter((caption) => str(caption)) : []
    if (captions.length > 0) json.line = { captions: captions.map((caption) => ({ id: str(item.id) + '-caption', text: str(caption) })) }
    json.style = buildStyleString(style)
    return object
  }

  object.widgetData = { type: 'shape', json }
  json.shape = TYPE_BY_SHAPE[str(item.shape ?? 'rectangle').toLowerCase()] ?? '3'
  json.text = str(item.content)
  style.bc = intFromColor(str(item.fillColor))
  style.bo = clamp01(num(item.opacity, 1))
  style.brc = intFromColor(str(item.borderColor))
  style.brw = num(item.borderWidth, 2)
  style.brs = BORDER_STYLE_TO_CODE[str(item.borderStyle ?? 'normal').toLowerCase()] ?? 0
  if (textColor && textColor !== 'transparent') style.tc = intFromColor(textColor)
  addFont()
  json.style = buildStyleString(style)
  return object
}

const EXPORTED_KINDS: Record<string, true> = {
  sticky: true,
  text: true,
  shape: true,
  card: true,
  image: true,
  connector: true
}

export function rawItemsToClipboardObjects(items: BoardItem[]): ClipboardObject[] {
  const list = Array.isArray(items) ? items : []
  const itemsById = new Map<string, SourceBoardItem>()
  for (const item of list) itemsById.set(str(item.id), item)
  const localIds = new Map<string, number>()
  let nextId = 1
  for (const item of list) {
    const kind = str(item.kind).toLowerCase()
    if (!EXPORTED_KINDS[kind]) continue
    localIds.set(str(item.id), nextId)
    nextId += 1
    if (nextId > MAX_LOCAL_ID) nextId = MAX_LOCAL_ID
  }
  const objects: ClipboardObject[] = []
  for (const item of list) {
    const kind = str(item.kind).toLowerCase()
    if (!EXPORTED_KINDS[kind]) continue
    const localId = localIds.get(str(item.id))
    if (localId === undefined) continue
    objects.push(exportWidgetObject(item, kind, localId, localIds, itemsById))
  }
  return objects
}

const SELF_TEST_SAMPLE = JSON.stringify({
  text: 'Съешь ещё этих мягких французских булок, да выпей чаю. 😀 🎉',
  cjk: '日本語のテキスト 中文测试 한국어',
  emoji: '🚀✨🧩',
  mixed: 'Привет, мир! 👋 你好'
})

const ANCHORED_SAMPLE: ClipboardPayload = {
  isProtected: false,
  boardId: 'anchored-board',
  data: {
    meta: {},
    objects: [
      {
        type: WIDGET_TYPE,
        id: 0,
        initialId: '3458764687506648018',
        widgetData: {
          type: 'image',
          json: {
            _position: { offsetPx: { x: -4025.3798271710366, y: -2856.764850902663 }, schema: 'canvasOffsetPx' },
            scale: { scale: 4.013175595583701 },
            relativeScale: 4.013175595583701,
            rotation: { rotation: 0 },
            relativeRotation: 0,
            _parent: null,
            crop: { x: 0, y: 0, width: 343, height: 180, shape: 'custom' },
            resource: { id: '3458764518276001096', name: 'image.png', width: 343, height: 180 }
          }
        }
      },
      {
        type: WIDGET_TYPE,
        id: 1,
        initialId: '3458764687506648019',
        widgetData: {
          type: 'paint',
          json: {
            _position: { offsetPx: { x: 189.3, y: 26.5 }, schema: 'parentOffsetPx', containerType: 'CURVE_HOLDER' },
            scale: { scale: 1 },
            relativeScale: 0.2491792288133243,
            rotation: { rotation: 0 },
            relativeRotation: 0,
            _parent: { index: 0 },
            points: [
              { x: 0, y: 0 },
              { x: 80, y: 40 },
              { x: 165.3, y: 110.2 }
            ],
            style: JSON.stringify({ lc: 0x1a1a1a, t: 2, lo: 1, e: 2.667 })
          }
        }
      }
    ]
  },
  version: DATA_VERSION,
  host: SOURCE_HOST
}

export function selfTest(): boolean {
  try {
    if (decodePayloadString(encodePayloadString(SELF_TEST_SAMPLE)) !== SELF_TEST_SAMPLE) return false
    const sample = JSON.parse(SELF_TEST_SAMPLE) as { text: string; cjk: string; emoji: string; mixed: string }
    const shapeObject: ClipboardObject = {
      type: WIDGET_TYPE,
      id: 42,
      initialId: '3458764512345',
      widgetData: {
        type: 'shape',
        json: {
          position: { x: 120.5, y: -40.25 },
          size: { width: 240, height: 160 },
          shape: '5',
          text: sample.text,
          style: JSON.stringify({ bc: 0xfff9b1, bo: 1, brc: 0x1a1a1a, brw: 2, brs: 0, tc: 0x000000, ffn: 'OpenSans', fs: 14, ta: 'c', tav: 'm' })
        }
      }
    }
    const lineObject: ClipboardObject = {
      type: WIDGET_TYPE,
      id: 43,
      initialId: '3458764512346',
      widgetData: {
        type: 'line',
        json: {
          position: { x: 0, y: 0 },
          primary: { point: { x: 1, y: 0.5 }, positionType: 0, widgetIndex: 42 },
          secondary: { point: { x: 300, y: 100 }, positionType: 1, widgetIndex: -1 },
          line: { captions: [{ id: 'c1', text: sample.mixed }] },
          style: JSON.stringify({ lc: 0x1a1a1a, ls: 2, t: 2, lt: 2, a_start: 0, a_end: 9 })
        }
      }
    }
    const payload: ClipboardPayload = {
      isProtected: false,
      boardId: 'self-test-board',
      data: { meta: [], objects: [shapeObject, lineObject], shift: { x: 0, y: 0, tokenizerIdDec: 't' } },
      version: DATA_VERSION,
      host: SOURCE_HOST
    }
    const html = encodeBoardClipboard(payload)
    if (!isBoardClipboardHtml(html)) return false
    const decoded = decodeBoardClipboard(html)
    if (decoded.version !== DATA_VERSION || decoded.host !== SOURCE_HOST || decoded.boardId !== 'self-test-board') return false
    if (decoded.data.objects.length !== 2) return false
    const shapeJson = decoded.data.objects[0].widgetData?.json ?? {}
    if (str(shapeJson.text) !== sample.text) return false
    if (JSON.stringify(decodeBoardClipboard(encodeBoardClipboard(decoded))) !== JSON.stringify(decoded)) return false
    const raw = clipboardObjectsToRawItems(decoded.data.objects, decoded.data.shift)
    if (raw.length !== 2) return false
    const shapeRaw = raw[0]
    if (shapeRaw.type !== 'shape') return false
    if (str(shapeRaw.data.content) !== sample.text) return false
    if (shapeRaw.style.fillColor !== colorFromInt(0xfff9b1)) return false
    if (Math.round(shapeRaw.position.x) !== 121 || Math.round(shapeRaw.position.y) !== -40) return false
    if (shapeRaw.width !== 240 || shapeRaw.height !== 160) return false
    const lineRaw = raw[1]
    if (lineRaw.type !== 'connector') return false
    if (!lineRaw.data.startItem || str(lineRaw.data.startItem.id) !== shapeRaw.id) return false
    if (Math.round(num(lineRaw.data.startItem.position.x, 0) * 1000) !== 1000) return false
    const linePoints = Array.isArray(lineRaw.data.points) ? lineRaw.data.points : []
    if (linePoints.length < 2) return false
    const back: BoardItem = {
      id: 'raw-shape',
      kind: 'shape',
      x: shapeRaw.x,
      y: shapeRaw.y,
      w: shapeRaw.width,
      h: shapeRaw.height,
      rotation: 0,
      z: 0,
      shape: 'triangle',
      content: sample.text,
      plain: sample.text,
      fillColor: '#fff9b1',
      borderColor: '#1a1a1a',
      borderWidth: 2,
      borderStyle: 'normal',
      opacity: 1,
      textAlign: 'center',
      textAlignVertical: 'middle',
      fontSize: 14,
      fontFamily: 'Open Sans',
      urls: []
    }
    const objects = rawItemsToClipboardObjects([back])
    if (objects.length !== 1 || objects[0].type !== WIDGET_TYPE) return false
    const backJson = objects[0].widgetData?.json ?? {}
    if (str(objects[0].widgetData?.type) !== 'shape') return false
    if (str(backJson.text) !== sample.text) return false
    if (str(backJson.shape) !== '5') return false
    const backStyle = parseStyle(backJson.style)
    if (numOr(backStyle.bc) !== 0xfff9b1 || numOr(backStyle.brc) !== 0x1a1a1a) return false
    if (fontFamilyOf(backStyle.ffn) !== 'Open Sans') return false
    if (str(backStyle.ta) !== 'c' || str(backStyle.tav) !== 'm') return false
    const reparsed = decodeBoardClipboard(encodeBoardClipboard(normalizePayload({ version: 2, host: SOURCE_HOST, data: { objects } })))
    if (str(reparsed.data.objects[0].widgetData?.json.text) !== sample.text) return false
    const reparsedRaw = clipboardObjectsToRawItems(reparsed.data.objects)
    if (reparsedRaw.length !== 1 || str(reparsedRaw[0].data.content) !== sample.text) return false
    const anchoredRaw = clipboardObjectsToRawItems(ANCHORED_SAMPLE.data.objects)
    if (anchoredRaw.length !== 2) return false
    const anchoredImage = anchoredRaw[0]
    const anchoredStroke = anchoredRaw[1]
    if (Math.round(anchoredImage.width) !== 1377 || Math.round(anchoredImage.height) !== 722) return false
    if (Math.round(anchoredImage.x) !== -4714 || Math.round(anchoredImage.y) !== -3218) return false
    if (anchoredStroke.type !== 'path' || anchoredStroke.parentId !== anchoredImage.id) return false
    if (Math.round(anchoredStroke.width) !== 165 || Math.round(anchoredStroke.height) !== 110) return false
    if (Math.abs(anchoredStroke.position.x - -4524) > 1) return false
    if (Math.abs(anchoredStroke.position.y - -3191) > 1) return false
    const groupObjects: ClipboardObject[] = [
      {
        type: WIDGET_TYPE,
        id: 0,
        initialId: 'group-shape',
        widgetData: {
          type: 'shape',
          json: {
            _position: { offsetPx: { x: 0, y: 0 }, schema: 'canvasOffsetPx' },
            scale: { scale: 1 },
            size: { width: 100, height: 50 },
            text: 'а',
            style: '{}'
          }
        }
      },
      {
        type: WIDGET_TYPE,
        id: 1,
        initialId: 'group-relative',
        widgetData: {
          type: 'shape',
          json: {
            _position: { offsetPx: { x: 200, y: 50 }, schema: 'parentOffsetPx' },
            scale: { scale: 1 },
            _parent: { index: 2 },
            size: { width: 100, height: 50 },
            text: 'б',
            style: '{}'
          }
        }
      },
      { type: GROUP_TYPE, id: 2, items: [0, 1] },
      {
        type: WIDGET_TYPE,
        id: 3,
        initialId: 'dangling-line',
        widgetData: {
          type: 'line',
          json: {
            _position: { offsetPx: { x: 0, y: 0 }, schema: 'canvasOffsetPx' },
            scale: { scale: 1 },
            points: [
              { x: 0, y: 0 },
              { x: 300, y: 100 }
            ],
            primary: { point: { x: 0.5, y: 1 }, positionType: 0, widgetIndex: 0 },
            secondary: { point: { x: 3, y: 1 }, positionType: 0, widgetIndex: 77 },
            style: '{}'
          }
        }
      }
    ]
    const groupRaw = clipboardObjectsToRawItems(groupObjects)
    if (groupRaw.length !== 3) return false
    const plainShape = groupRaw.find((item) => item.id === 'group-shape')
    const relativeShape = groupRaw.find((item) => item.id === 'group-relative')
    const danglingLine = groupRaw.find((item) => item.id === 'dangling-line')
    if (!plainShape || !relativeShape || !danglingLine) return false
    if (str(plainShape.groupId) === '' || plainShape.groupId !== relativeShape.groupId) return false
    if (Math.round(relativeShape.x) !== 100 || Math.round(relativeShape.y) !== 0) return false
    if (str(danglingLine.data.endItem?.id) !== '') return false
    const dotRaw = clipboardObjectsToRawItems([
      {
        type: WIDGET_TYPE,
        id: 0,
        initialId: 'single-point-brush',
        widgetData: {
          type: 'paint',
          json: {
            _position: { offsetPx: { x: 40, y: -70 }, schema: 'canvasOffsetPx' },
            scale: { scale: 1 },
            points: [{ x: 0, y: 0 }],
            style: JSON.stringify({ lc: 0x1a1a1a, t: 6 })
          }
        }
      }
    ])
    if (dotRaw.length !== 1) return false
    const dot = dotRaw[0]
    if (dot.type !== 'path') return false
    if (dot.width !== 6 || dot.height !== 6) return false
    if (Math.round(dot.position.x) !== 40 || Math.round(dot.position.y) !== -70) return false
    const dotPoints = Array.isArray(dot.data.points) ? dot.data.points : []
    if (dotPoints.length !== 2) return false
    if (dotPoints[0].x !== 3 || dotPoints[0].y !== 3) return false
    return true
  } catch {
    return false
  }
}