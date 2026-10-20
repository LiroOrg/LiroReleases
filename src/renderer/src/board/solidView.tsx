import { memo, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { SolidItem } from '@shared/types'
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
      {item.sketch.map((sketch, index) => (
        <SketchView
          key={`sketch-${index}`}
          face={projection.polygons.find((polygon) => polygon.id === sketch.face)}
          camera={projection.camera}
          color={sketch.color}
          lineWidth={sketch.lineWidth}
          points={sketch.points}
          dashed={item.showHidden === true}
        />
      ))}
    </svg>
  )
})

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