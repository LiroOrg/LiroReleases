import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { parseRichText, type Block, type Run } from '@shared/richtext'
import { contrastColor } from '@shared/color'
import type { BoardDoc, BoardItem, Rect, SolidItem, TextItem } from '@shared/types'
import { curvePath } from '@shared/curve'
import { connectorBounds } from '@shared/geometry'
import { formatBytes, rotatedBox } from '@shared/util'
import { solidBounds } from '@shared/three'
import { youtubeId } from '../lib/youtube'
import type { MediaBridge } from '../live/mediaSync'
import { TableView } from './tableView'
import { fileHtml, loadFileHtml, subscribeFileHtml } from './filePeek'
import { shapePath, strokeDash } from '@shared/shapes'
import { SolidView } from './solidView'
import { GraphView } from './graphView'
import { YouTubePlayer } from './videoPlayer'

const solidBoxCache = new WeakMap<SolidItem, Rect>()

function solidRect(item: SolidItem): Rect {
  const cached = solidBoxCache.get(item)
  if (cached) return cached
  const size = solidBounds(item.solid, item.edge, item.pitch, item.yaw)
  const rect: Rect = {
    x: item.x + (item.w - size.width) / 2,
    y: item.y + (item.h - size.height) / 2,
    width: size.width,
    height: size.height
  }
  solidBoxCache.set(item, rect)
  return rect
}

const noItems = new Map<string, BoardItem>()

export function itemBounds(item: BoardItem, byId: Map<string, BoardItem> = noItems): Rect {
  if (item.kind === 'solid') return solidRect(item)
  if (item.kind === 'connector') return connectorBounds(item, byId)
  return { x: item.x, y: item.y, width: Math.max(1, item.w), height: Math.max(1, item.h) }
}

export function visibleItems(doc: BoardDoc, visible: Rect): BoardItem[] {
  const margin = 240
  const area = {
    x: visible.x - margin,
    y: visible.y - margin,
    width: visible.width + margin * 2,
    height: visible.height + margin * 2
  }
  const index = new Map(doc.items.map((entry) => [entry.id, entry]))
  const out: BoardItem[] = []
  for (const item of doc.items) {
    const rect = item.kind === 'solid' ? itemBounds(item) : rotatedBox(itemBounds(item, index), item.rotation)
    if (
      rect.x > area.x + area.width ||
      rect.x + rect.width < area.x ||
      rect.y > area.y + area.height ||
      rect.y + rect.height < area.y
    ) {
      continue
    }
    out.push(item)
  }
  return out
}

const RichText = memo(function RichText(props: {
  html: string
  style: CSSProperties
  flush?: boolean
  nodeRef?: (node: HTMLDivElement | null) => void
  onLink?: (href: string) => void
}): ReactNode {
  const blocks = useMemo(() => parseRichText(props.html), [props.html])
  const groups = useMemo(() => groupBlocks(blocks), [blocks])
  return (
    <div
      ref={props.nodeRef}
      className={props.flush ? 'boarditem__text boarditem__text--flush' : 'boarditem__text'}
      style={props.style}
    >
      {groups.map((group, index) =>
        group.kind === 'list' ? (
          group.ordered ? (
            <ol key={index}>
              {group.items.map((item, itemIndex) => (
                <li key={itemIndex} style={item.level > 1 ? { paddingLeft: `${(item.level - 1) * 1.05}em` } : undefined}>
                  {item.runs.map((run, runIndex) => (
                    <RunView key={runIndex} run={run} onLink={props.onLink} />
                  ))}
                </li>
              ))}
            </ol>
          ) : (
            <ul key={index}>
              {group.items.map((item, itemIndex) => (
                <li key={itemIndex} style={item.level > 1 ? { paddingLeft: `${(item.level - 1) * 1.05}em` } : undefined}>
                  {item.runs.map((run, runIndex) => (
                    <RunView key={runIndex} run={run} onLink={props.onLink} />
                  ))}
                </li>
              ))}
            </ul>
          )
        ) : (
          <BlockView key={index} block={group.block} onLink={props.onLink} />
        )
      )}
    </div>
  )
})

