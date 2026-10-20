import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { SolidItem, SolidLabel } from '@shared/types'
import { curvePath } from '@shared/curve'
import {
  faceColorOf,
  faceLocalToWorld,
  faceOf,
  itemBox,
  pointsAttribute,
  projectPoint,
  shadeColor,
  solidAxes,
  solidFaceGrids,
  solidHiddenLines,
  solidProjection,
  strokeIntersections,
  type Seg2,
  type SolidCamera,
  type SolidPolygon,
  type Vec2
} from '@shared/three'

export interface SolidViewProps {
  item: SolidItem
}

const DASH = '9 7'

export const SolidView = memo(function SolidView(props: SolidViewProps): ReactNode {
  const { item } = props
  const box = itemBox(item)
  const projection = useMemo(() => solidProjection(item), [item])
  const polygons = projection.polygons.filter((polygon) => polygon.front)
  const edgeColor = item.showEdges !== false ? item.color : 'none'
  const hidden = useMemo(() => (item.showHidden ? solidHiddenLines(item) : []), [item])
  const axes = useMemo(() => (item.showAxes ? solidAxes(item) : null), [item])
  const faceGrids = useMemo(() => (item.showFaceGrid ? solidFaceGrids(item) : []), [item])
  const gridIndex = useMemo(() => {
    const map = new Map<string, Seg2[]>()
    polygons.forEach((polygon, index) => {
      const lines = faceGrids[index]
      if (lines) map.set(polygon.id, lines)
    })
    return map
  }, [polygons, faceGrids])
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${box.width} ${box.height}`}
      style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
    >
      {axes ? (
        <g>
          {axes.grid.map((line, index) => (
            <line
              key={`grid-${index}`}
              x1={line.a.x}
              y1={line.a.y}
              x2={line.b.x}
              y2={line.b.y}
              stroke={item.color}
              strokeWidth={0.75}
              strokeOpacity={0.35}
              strokeDasharray="4 5"
            />
          ))}
          {axes.axes.map((line, index) => (
            <line
              key={`axis-${index}`}
              x1={line.a.x}
              y1={line.a.y}
              x2={line.b.x}
              y2={line.b.y}
              stroke={item.color}
              strokeWidth={1.5}
              strokeDasharray={index === 0 ? 'none' : DASH}
            />
          ))}
          {axes.labels.map((label) => (
            <text
              key={`label-${label.text}`}
              x={label.at.x}
              y={label.at.y}
              fontSize={Math.max(10, box.height * 0.035)}
              fontFamily="var(--font)"
              fill={item.color}
              opacity={0.8}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {label.text}
            </text>
          ))}
        </g>
      ) : null}
      {polygons.map((polygon) => (
        <polygon
          key={polygon.id}
          points={pointsAttribute(polygon.points)}
          fill={shadeColor(faceColorOf(item, polygon.id), polygon.shade)}
          fillOpacity={faceOf(item, polygon.id)?.opacity ?? 1}
          stroke={polygon.outline ? edgeColor : 'none'}
          strokeWidth={item.lineWidth}
          strokeLinejoin="round"
        />
      ))}
      {polygons.map((polygon) =>
        (gridIndex.get(polygon.id) ?? []).map((line, index) => (
          <line
            key={`fg-${polygon.id}-${index}`}
            x1={line.a.x}
            y1={line.a.y}
            x2={line.b.x}
            y2={line.b.y}
            stroke={item.color}
            strokeWidth={0.75}
            strokeOpacity={0.5}
          />
        ))
      )}
      {hidden.map((line, index) => (
        <line
          key={`hidden-${index}`}
          x1={line.a.x}
          y1={line.a.y}
          x2={line.b.x}
          y2={line.b.y}
          stroke={item.color}
          strokeWidth={item.lineWidth}
          strokeDasharray={DASH}
          strokeOpacity={0.85}
        />
      ))}
      {item.sketch
        .filter((sketch) => sketch.through)
        .map((sketch, index) => (
          <ThroughView key={`through-${index}`} sketch={sketch} projection={projection} />
        ))}
      {item.sketch.map((sketch, index) =>
        sketch.through ? null : (
          <SketchView
            key={`sketch-${index}`}
            face={projection.polygons.find((polygon) => polygon.id === sketch.face)}
            camera={projection.camera}
            color={sketch.color}
            lineWidth={sketch.lineWidth}
            points={sketch.points}
            dashed={item.showHidden === true}
          />
        )
      )}
      {item.labels?.map((label, index) => (
        <LabelView key={`label-${index}`} item={item} label={label} projection={projection} />
      ))}
      <Crossings item={item} projection={projection} />
    </svg>
  )
})

function LabelView(props: {
  item: SolidItem
  label: SolidLabel
  projection: ReturnType<typeof solidProjection>
}): ReactNode {
  const { item, label, projection } = props
  const face = projection.polygons.find((polygon) => polygon.id === label.face)
  if (!face || !face.front || !label.text) return null
  const unit = Math.max(20, label.size * 3)
  const at = projectPoint(faceLocalToWorld(face, label.point), projection.camera)
  const along = projectPoint(faceLocalToWorld(face, { x: label.point.x + unit, y: label.point.y }), projection.camera)
  const dx = along.x - at.x
  const dy = along.y - at.y
  const stretch = Math.max(0.15, Math.hypot(dx, dy) / unit)
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const lines = label.text.split('\n')
  return (
    <text
      transform={`translate(${at.x} ${at.y}) rotate(${angle}) scale(${stretch})`}
      fontSize={label.size}
      fontFamily="var(--font)"
      fill={item.color}
      textAnchor="middle"
      dominantBaseline="middle"
    >
      {lines.map((line, index) => (
        <tspan key={`line-${index}`} x={0} dy={index === 0 ? 0 : label.size * 1.2}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

function SketchView(props: {
  face?: SolidPolygon
  camera: SolidCamera
  color: string
  lineWidth: number
  points: Array<{ x: number; y: number }>
  dashed: boolean
}): ReactNode {
  const { face, camera, color, lineWidth, points, dashed } = props
  if (!face || points.length === 0) return null
  if (!face.front && !dashed) return null
  const screen: Vec2[] = points.map((point) => projectPoint(faceLocalToWorld(face, point), camera))
  const strokeDasharray = face.front ? undefined : DASH
  const strokeOpacity = face.front ? 1 : 0.8
  if (screen.length === 1) {
    const only = screen[0]
    return <circle cx={only.x} cy={only.y} r={Math.max(0.4, lineWidth / 2)} fill={color} opacity={strokeOpacity} />
  }
  return (
    <path
      d={curvePath(screen)}
      fill="none"
      stroke={color}
      strokeWidth={lineWidth}
      strokeDasharray={strokeDasharray}
      strokeOpacity={strokeOpacity}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  )
}

function ThroughView(props: {
  sketch: SolidItem['sketch'][number]
  projection: ReturnType<typeof solidProjection>
}): ReactNode {
  const { sketch, projection } = props
  const anchors = sketch.through ?? []
  if (anchors.length < 2) return null
  const worlds: Array<{ x: number; y: number; z: number }> = []
  for (const anchor of anchors) {
    const face = projection.polygons.find((entry) => entry.id === anchor.face)
    if (!face) return null
    worlds.push(faceLocalToWorld(face, anchor.point))
  }
  const steps = 32
  const screen: Vec2[] = []
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps
    const world = {
      x: worlds[0].x + (worlds[1].x - worlds[0].x) * ratio,
      y: worlds[0].y + (worlds[1].y - worlds[0].y) * ratio,
      z: worlds[0].z + (worlds[1].z - worlds[0].z) * ratio
    }
    screen.push(projectPoint(world, projection.camera))
  }
  return (
    <g>
      <path
        d={curvePath(screen)}
        fill="none"
        stroke={sketch.color}
        strokeWidth={sketch.lineWidth}
        strokeOpacity={0.95}
        strokeLinecap="round"
      />
      <circle cx={screen[0].x} cy={screen[0].y} r={0.9} fill={sketch.color} />
      <circle cx={screen[steps].x} cy={screen[steps].y} r={0.9} fill={sketch.color} />
    </g>
  )
}

function Crossings(props: {
  item: SolidItem
  projection: ReturnType<typeof solidProjection>
}): ReactNode {
  const { item, projection } = props
  const dots = useMemo(() => {
    const groups = new Map<string, Array<Array<{ x: number; y: number }>>>()
    for (const sketch of item.sketch) {
      if (sketch.through || sketch.points.length < 2) continue
      const list = groups.get(sketch.face) ?? []
      list.push(sketch.points)
      groups.set(sketch.face, list)
    }
    const out: Array<{ at: Vec2; color: string }> = []
    for (const [faceId, strokes] of groups) {
      const face = projection.polygons.find((entry) => entry.id === faceId)
      if (!face || !face.front) continue
      for (const point of strokeIntersections(strokes)) {
        out.push({ at: projectPoint(faceLocalToWorld(face, point), projection.camera), color: item.color })
      }
    }
    return out
  }, [item, projection])
  return (
    <g>
      {dots.map((dot, index) => (
        <circle
          key={`cross-${index}`}
          cx={dot.at.x}
          cy={dot.at.y}
          r={Math.max(1.4, item.lineWidth / 2 + 0.8)}
          fill={dot.color}
          stroke="#ffffff"
          strokeWidth={0.8}
        />
      ))}
    </g>
  )
}