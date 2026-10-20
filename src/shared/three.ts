import type { SolidFace, SolidItem, SolidKind } from './types'
import { hexToRgb, normalizeColor } from './color'
import { clamp, round2 } from './util'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Vec2 {
  x: number
  y: number
}

export interface SolidRotation {
  yaw: number
  pitch: number
}

export interface SolidCamera extends SolidRotation {
  scale: number
  distance: number
  offsetX: number
  offsetY: number
}

export interface SolidFaceMesh {
  id: string
  world: Vec3[]
  normal?: Vec3
  shade?: number
  outline?: boolean
}

export interface SolidPolygon extends SolidFaceMesh {
  points: Vec2[]
  depth: number
  shade: number
  front: boolean
  outline: boolean
}

export interface SolidProjection {
  camera: SolidCamera
  polygons: SolidPolygon[]
}

export interface SolidSize {
  width: number
  height: number
}

export interface SolidFrame {
  origin: Vec3
  axisX: Vec3
  axisY: Vec3
  width: number
  height: number
}

export interface Box {
  width: number
  height: number
}

const PERSPECTIVE_RATIO = 8
const RING = 24
const MERIDIANS = 12
const BANDS = 8
const SHADE_MIN = 0.68
const SHADE_SPAN = 0.32
const FALLBACK_FILL = '#e4e9f1'
const DEG = Math.PI / 180

const LIGHT: Vec3 = unit(vec(-0.35, 0.8, 0.5))

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z)
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z)
}

function scale(a: Vec3, k: number): Vec3 {
  return vec(a.x * k, a.y * k, a.z * k)
}

function negate(a: Vec3): Vec3 {
  return vec(-a.x, -a.y, -a.z)
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
}

function length(a: Vec3): number {
  return Math.sqrt(dot(a, a))
}

function unit(a: Vec3): Vec3 {
  const size = length(a)
  return size > 1e-9 ? scale(a, 1 / size) : vec(0, 0, 0)
}

function solidSize(edge: number): number {
  return Math.max(1, edge)
}

function ring(radius: number, count: number, y: number, phase = 0): Vec3[] {
  const points: Vec3[] = []
  for (let index = 0; index < count; index += 1) {
    const angle = phase + (index / count) * Math.PI * 2
    points.push(vec(Math.cos(angle) * radius, y, Math.sin(angle) * radius))
  }
  return points
}

function squareBase(edge: number): Vec3[] {
  const half = edge / 2
  return [vec(-half, 0, half), vec(half, 0, half), vec(half, 0, -half), vec(-half, 0, -half)]
}

function lift(points: Vec3[], y: number): Vec3[] {
  return points.map((point) => vec(point.x, y, point.z))
}

export function rotateSolid(point: Vec3, rotation: SolidRotation): Vec3 {
  const yaw = rotation.yaw * DEG
  const pitch = rotation.pitch * DEG
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const x = point.x * cosYaw + point.z * sinYaw
  const z = point.z * cosYaw - point.x * sinYaw
  return vec(x, point.y * cosPitch - z * sinPitch, point.y * sinPitch + z * cosPitch)
}

export function projectPoint(world: Vec3, camera: SolidCamera): Vec2 {
  const view = rotateSolid(world, camera)
  const factor = camera.distance / Math.max(camera.distance * 0.05, camera.distance - view.z)
  return {
    x: view.x * factor * camera.scale + camera.offsetX,
    y: -view.y * factor * camera.scale + camera.offsetY
  }
}

export function solidCenter(edge: number): Vec3 {
  return vec(0, solidSize(edge) / 2, 0)
}

function cubeMesh(edge: number): SolidFaceMesh[] {
  const bottom = squareBase(edge)
  const top = lift(bottom, edge)
  const side: Array<[string, number]> = [
    ['front', 0],
    ['right', 1],
    ['back', 2],
    ['left', 3]
  ]
  const walls = side.map(([id, index]) => ({
    id,
    world: [bottom[index], bottom[(index + 1) % 4], top[(index + 1) % 4], top[index]]
  }))
  return [
    { id: 'bottom', world: bottom },
    { id: 'top', world: top },
    ...walls
  ]
}