function TextFlow(props: {
  item: TextItem
  onFit?: (id: string, height: number) => void
  onLink?: (href: string) => void
}): ReactNode {
  const { item } = props
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const fitRef = useRef(props.onFit)
  fitRef.current = props.onFit
  const attach = useCallback((node: HTMLDivElement | null) => {
    nodeRef.current = node
  }, [])

  useEffect(() => {
    if (!fitRef.current) return
    const node = nodeRef.current
    if (!node) return
    const report = (): void => {
      const height = Math.round(node.offsetHeight)
      if (height > 0 && Math.abs(height - item.h) > 1) fitRef.current?.(item.id, height)
    }
    report()
    const observer = new ResizeObserver(report)
    observer.observe(node)
    return () => observer.disconnect()
  }, [item.id, item.h, item.w, item.fontSize, item.content])

  return (
    <RichText
      html={item.content}
      flush
      nodeRef={attach}
      onLink={props.onLink}
      style={{
        color: item.color || '#1a1a1a',
        fontSize: item.fontSize,
        textAlign: item.align,
        fontFamily: item.fontFamily,
        height: 'auto',
        minHeight: Math.round(item.fontSize * 1.34),
        overflow: 'visible'
      }}
    />
  )
}

type BlockGroup =
  | { kind: 'single'; block: Block }
  | { kind: 'list'; ordered: boolean; items: Block[] }

function groupBlocks(blocks: Block[]): BlockGroup[] {
  const groups: BlockGroup[] = []
  for (const block of blocks) {
    if (block.type === 'li') {
      const last = groups[groups.length - 1]
      if (last && last.kind === 'list') last.items.push(block)
      else groups.push({ kind: 'list', ordered: block.ordered === true, items: [block] })
      continue
    }
    groups.push({ kind: 'single', block })
  }
  return groups
}

function BlockView(props: { block: Block; onLink?: (href: string) => void }): ReactNode {
  const { block } = props
  if (block.type === 'li') {
    const Tag = block.ordered === false ? 'ul' : block.ordered ? 'ol' : 'div'
    return (
      <Tag style={block.level > 1 ? { paddingLeft: `${block.level * 1.05}em` } : undefined}>
        <span>{block.runs.map((run, index) => <RunView key={index} run={run} onLink={props.onLink} />)}</span>
      </Tag>
    )
  }
  if (block.type === 'h') return <h4 style={{ margin: '0 0 .3em', fontSize: '1.15em' }}>{block.runs.map((run, index) => <RunView key={index} run={run} onLink={props.onLink} />)}</h4>
  return <p>{block.runs.map((run, index) => <RunView key={index} run={run} onLink={props.onLink} />)}</p>
}

function RunView(props: { run: Run; onLink?: (href: string) => void }): ReactNode {
  const { run } = props
  const style: CSSProperties = {}
  if (run.size) style.fontSize = `${run.size}px`
  if (run.color) style.color = run.color
  if (run.bg) style.background = run.bg
  if (run.b) style.fontWeight = 700
  if (run.i) style.fontStyle = 'italic'
  const decorations: string[] = []
  if (run.u) decorations.push('underline')
  if (run.s) decorations.push('line-through')
  if (decorations.length) style.textDecoration = decorations.join(' ')
  if (!run.href) return <span style={style}>{run.text}</span>
  return (
    <span style={style}>
      <a
        href={run.href}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          props.onLink?.(run.href ?? '')
        }}
      >
        {run.text}
      </a>
    </span>
  )
}

export function fitFontSize(text: string, width: number, height: number, max: number, min = 6): number {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean || width <= 8 || height <= 8) return Math.max(min, Math.min(max, 14))
  const lines = clean.split('\n')
  const ratio = Math.sqrt((width * height) / Math.max(240, clean.length * 12))
  const estimate = clampFont(max * Math.min(1, Math.max(0.45, ratio / 14)))
  let size = estimate
  for (let i = 0; i < 8; i++) {
    const charsPerLine = Math.max(4, Math.floor((width - 10) / (size * 0.52)))
    const totalLines = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
    const needed = totalLines * size * 1.24 + 8
    if (needed <= height) break
    size = clampFont(size * Math.max(0.72, Math.sqrt(height / needed)))
    if (size <= min) break
  }
  return Math.max(min, Math.min(max, size))
}

function clampFont(value: number): number {
  return Math.max(6, Math.min(72, Math.round(value)))
}

export function shapeTextSize(item: { plain: string; w: number; h: number; fontSize: number }): number {
  return fitFontSize(item.plain, item.w - 12, item.h - 10, Math.max(10, item.fontSize * 1.4), 7)
}

const PEEK_PAGE_WIDTH = 794

