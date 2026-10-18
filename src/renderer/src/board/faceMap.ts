import type { SolidFaceMesh, Vec2 } from '@shared/three'

export interface Affine {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

interface Vec3Like {
  x: number
  y: number
  z: number
}

function normalize(value: Vec3Like): Vec3Like {
  const length = Math.hypot(value.x, value.y, value.z) || 1
  return { x: value.x / length, y: value.y / length, z: value.z / length }
}

function basisOf(face: SolidFaceMesh): { origin: Vec3Like; axisX: Vec3Like; axisY: Vec3Like } {
  const origin = face.world[0]
  const second = face.world[1] ?? origin
  const third = face.world[2] ?? second
  return {
    origin,
    axisX: normalize({ x: second.x - origin.x, y: second.y - origin.y, z: second.z - origin.z }),
    axisY: normalize({ x: third.x - origin.x, y: third.y - origin.y, z: third.z - origin.z })
  }
}

function faceLocalOf(basis: { origin: Vec3Like; axisX: Vec3Like; axisY: Vec3Like }, world: Vec3Like): Vec2 {
  const dx = world.x - basis.origin.x
  const dy = world.y - basis.origin.y
  const dz = world.z - basis.origin.z
  return {
    x: dx * basis.axisX.x + dy * basis.axisX.y + dz * basis.axisX.z,
    y: dx * basis.axisY.x + dy * basis.axisY.y + dz * basis.axisY.z
  }
}

function invert3(m: number[][]): number[][] | null {
  const det =
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  if (Math.abs(det) < 1e-9) return null
  return [
    [
      (m[1][1] * m[2][2] - m[1][2] * m[2][1]) / det,
      (m[0][2] * m[2][1] - m[0][1] * m[2][2]) / det,
      (m[0][1] * m[1][2] - m[0][2] * m[1][1]) / det
    ],
    [
      (m[1][2] * m[2][0] - m[1][0] * m[2][2]) / det,
      (m[0][0] * m[2][2] - m[0][2] * m[2][0]) / det,
      (m[0][2] * m[1][0] - m[0][0] * m[1][2]) / det
    ],
    [
      (m[1][0] * m[2][1] - m[1][1] * m[2][0]) / det,
      (m[0][1] * m[2][0] - m[0][0] * m[2][1]) / det,
      (m[0][0] * m[1][1] - m[0][1] * m[1][0]) / det
    ]
  ]
}

export function solidFaceMap(face: SolidFaceMesh, screen: Vec2[]): Affine | null {
  const count = Math.min(face.world.length, screen.length)
  if (count < 3) return null
  const basis = basisOf(face)
  const matrix = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0]
  ]
  const right = [0, 0, 0]
  const down = [0, 0, 0]
  for (let index = 0; index < count; index += 1) {
    const local = faceLocalOf(basis, face.world[index])
    const point = screen[index]
    matrix[0][0] += local.x * local.x
    matrix[0][1] += local.x * local.y
    matrix[0][2] += local.x
    matrix[1][0] += local.x * local.y
    matrix[1][1] += local.y * local.y
    matrix[1][2] += local.y
    matrix[2][0] += local.x
    matrix[2][1] += local.y
    matrix[2][2] += 1
    right[0] += local.x * point.x
    right[1] += local.y * point.x
    right[2] += point.x
    down[0] += local.x * point.y
    down[1] += local.y * point.y
    down[2] += point.y
  }
  const inverse = invert3(matrix)
  if (!inverse) return null
  const a = inverse[0][0] * right[0] + inverse[0][1] * right[1] + inverse[0][2] * right[2]
  const b = inverse[1][0] * right[0] + inverse[1][1] * right[1] + inverse[1][2] * right[2]
  const e = inverse[2][0] * right[0] + inverse[2][1] * right[1] + inverse[2][2] * right[2]
  const c = inverse[0][0] * down[0] + inverse[0][1] * down[1] + inverse[0][2] * down[2]
  const d = inverse[1][0] * down[0] + inverse[1][1] * down[1] + inverse[1][2] * down[2]
  const f = inverse[2][0] * down[0] + inverse[2][1] * down[1] + inverse[2][2] * down[2]
  return { a, b, c, d, e, f }
}

export function faceFromScreen(map: Affine, point: Vec2): Vec2 {
  const det = map.a * map.d - map.b * map.c
  if (Math.abs(det) < 1e-9) return { x: 0, y: 0 }
  const x = point.x - map.e
  const y = point.y - map.f
  return { x: (x * map.d - y * map.b) / det, y: (map.a * y - map.c * x) / det }
}
