export type ItemKind =
  | 'sticky'
  | 'text'
  | 'shape'
  | 'image'
  | 'frame'
  | 'connector'
  | 'card'
  | 'embed'
  | 'video'
  | 'table'
  | 'vote'
  | 'group'
  | 'tag'
  | 'document'
  | 'app_card'
  | 'code'
  | 'path'
  | 'comment'
  | 'solid'
  | 'graph'
  | 'unknown'

export type SourceKind = 'server-api' | 'page-capture' | 'file' | 'demo'

export interface SourceInfo {
  kind: SourceKind
  url?: string
  boardId?: string
  teamId?: string
  name?: string
  importedAt: string
  itemCount?: number
  truncated?: boolean
  notes?: string[]
}

export interface AssetRef {
  file: string
  mime: string
  bytes: number
  width?: number
  height?: number
  sourceUrl?: string
  sourceId?: string
  local?: boolean
  dataUrl?: string
}

export interface TextPoint {
  x: number
  y: number
}

export interface ItemBase {
  id: string
  kind: ItemKind
  sourceType?: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  z: number
  parentId?: string
  relative?: 'canvas_center' | 'parent_top_left'
  locked?: boolean
  createdAt?: string
  modifiedAt?: string
  author?: string
  tagIds?: string[]
  groupId?: string
  raw?: unknown
}

export interface StickyItem extends ItemBase {
  kind: 'sticky'
  content: string
  plain: string
  color: string
  textColor?: string
  shape: 'square' | 'round'
  textAlign: 'left' | 'center' | 'right'
  textAlignVertical: 'top' | 'middle' | 'bottom'
  fontSize: number
  urls: string[]
  linkToFrame: boolean
}

export interface TextItem extends ItemBase {
  kind: 'text'
  content: string
  plain: string
  color: string
  align: 'left' | 'center' | 'right'
  fontSize: number
  fontFamily?: string
  column?: boolean
  urls: string[]
}

export const SHAPE_NAMES = [
  'rectangle',
  'round_rectangle',
  'square',
  'circle',
  'semicircle',
  'quarter_circle',
  'arch',
  'heart',
  'drop',
  'moon',
  'ring',
  'lens',
  'pill',
  'leaf',
  'triangle',
  'right_triangle',
  'diamond',
  'pentagon',
  'hexagon',
  'octagon',
  'trapezoid',
  'parallelogram',
  'star',
  'star_six',
  'sparkle',
  'star_burst',
  'pie',
  'cross',
  'cross_x',
  'shield',
  'tag',
  'seal',
  'lightning',
  'frame',
  'cloud',
  'blob',
  'speech_round',
  'speech_oval',
  'bookmark',
  'ribbon',
  'chevron',
  'arrow_right',
  'arrow_left',
  'arrow_up',
  'arrow_down',
  'arrow_double',
  'arrow_up_down',
  'arrow_four_way',
  'arrow_bend',
  'arrow_bend_flip',
  'arrow_circular',
  'speech_rect',
  'speech_cloud',
  'flowchart_start',
  'flowchart_end',
  'flowchart_process',
  'flowchart_decision',
  'flowchart_input_output',
  'flowchart_document',
  'flowchart_database',
  'flowchart_stored',
  'flowchart_predefined',
  'flowchart_internal',
  'flowchart_manual_input',
  'flowchart_manual_op',
  'flowchart_display',
  'flowchart_merge',
  'flowchart_or',
  'flowchart_sum',
  'flowchart_extract',
  'flowchart_delay',
  'flowchart_connector',
  'flowchart_offpage',
  'flowchart_preparation',
  'unknown'
] as const

export type ShapeName = (typeof SHAPE_NAMES)[number]

export interface ShapeItem extends ItemBase {
  kind: 'shape'
  shape: ShapeName
  content: string
  plain: string
  fillColor: string
  borderColor: string
  borderWidth: number
  borderStyle: 'normal' | 'dotted' | 'dashed'
  opacity: number
  textAlign: 'left' | 'center' | 'right'
  textAlignVertical: 'top' | 'middle' | 'bottom'
  fontSize: number
  textColor?: string
  fontFamily?: string
  adjust?: number
  adjust2?: number
  tail?: RelativeOffset
  vertices?: RelativeOffset[]
  urls: string[]
}

export interface ImageItem extends ItemBase {
  kind: 'image'
  asset?: AssetRef
  alt: string
  title: string
  opacity: number
  crop?: { top: number; right: number; bottom: number; left: number }
  urls: string[]
  unsupported?: boolean
}