function DocumentPeek(props: { file: string; url: string; width: number; fallback: ReactNode }): ReactNode {
  const [ready, setReady] = useState('')
  useEffect(() => {
    setReady(fileHtml(props.file))
    return subscribeFileHtml(props.file, () => setReady(fileHtml(props.file)))
  }, [props.file])
  useEffect(() => {
    loadFileHtml(props.file, props.url)
  }, [props.file, props.url, ready])
  if (!ready) return props.fallback
  return (
    <div className="boarddoc__page">
      <div
        className="boarddoc__sheet"
        style={{ width: PEEK_PAGE_WIDTH, transform: `scale(${props.width / PEEK_PAGE_WIDTH})` }}
        dangerouslySetInnerHTML={{ __html: ready }}
      />
    </div>
  )
}

export const ItemLayer = memo(function ItemLayer(props: {
  items: BoardItem[]
  doc: BoardDoc
  assetUrl: (file: string) => string
  selection: Set<string>
  selectable: boolean
  interactive: boolean
  moving: boolean
  editable: boolean
  editingId?: string | null
  onPatch?: (id: string, patch: Partial<BoardItem>, silent?: boolean) => void
  onFit?: (id: string, height: number) => void
  onNode?: (id: string, node: HTMLDivElement | null) => void
  onPointerDown?: (id: string, event: React.PointerEvent) => void
  onDoubleClick?: (id: string) => void
  onLink?: (href: string) => void
  media?: MediaBridge
  livePos?: Map<string, { x: number; y: number }>
  cropId?: string | null
  loading?: Map<string, { done: number; total: number }>
}): ReactNode {
  const index = useMemo(() => new Map(props.doc.items.map((entry) => [entry.id, entry])), [props.doc.items])
  return (
    <>
      {props.items.map((item) => (
        <ItemView
          key={item.id}
          item={item}
          doc={props.doc}
          byId={index}
          assetUrl={props.assetUrl}
          selected={props.selectable && props.selection.has(item.id)}
          dimmed={false}
          moving={props.moving && props.selection.has(item.id)}
          editable={props.editable}
          editingId={props.editingId}
          onPatch={props.onPatch}
          onFit={props.editable ? props.onFit : undefined}
          onNode={props.onNode}
          onPointerDown={props.interactive && !item.locked ? props.onPointerDown : undefined}
          onDoubleClick={props.onDoubleClick}
          onLink={props.onLink}
          media={props.media}
          live={props.livePos?.get(item.id)}
          cropping={props.cropId === item.id}
          loading={props.loading?.get(item.id)}
        />
      ))}
    </>
  )
})

export const ItemView = memo(function ItemView(props: {
  item: BoardItem
  doc: BoardDoc
  byId?: Map<string, BoardItem>
  assetUrl: (file: string) => string
  selected: boolean
  dimmed: boolean
  moving?: boolean
  editable?: boolean
  editingId?: string | null
  onPatch?: (id: string, patch: Partial<BoardItem>, silent?: boolean) => void
  onFit?: (id: string, height: number) => void
  onNode?: (id: string, node: HTMLDivElement | null) => void
  onPointerDown?: (id: string, event: React.PointerEvent) => void
  onDoubleClick?: (id: string) => void
  onLink?: (href: string) => void
  media?: MediaBridge
  live?: { x: number; y: number }
  cropping?: boolean
  loading?: { done: number; total: number }
}): ReactNode {
  const { item, doc, assetUrl, selected, dimmed } = props
  const box = item.kind === 'connector' ? itemBounds(item, props.byId ?? noItems) : null
  const style: CSSProperties = {
    left: (props.live?.x ?? item.x) + (box ? box.x - item.x : 0),
    top: (props.live?.y ?? item.y) + (box ? box.y - item.y : 0),
    width: box ? Math.max(1, box.width) : Math.max(1, item.w),
    height: box ? Math.max(1, box.height) : Math.max(1, item.h),
    transform: item.rotation ? `rotate(${item.rotation}deg)` : undefined,
    zIndex: item.z + 1,
    visibility: props.cropping ? 'hidden' : undefined,
    pointerEvents: item.kind === 'path' ? 'none' : undefined
  }
  const classes = ['boarditem']
  if (selected) classes.push(props.moving ? 'boarditem--moving' : 'boarditem--selected')
  if (dimmed) classes.push('boarditem--dim')
  if (item.locked) classes.push('boarditem--locked')

  const interactiveProps = props.onPointerDown
    ? {
        onPointerDown: (event: React.PointerEvent) => props.onPointerDown?.(item.id, event),
        onDoubleClick: () => props.onDoubleClick?.(item.id)
      }
    : {}

  return (
    <div
      ref={(node) => props.onNode?.(item.id, node)}
      className={classes.join(' ')}
      style={style}
      data-item-id={item.id}
      data-kind={item.kind}
      {...interactiveProps}
    >
      <ItemBody
        item={item}
        doc={doc}
        assetUrl={assetUrl}
        selected={selected}
        editable={props.editable === true}
        editing={props.editingId === item.id}
        onPatch={props.onPatch}
        onFit={props.onFit}
        onLink={props.onLink}
        media={props.media}
        loading={props.loading}
      />
    </div>
  )
})