function pyramidMesh(edge: number): SolidFaceMesh[] {
  const bottom = squareBase(edge)
  const apex = vec(0, edge, 0)
  const walls: Array<[string, number]> = [
    ['front', 0],
    ['right', 1],
    ['back', 2],
    ['left', 3]
  ]
  return [
    { id: 'base', world: bottom },
    ...walls.map(([id, index]) => ({ id, world: [bottom[index], bottom[(index + 1) % 4], apex] }))
  ]
}

function prismMesh(edge: number): SolidFaceMesh[] {
  const radius = edge / 2
  const bottom = ring(radius, 3, 0, Math.PI / 2)
  const top = lift(bottom, edge)
  const names = ['left', 'back', 'right']
  return [
    { id: 'bottom', world: bottom },
    { id: 'top', world: top },
    ...names.map((id, index) => ({
      id,
      world: [bottom[index], bottom[(index + 1) % 3], top[(index + 1) % 3], top[index]]
    }))
  ]
}

function cylinderMesh(edge: number): SolidFaceMesh[] {
  const radius = edge / 2
  const bottom = ring(radius, RING, 0)
  const top = lift(bottom, edge)
  const walls = bottom.map((point, index) => ({
    id: `side-${index}`,
    world: [point, bottom[(index + 1) % RING], top[(index + 1) % RING], top[index]]
  }))
  return [
    { id: 'bottom', world: bottom },
    { id: 'top', world: top },
    ...walls
  ]
}

function coneMesh(edge: number): SolidFaceMesh[] {
  const radius = edge / 2
  const bottom = ring(radius, RING, 0)
  const apex = vec(0, edge, 0)
  const walls = bottom.map((point, index) => ({
    id: `side-${index}`,
    world: [point, bottom[(index + 1) % RING], apex]
  }))
  return [
    { id: 'bottom', world: bottom },
    ...walls
  ]
}

function spherePoint(center: Vec3, radius: number, azimuth: number, latitude: number): Vec3 {
  const ringRadius = Math.cos(latitude) * radius
  return vec(
    center.x + Math.cos(azimuth) * ringRadius,
    center.y + Math.sin(latitude) * radius,
    center.z + Math.sin(azimuth) * ringRadius
  )
}

function sphereMesh(edge: number): SolidFaceMesh[] {
  const center = solidCenter(edge)
  const radius = edge / 2
  const patches: SolidFaceMesh[] = []
  for (let band = 0; band < BANDS; band += 1) {
    const low = -Math.PI / 2 + (band / BANDS) * Math.PI
    const high = -Math.PI / 2 + ((band + 1) / BANDS) * Math.PI
    for (let step = 0; step < MERIDIANS; step += 1) {
      const from = (step / MERIDIANS) * Math.PI * 2
      const to = ((step + 1) / MERIDIANS) * Math.PI * 2
      patches.push({
        id: `patch-${band}-${step}`,
        world: [
          spherePoint(center, radius, from, low),
          spherePoint(center, radius, to, low),
          spherePoint(center, radius, to, high),
          spherePoint(center, radius, from, high)
        ]
      })
    }
  }
  const ballRadius = radius * Math.cos(Math.PI / 2 / BANDS) * Math.cos(Math.PI / MERIDIANS)
  const ball: SolidFaceMesh = {
    id: 'ball',
    world: ring(ballRadius, RING, center.y),
    normal: vec(0, 0, 1),
    shade: SHADE_MIN,
    outline: false
  }
  return [ball, ...patches]
}

export function solidMesh(solid: SolidKind, edge: number): SolidFaceMesh[] {
  const size = solidSize(edge)
  switch (solid) {
    case 'cube':
      return cubeMesh(size)
    case 'pyramid':
      return pyramidMesh(size)
    case 'prism':
      return prismMesh(size)
    case 'cylinder':
      return cylinderMesh(size)
    case 'cone':
      return coneMesh(size)
    case 'sphere':
      return sphereMesh(size)
    default:
      return cubeMesh(size)
  }
}