export interface GraphExpr {
  id: string
  formula: string
  color: string
  lineWidth: number
  visible: boolean
}

export interface GraphItem extends ItemBase {
  kind: 'graph'
  scale: number
  originX: number
  originY: number
  gridStep: number
  showGrid: boolean
  showLabels: boolean
  axisColor: string
  lineWidth: number
  expressions: GraphExpr[]
}

export interface FrameItem extends ItemBase {
  kind: 'frame'
  title: string
  titleColor: string
  color: string
  fillColor: string
  format?: string
  frameType?: string
  showContent?: boolean
  locked?: boolean
}

export type ConnectorShape = 'straight' | 'curved' | 'elbowed'
export type StrokeEnd =
  | 'none'
  | 'stealth'
  | 'rounded_stealth'
  | 'diamond'
  | 'filled_diamond'
  | 'oval'
  | 'filled_oval'
  | 'arrow'
  | 'triangle'
  | 'filled_triangle'
  | 'unknown'

export interface RelativeOffset {
  x: number
  y: number
}

export interface ConnectorBend {
  at: number
  x: number
  y: number
}

export interface ConnectorItem extends ItemBase {
  kind: 'connector'
  points: TextPoint[]
  shape: ConnectorShape
  color: string
  lineWidth: number
  lineStyle: 'normal' | 'dotted' | 'dashed'
  startStroke: StrokeEnd
  endStroke: StrokeEnd
  startItemId?: string
  endItemId?: string
  startOffset?: RelativeOffset
  endOffset?: RelativeOffset
  captions?: string[]
  textColor?: string
  bends?: ConnectorBend[]
  unsupported?: boolean
}

export interface CardItem extends ItemBase {
  kind: 'card'
  title: string
  description: string
  color: string
  thumbnail?: AssetRef
  asset?: AssetRef
  urls: string[]
  dueDate?: string
  assigneeId?: string
}

export interface EmbedItem extends ItemBase {
  kind: 'embed'
  url: string
  provider: string
  title: string
  description?: string
  contentType?: string
  asset?: AssetRef
}

export interface VideoItem extends ItemBase {
  kind: 'video'
  url: string
  title: string
  asset?: AssetRef
}

export interface TableItem extends ItemBase {
  kind: 'table'
  columns: number
  rows: number
  columnWidths: number[]
  rowHeights: number[]
  cells: string[]
  fontSize: number
}

export interface VoteItem extends ItemBase {
  kind: 'vote'
  title: string
  total: number
  variant?: string
}

export interface GroupItem extends ItemBase {
  kind: 'group'
  title: string
  itemIds: string[]
  color?: string
}

export interface TagItem extends ItemBase {
  kind: 'tag'
  title: string
  color: string
}

export interface DocumentItem extends ItemBase {
  kind: 'document'
  title: string
  asset?: AssetRef
  pages?: number
}

export interface AppCardItem extends ItemBase {
  kind: 'app_card'
  title: string
  description: string
  appId: string
  viewLink: string
  urls: string[]
  fields?: Array<{ value: string; textColor?: string; fillColor?: string; tooltip?: string; iconUrl?: string }>
  status?: string
}

export interface CodeItem extends ItemBase {
  kind: 'code'
  content: string
  plain: string
  language?: string
  color: string
  fontSize: number
}

export interface PathItem extends ItemBase {
  kind: 'path'
  points: TextPoint[]
  color: string
  lineWidth: number
  closed: boolean
  opacity?: number
  widths?: number[]
}

export type SolidKind = 'cube' | 'pyramid' | 'prism' | 'cylinder' | 'cone' | 'sphere'

export interface SolidFace {
  id: string
  color: string
  opacity?: number
}

export interface SolidSketch {
  face: string
  points: Array<{ x: number; y: number }>
  color: string
  lineWidth: number
  through?: Array<{ face: string; point: { x: number; y: number } }>
}

export interface SolidLabel {
  face: string
  point: { x: number; y: number }
  text: string
  size: number
}

export interface SolidItem extends ItemBase {
  kind: 'solid'
  solid: SolidKind
  edge: number
  pitch: number
  yaw: number
  faces: SolidFace[]
  tint?: string
  sketch: SolidSketch[]
  labels?: SolidLabel[]
  lineWidth: number
  color: string
  showEdges: boolean
  showHidden?: boolean
  showAxes?: boolean
  showFaceGrid?: boolean
}