function ItemBody(props: {
  item: BoardItem
  doc: BoardDoc
  assetUrl: (file: string) => string
  selected?: boolean
  editable?: boolean
  editing?: boolean
  onPatch?: (id: string, patch: Partial<BoardItem>, silent?: boolean) => void
  onFit?: (id: string, height: number) => void
  onLink?: (href: string) => void
  media?: MediaBridge
  loading?: { done: number; total: number }
}): ReactNode {
  const { item, assetUrl } = props
  switch (item.kind) {
    case 'frame': {
      const fill = item.fillColor && item.fillColor !== 'transparent' ? item.fillColor : 'transparent'
      return (
        <>
          <div
            className="boarditem__frame"
            style={{ width: '100%', height: '100%', background: fill, borderColor: item.color }}
          />
          {item.title ? <div className="boarditem__frametitle">{item.title}</div> : null}
        </>
      )
    }
    case 'sticky': {
      const imported = Boolean(item.sourceType)
      const size = imported
        ? item.fontSize
        : fitFontSize(item.plain, item.w, item.h, Math.max(10, item.fontSize * 1.5), 7)
      return (
        <div
          className="boarditem__text"
          style={{
            width: '100%',
            height: '100%',
            background: item.color,
            borderRadius: item.shape === 'round' ? 10 : 0,
            padding: '6px 8px',
            fontSize: size,
            lineHeight: 1.25,
            textAlign: item.textAlign,
            display: 'flex',
            flexDirection: 'column',
            justifyContent:
              item.textAlignVertical === 'top' ? 'flex-start' : item.textAlignVertical === 'bottom' ? 'flex-end' : 'center',
            color: item.textColor || contrastColor(item.color),
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {item.content && !props.editing ? (
            <RichText html={item.content} style={{ fontSize: 'inherit', textAlign: 'inherit', height: 'auto' }} onLink={props.onLink} />
          ) : null}
        </div>
      )
    }
    case 'text': {
      if (props.editing) return null
      return <TextFlow item={item} onFit={props.onFit} onLink={props.onLink} />
    }
    case 'shape': {
      const textColor = item.textColor ?? '#1a1a1a'
      const imported = Boolean(item.sourceType)
      const size = imported ? item.fontSize : shapeTextSize(item)
      const dash = strokeDash(item.borderStyle)
      return (
        <>
          <svg
            width="100%"
            height="100%"
            viewBox={`0 0 ${Math.max(1, item.w)} ${Math.max(1, item.h)}`}
            style={{ position: 'absolute', inset: 0, overflow: 'visible', opacity: item.opacity }}
          >
            <path
              d={shapePath(item.shape, item.w, item.h, item)}
              fill="none"
              stroke={item.borderColor}
              strokeWidth={item.borderWidth}
              strokeDasharray={dash}
              strokeLinejoin="round"
            />
          </svg>
          {item.content && !props.editing ? (
            <div
              style={{
                position: 'absolute',
                inset: '5px 6px',
                display: 'flex',
                alignItems:
                  item.textAlignVertical === 'top'
                    ? 'flex-start'
                    : item.textAlignVertical === 'bottom'
                      ? 'flex-end'
                      : 'center',
                justifyContent:
                  item.textAlign === 'left' ? 'flex-start' : item.textAlign === 'right' ? 'flex-end' : 'center',
                pointerEvents: 'none'
              }}
            >
              <RichText html={item.content} style={{ color: textColor, fontSize: size, textAlign: item.textAlign, width: '100%', height: 'auto' }} onLink={props.onLink} />
            </div>
          ) : null}
        </>
      )
    }
    case 'image': {
      const asset = item.asset
      const direct = asset?.dataUrl ?? asset?.sourceUrl ?? ''
      if (props.loading) {
        const percent = Math.min(99, Math.round((props.loading.done / Math.max(1, props.loading.total)) * 100))
        return (
          <div className="boarditem__loading">
            <span className="boarditem__loading-title">{(item.title || 'Картинка').trim()}</span>
            <span className="boarditem__loading-row">
              <span className="boarditem__loading-bar">
                <span className="boarditem__loading-fill" style={{ width: `${percent}%` }} />
              </span>
              <span className="boarditem__loading-percent">{percent}%</span>
            </span>
          </div>
        )
      }
      if (!asset?.file && !direct) {
        const name = (item.title || '').trim()
        return (
          <div className="boarditem__placeholder">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3.5" y="5" width="17" height="14" rx="2" />
              <path d="M4 16.5l4-4 3.5 3.5 3-2.5L20 18" />
              <circle cx="9" cy="9.5" r="1.3" />
            </svg>
            <span className="boarditem__placeholder-name">{name || 'Картинка'}</span>
            <span className="boarditem__placeholder-hint">двойной щелчок — вставить</span>
          </div>
        )
      }
      const crop = item.crop
      const fx = crop ? Math.max(0.02, 1 - crop.left - crop.right) : 1
      const fy = crop ? Math.max(0.02, 1 - crop.top - crop.bottom) : 1
      const trimmed = !!crop && (fx < 0.995 || fy < 0.995)
      return trimmed ? (
        <div className="boarditem__imagebox">
          <img
            className="boarditem__image"
            src={asset?.file ? assetUrl(asset.file) : direct}
            alt={item.alt || item.title || ''}
            style={{
              opacity: item.opacity,
              width: `${100 / fx}%`,
              height: `${100 / fy}%`,
              objectFit: 'fill',
              marginLeft: `${(-crop.left / fx) * 100}%`,
              marginTop: `${(-crop.top / fy) * 100}%`
            }}
            draggable={false}
            decoding="async"
            loading="lazy"
          />
        </div>
      ) : (
        <img
          className="boarditem__image"
          src={asset?.file ? assetUrl(asset.file) : direct}
          alt={item.alt || item.title || ''}
          style={{ opacity: item.opacity }}
          draggable={false}
          decoding="async"
          loading="lazy"
        />
      )
    }
    case 'card': {
      const color = item.color || '#f3f3f4'
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#ffffff',
            border: `1px solid ${color}`,
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: 'var(--shadow-1)'
          }}
        >
          {item.thumbnail?.file ? (
            <img src={assetUrl(item.thumbnail.file)} alt="" style={{ width: '100%', height: '42%', objectFit: 'cover' }} />
          ) : null}
          <div style={{ padding: '10px 12px', overflow: 'hidden' }}>
            {item.title ? (
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>
                <RichText html={item.title} style={{ fontSize: 14, fontWeight: 600 }} onLink={props.onLink} />
              </div>
            ) : null}
            {item.description ? (
              <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4 }}>
                <RichText html={item.description} style={{ fontSize: 12 }} onLink={props.onLink} />
              </div>
            ) : null}
          </div>
          {item.dueDate ? (
            <div style={{ marginTop: 'auto', padding: '6px 12px', fontSize: 11, color: 'var(--text-3)' }}>
              Срок: {new Date(item.dueDate).toLocaleDateString('ru-RU')}
            </div>
          ) : null}
        </div>
      )
    }
    case 'embed': {
      const media = props.media
      const video = media ? youtubeId(item.url) : ''
      if (media && video) return <YouTubePlayer video={video} media={media} interactive={props.selected === true} />
      const image = item.asset?.file ? (
        <img src={assetUrl(item.asset.file)} alt={item.title} className="boarditem__image boarditem__image--contain" decoding="async" loading="lazy" />
      ) : null
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-subtle)'
          }}
        >
          {image ?? <div style={{ flex: 1 }} />}
          <div style={{ padding: '8px 10px', fontSize: 12, borderTop: '1px solid var(--border-soft)' }}>
            <div className="truncate" style={{ fontWeight: 560 }}>
              {item.title || item.url}
            </div>
            {item.provider ? <div style={{ color: 'var(--text-3)' }}>{item.provider}</div> : null}
          </div>
        </div>
      )
    }
    case 'video': {
      const media = props.media
      const video = media ? youtubeId(item.url) : ''
      if (media && video) return <YouTubePlayer video={video} media={media} interactive={props.selected === true} />
      return (
        <div className="boarditem__placeholder" style={{ flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 22 }}>▶</span>
          <span>{item.title || item.url}</span>
        </div>
      )
    }
    case 'code': {
      return (
        <pre
          className="boarditem__text"
          style={{
            margin: 0,
            padding: 10,
            background: item.color,
            border: '1px solid var(--border)',
            borderRadius: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: item.fontSize,
            whiteSpace: 'pre-wrap'
          }}
        >
          {item.plain}
        </pre>
      )
    }
    case 'table': {
      return (
        <TableView
          item={item}
          selected={props.selected === true}
          editable={props.editable === true && item.locked !== true}
          onChange={(patch, silent) => props.onPatch?.(item.id, patch, silent)}
        />
      )
    }
    case 'vote': {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '2px solid #1a1a1a',
            borderRadius: 10,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            background: '#fff'
          }}
        >
          <div style={{ fontSize: Math.max(18, item.h * 0.28), fontWeight: 700 }}>{item.total}</div>
          {item.title ? <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.title}</div> : null}
        </div>
      )
    }
    case 'tag': {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: item.color,
            borderRadius: 999,
            display: 'grid',
            placeItems: 'center',
            fontSize: 12,
            fontWeight: 600,
            padding: '0 10px',
            overflow: 'hidden',
            whiteSpace: 'nowrap'
          }}
        >
          {item.title}
        </div>
      )
    }
    case 'document': {
      const name = item.title || 'Файл'
      const dot = name.lastIndexOf('.')
      const title = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot + 1) : ''
      return (
        <div className="boarddoc">
          <div className="boarddoc__head">
            <svg className="boarddoc__mark" viewBox="0 0 20 26" aria-hidden="true">
              <path d="M1.5 1.5h11L18.5 8v16.5h-17z" />
              <path d="M12.5 1.5V8H18.5" />
              <path d="M5.5 14h9M5.5 18h9" />
            </svg>
            <div className="boarddoc__ident">
              <div className="boarddoc__name">{title}</div>
              <div className="boarddoc__meta">
                {ext ? `.${ext.toLowerCase()}` : 'файл'}
                {item.asset ? ` · ${formatBytes(item.asset.bytes)}` : ''}
              </div>
            </div>
          </div>
          {item.asset?.file ? (
            <DocumentPeek
              file={item.asset.file}
              url={assetUrl(item.asset.file)}
              width={Math.max(80, item.w - 32)}
              fallback={item.excerpt ? <div className="boarddoc__body">{item.excerpt}</div> : null}
            />
          ) : item.excerpt ? (
            <div className="boarddoc__body">{item.excerpt}</div>
          ) : null}
        </div>
      )
    }
    case 'app_card': {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            background: '#fff'
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 13 }}>{item.title || 'Приложение'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, overflow: 'hidden' }}>
            <RichText html={item.description} style={{ fontSize: 12 }} />
          </div>
          {item.fields?.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {item.fields.slice(0, 6).map((field, index) => (
                <span key={index} className="badge" style={{ background: field.fillColor ?? 'var(--bg-muted)' }}>
                  {field.value}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )
    }
    case 'group': {
      return (
        <div className="boarditem__placeholder" style={{ borderStyle: 'dotted' }}>
          <span>Группа · {item.itemIds.length} элем.</span>
        </div>
      )
    }
    case 'comment': {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: 'var(--panel-2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 10,
            fontSize: 12
          }}
        >
          {item.author ? <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.author}</div> : null}
          <RichText html={item.content} style={{ fontSize: 12 }} />
        </div>
      )
    }
    case 'path': {
      const source = item.points.length > 1 ? item.points : [{ x: 0, y: 0 }, { x: item.w, y: item.h }]
      const d = curvePath(source)
      const reach = Math.max(6, item.lineWidth + 6)
      return (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${Math.max(1, item.w)} ${Math.max(1, item.h)}`}
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        >
          <path
            d={d}
            fill="none"
            stroke="transparent"
            strokeWidth={reach}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ pointerEvents: 'stroke' }}
          />
          <path
            d={d}
            fill="none"
            stroke={item.color}
            strokeWidth={item.lineWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={item.opacity ?? 1}
            style={{ pointerEvents: 'stroke' }}
          />
        </svg>
      )
    }
    case 'solid': {
      return <SolidView item={item} />
    }
    case 'graph': {
      return <GraphView item={item} />
    }
    case 'connector': {
      return null
    }
    default: {
      const unknown = item as { label?: string; raw?: unknown }
      return (
        <div className="boarditem__placeholder">
          <span>{unknown.label ? `Тип «${unknown.label}»` : 'Объект без поддержки'}</span>
        </div>
      )
    }
  }
}