export function solidVertices(solid: SolidKind, edge: number): Vec3[] {
  const seen = new Set<string>()
  const out: Vec3[] = []
  for (const face of solidMesh(solid, edge)) {
    for (const point of face.world) {
      const key = `${round2(point.x)}|${round2(point.y)}|${round2(point.z)}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(point)
    }
  }
  return out
}

function faceNormal(face: SolidFaceMesh, center: Vec3): Vec3 {
  if (face.normal) return unit(face.normal)
  const [first, second, third] = face.world
  if (!first) return vec(0, 1, 0)
  const outward = sub(first, center)
  const fallback = length(outward) > 1e-9 ? unit(outward) : vec(0, 1, 0)
  if (!second || !third) return fallback
  let normal = cross(sub(second, first), sub(third, first))
  if (length(normal) < 1e-9 && face.world[3]) normal = cross(sub(second, first), sub(face.world[3], first))
  if (length(normal) < 1e-9) return fallback
  return dot(normal, outward) < 0 ? negate(normal) : unit(normal)
}

function baseCamera(edge: number, rotation: SolidRotation): SolidCamera {
  return {
    yaw: rotation.yaw,
    pitch: rotation.pitch,
    scale: 1,
    distance: edge * PERSPECTIVE_RATIO,
    offsetX: 0,
    offsetY: 0
  }
}

function projectedBounds(
  faces: SolidFaceMesh[],
  camera: SolidCamera
): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const face of faces) {
    for (const world of face.world) {
      const point = projectPoint(world, camera)
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1 }
  return { minX, minY, maxX, maxY, width: Math.max(1e-6, maxX - minX), height: Math.max(1e-6, maxY - minY) }
}

export function solidCamera(
  solid: SolidKind,
  edge: number,
  rotation: SolidRotation,
  box: Box
): SolidCamera {
  const size = solidSize(edge)
  const faces = solidMesh(solid, size)
  const base = baseCamera(size, rotation)
  const bounds = projectedBounds(faces, base)
  const width = Math.max(1, box.width)
  const height = Math.max(1, box.height)
  const fit = Math.min(width / bounds.width, height / bounds.height)
  return {
    ...base,
    scale: fit,
    offsetX: (width - bounds.width * fit) / 2 - bounds.minX * fit,
    offsetY: (height - bounds.height * fit) / 2 - bounds.minY * fit
  }
}

function projectFaces(faces: SolidFaceMesh[], camera: SolidCamera, center: Vec3): SolidPolygon[] {
  const polygons: SolidPolygon[] = faces.map((face) => {
    const points: Vec2[] = []
    let depth = 0
    for (const world of face.world) {
      points.push(projectPoint(world, camera))
      depth += camera.distance - rotateSolid(world, camera).z
    }
    const normal = rotateSolid(faceNormal(face, center), camera)
    return {
      id: face.id,
      world: face.world,
      normal: face.normal,
      points,
      depth: depth / Math.max(1, face.world.length),
      shade: face.shade ?? (SHADE_MIN + SHADE_SPAN * clamp(dot(normal, LIGHT), 0, 1)),
      front: normal.z > 0,
      outline: face.outline !== false
    }
  })
  return polygons.sort((a, b) => b.depth - a.depth)
}

export function itemBox(item: SolidItem): Box {
  return { width: Math.max(1, item.w), height: Math.max(1, item.h) }
}

export function itemRotation(item: SolidItem): SolidRotation {
  return { yaw: item.yaw, pitch: item.pitch }
}

export function solidPolygons(item: SolidItem): SolidPolygon[] {
  const edge = solidSize(item.edge)
  const camera = solidCamera(item.solid, edge, itemRotation(item), itemBox(item))
  return projectFaces(solidMesh(item.solid, edge), camera, solidCenter(edge))
}

export function solidProjection(item: SolidItem): SolidProjection {
  const edge = solidSize(item.edge)
  const camera = solidCamera(item.solid, edge, itemRotation(item), itemBox(item))
  return { camera, polygons: projectFaces(solidMesh(item.solid, edge), camera, solidCenter(edge)) }
}

export function solidBounds(solid: SolidKind, edge: number, pitch: number, yaw: number): SolidSize {
  const size = solidSize(edge)
  const bounds = projectedBounds(solidMesh(solid, size), baseCamera(size, { yaw, pitch }))
  return { width: round2(bounds.width), height: round2(bounds.height) }
}

function containsPoint(points: Vec2[], point: Vec2): boolean {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index]
    const last = points[previous]
    if (!current || !last) continue
    const straddles = current.y > point.y !== last.y > point.y
    if (!straddles) continue
    const border = ((last.x - current.x) * (point.y - current.y)) / (last.y - current.y) + current.x
    if (point.x < border) inside = !inside
  }
  return inside
}

export function hitTestFace(polygons: SolidPolygon[], point: Vec2): SolidPolygon | null {
  let nearest: SolidPolygon | null = null
  for (const polygon of polygons) {
    if (!containsPoint(polygon.points, point)) continue
    if (!nearest || polygon.depth < nearest.depth) nearest = polygon
  }
  return nearest
}

export function solidFaceAt(item: SolidItem, point: Vec2): SolidPolygon | null {
  return hitTestFace(solidPolygons(item), point)
}

export function faceFrame(face: SolidFaceMesh): SolidFrame {
  const origin = face.world[0] ?? vec(0, 0, 0)
  const second = face.world[1] ?? origin
  const third = face.world[2] ?? second
  const axisXRaw = sub(second, origin)
  const axisYRaw = sub(third, origin)
  return {
    origin,
    axisX: unit(axisXRaw),
    axisY: unit(axisYRaw),
    width: length(axisXRaw),
    height: length(axisYRaw)
  }
}

export function faceLocalToWorld(face: SolidFaceMesh, point: Vec2): Vec3 {
  const frame = faceFrame(face)
  const gxx = dot(frame.axisX, frame.axisX)
  const gxy = dot(frame.axisX, frame.axisY)
  const gyy = dot(frame.axisY, frame.axisY)
  const det = gxx * gyy - gxy * gxy
  if (Math.abs(det) < 1e-9) return frame.origin
  const alpha = (point.x * gyy - point.y * gxy) / det
  const beta = (point.y * gxx - point.x * gxy) / det
  return add(add(frame.origin, scale(frame.axisX, alpha)), scale(frame.axisY, beta))
}

export function faceWorldToLocal(face: SolidFaceMesh, point: Vec3): Vec2 {
  const frame = faceFrame(face)
  const delta = sub(point, frame.origin)
  return { x: dot(delta, frame.axisX), y: dot(delta, frame.axisY) }
}

export function unrotateSolid(point: Vec3, rotation: SolidRotation): Vec3 {
  const yaw = rotation.yaw * DEG
  const pitch = rotation.pitch * DEG
  const cosYaw = Math.cos(yaw)
  const sinYaw = Math.sin(yaw)
  const cosPitch = Math.cos(pitch)
  const sinPitch = Math.sin(pitch)
  const y = point.y * cosPitch + point.z * sinPitch
  const z = -point.y * sinPitch + point.z * cosPitch
  return vec(point.x * cosYaw - z * sinYaw, y, point.x * sinYaw + z * cosYaw)
}

export function solidScreenToLocal(item: SolidItem, face: SolidFaceMesh, screen: Vec2): Vec3 | null {
  const edge = solidSize(item.edge)
  const camera = solidCamera(item.solid, edge, itemRotation(item), itemBox(item))
  const base = face.world[0]
  if (!base) return null
  const u = (screen.x - camera.offsetX) / camera.scale
  const v = -(screen.y - camera.offsetY) / camera.scale
  const origin = rotateSolid(base, camera)
  const normal = rotateSolid(faceNormal(face, solidCenter(edge)), camera)
  const direction = vec(u, v, -camera.distance)
  const start = vec(0, 0, camera.distance)
  const denominator = dot(normal, direction)
  if (Math.abs(denominator) < 1e-9) return null
  const t = dot(normal, sub(origin, start)) / denominator
  if (t <= 0) return null
  return unrotateSolid(add(start, scale(direction, t)), camera)
}

export function faceOf(item: SolidItem, id: string): SolidFace | undefined {
  return item.faces.find((face) => face.id === id)
}

export function faceColorOf(item: SolidItem, id: string): string {
  const exact = faceOf(item, id)
  if (exact) return exact.color
  if (id.startsWith('patch-')) {
    const base = faceOf(item, 'ball') ?? faceOf(item, 'top')
    if (base) return base.color
  }
  return item.faces[0]?.color ?? FALLBACK_FILL
}

export function shadeColor(hex: string, factor: number): string {
  const { r, g, b } = hexToRgb(normalizeColor(hex, FALLBACK_FILL))
  const mix = (channel: number): string =>
    Math.round(clamp(channel * factor, 0, 255))
      .toString(16)
      .padStart(2, '0')
  return `#${mix(r)}${mix(g)}${mix(b)}`
}

export function pointsAttribute(points: Vec2[]): string {
  return points.map((point) => `${round2(point.x)},${round2(point.y)}`).join(' ')
}

export interface Seg2 {
  a: Vec2
  b: Vec2
}

function segmentOf(camera: SolidCamera, from: Vec3, to: Vec3): Seg2 {
  return { a: projectPoint(from, camera), b: projectPoint(to, camera) }
}

export function solidHiddenLines(item: SolidItem): Seg2[] {
  const out: Seg2[] = []
  for (const polygon of solidPolygons(item)) {
    if (polygon.front || !polygon.outline || polygon.points.length < 2) continue
    for (let index = 0; index < polygon.points.length; index += 1) {
      const from = polygon.points[index]
      const to = polygon.points[(index + 1) % polygon.points.length]
      if (!from || !to) continue
      out.push({ a: from, b: to })
    }
  }
  return out
}

export function solidAxes(item: SolidItem): { axes: Seg2[]; grid: Seg2[]; labels: Array<{ at: Vec2; text: string }> } {
  const edge = solidSize(item.edge)
  const camera = solidCamera(item.solid, edge, itemRotation(item), itemBox(item))
  const half = edge / 2
  const step = edge / 4
  const grid: Seg2[] = []
  for (let index = -2; index <= 2; index += 1) {
    const offset = index * step
    grid.push(segmentOf(camera, vec(offset, 0, -half), vec(offset, 0, half)))
    grid.push(segmentOf(camera, vec(-half, 0, offset), vec(half, 0, offset)))
  }
  const axes: Seg2[] = [
    segmentOf(camera, vec(0, 0, 0), vec(edge, 0, 0)),
    segmentOf(camera, vec(0, 0, 0), vec(0, edge, 0)),
    segmentOf(camera, vec(0, 0, 0), vec(0, 0, edge))
  ]
  const labels = [
    { at: projectPoint(vec(edge, 0, 0), camera), text: 'X' },
    { at: projectPoint(vec(0, edge, 0), camera), text: 'Y' },
    { at: projectPoint(vec(0, 0, edge), camera), text: 'Z' }
  ]
  return { axes, grid, labels }
}

export function solidFaceGrids(item: SolidItem, steps = 4): Seg2[][] {
  const camera = solidCamera(item.solid, solidSize(item.edge), itemRotation(item), itemBox(item))
  const out: Seg2[][] = []
  for (const polygon of solidPolygons(item)) {
    if (!polygon.front || polygon.points.length < 3) continue
    const frame = faceFrame(polygon)
    const lines: Seg2[] = []
    for (let index = 1; index < steps; index += 1) {
      const fx = (frame.width * index) / steps
      const fy = (frame.height * index) / steps
      lines.push(segmentOf(camera, faceLocalToWorld(polygon, { x: fx, y: 0 }), faceLocalToWorld(polygon, { x: fx, y: frame.height })))
      lines.push(segmentOf(camera, faceLocalToWorld(polygon, { x: 0, y: fy }), faceLocalToWorld(polygon, { x: frame.width, y: fy })))
    }
    out.push(lines)
  }
  return out
}