export interface CommentItem extends ItemBase {
  kind: 'comment'
  content: string
  plain: string
  author?: string
  resolved?: boolean
}

export interface UnknownItem extends ItemBase {
  kind: 'unknown'
  label?: string
}

export type BoardItem =
  | StickyItem
  | TextItem
  | ShapeItem
  | ImageItem
  | FrameItem
  | ConnectorItem
  | CardItem
  | EmbedItem
  | VideoItem
  | TableItem
  | VoteItem
  | GroupItem
  | TagItem
  | DocumentItem
  | AppCardItem
  | CodeItem
  | PathItem
  | SolidItem
  | GraphItem
  | CommentItem
  | UnknownItem

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface DocStats {
  items: number
  byKind: Record<string, number>
  frames: number
  images: number
  connectors: number
  texts: number
  sticky: number
  plainChars: number
  assetsBytes: number
}

export interface BoardDoc {
  schemaVersion: number
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  bounds: Rect
  viewport?: { x: number; y: number; zoom: number }
  items: BoardItem[]
  assets: Record<string, AssetRef>
  stats: DocStats
  source: SourceInfo
  projectId?: string
  thumbnail?: string
  tags: string[]
  favorite: boolean
  archived: boolean
  color?: string
}

export interface BoardWorkspace {
  invite?: string
  calculator?: {
    source?: string
    history?: Array<{ expression: string; result: string }>
  }
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  order: number
  color?: string
  icon?: string
  iconColor?: string
  glyph?: string
  hasIconImage?: boolean
  pinned?: boolean
}

export interface BoardMeta {
  id: string
  title: string
  description?: string
  createdAt: string
  updatedAt: string
  bounds: Rect
  itemCount: number
  thumbnail?: string
  projectId?: string
  tags: string[]
  favorite: boolean
  archived: boolean
  color?: string
  sourceKind: SourceKind
  sourceUrl?: string
  sourceBoardId?: string
  assetBytes: number
  order?: number
}

export interface LibraryIndex {
  schemaVersion: number
  boards: BoardMeta[]
  projects: Project[]
  lastOpenedBoardId?: string
}

export type GridMode = 'none' | 'lines' | 'dots'

export interface BrushPreset {
  color: string
  width: number
}

export interface Settings {
  theme: 'light' | 'dark' | 'system'
  gridSize: number
  gridMode: GridMode
  snapGrid: boolean
  alignSnap: boolean
  userName: string
  exportScale: number
  exportBackground: 'white' | 'transparent' | 'board'
  imageQuality: 'original' | 'high' | 'medium'
  uiScale: number
  toolbarOrder: string[]
  toolbarExtras: string[]
  brushPresets?: BrushPreset[]
  brushIndex?: number
  markerPresets?: BrushPreset[]
  markerIndex?: number
  captureToken?: string
}

export type ImportPhase =
  | 'idle'
  | 'starting'
  | 'auth'
  | 'board'
  | 'items'
  | 'assets'
  | 'saving'
  | 'done'
  | 'error'
  | 'cancelled'

export interface ImportProgress {
  id: string
  kind: 'api' | 'capture' | 'file'
  phase: ImportPhase
  message: string
  percent: number
  items?: number
  assets?: number
  totalAssets?: number
  boardTitle?: string
  warnings: string[]
  canCancel: boolean
  detail?: string
}

export interface ApiImportOptions {
  token: string
  boardRef: string
  name?: string
  projectId?: string
  downloadImages: boolean
  withStyles: boolean
  maxImageBytes: number
}

export interface CaptureOptions {
  url: string
  autoSweep: boolean
  downloadImages: boolean
  maxImageBytes: number
}

export interface ExportOptions {
  docId: string
  format: 'liro' | 'png' | 'pdf' | 'html' | 'json' | 'zip' | 'svg'
  scope: 'board' | 'frame' | 'selection'
  targetId?: string
  scale: number
  background: 'white' | 'transparent'
  selectionIds?: string[]
  pdfMode: 'single' | 'tiles'
  pdfTileCols: number
  pdfTileRows: number
  pdfPaper: 'a4' | 'a3'
  openFolder: boolean
  overwrite: boolean
}

export interface ExportResult {
  ok: boolean
  path?: string
  bytes?: number
  width?: number
  height?: number
  message?: string
}

export interface BoardOpenInfo {
  doc: BoardDoc
  warnings: string[]
}