import type { ShapeName } from '@shared/types'

const polygon = (points: Array<[number, number]>): string => {
  if (!points.length) return ''
  const [first, ...rest] = points
  return `M ${round(first[0])} ${round(first[1])} ` + rest.map(([x, y]) => `L ${round(x)} ${round(y)}`).join(' ') + ' Z'
}

const round = (value: number): number => Math.round(value * 100) / 100

const regular = (sides: number, w: number, h: number, rotation = -Math.PI / 2): Array<[number, number]> => {
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2
  const ry = h / 2
  const points: Array<[number, number]> = []
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * 2 * Math.PI) / sides
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)])
  }
  return points
}

const starPoints = (w: number, h: number, points = 5, innerRatio = 0.42): Array<[number, number]> => {
  const cx = w / 2
  const cy = h / 2
  const rx = w / 2
  const ry = h / 2
  const result: Array<[number, number]> = []
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    const ratio = i % 2 === 0 ? 1 : innerRatio
    result.push([cx + rx * ratio * Math.cos(angle), cy + ry * ratio * Math.sin(angle)])
  }
  return result
}

const roundedRect = (w: number, h: number, radius: number): string => {
  const r = Math.min(radius, Math.min(w, h) / 2)
  return `M ${round(r)} 0 H ${round(w - r)} A ${round(r)} ${round(r)} 0 0 1 ${round(w)} ${round(r)} V ${round(
    h - r
  )} A ${round(r)} ${round(r)} 0 0 1 ${round(w - r)} ${round(h)} H ${round(r)} A ${round(r)} ${round(r)} 0 0 1 0 ${
    round(h - r)
  } V ${round(r)} A ${round(r)} ${round(r)} 0 0 1 ${round(r)} 0 Z`
}

export function shapePath(shape: ShapeName, w: number, h: number): string {
  const width = Math.max(1, w)
  const height = Math.max(1, h)
  switch (shape) {
    case 'round_rectangle':
      return roundedRect(width, height, Math.min(16, height / 3))
    case 'square':
      return `M 0 0 H ${round(width)} V ${round(height)} H 0 Z`
    case 'circle':
      return `M ${round(width / 2)} 0 A ${round(width / 2)} ${round(height / 2)} 0 1 1 ${round(width / 2 - 0.01)} 0 Z`
    case 'triangle':
      return polygon([
        [width / 2, 0],
        [width, height],
        [0, height]
      ])
    case 'right_triangle':
      return polygon([
        [0, 0],
        [width, height],
        [0, height]
      ])
    case 'diamond':
      return polygon([
        [width / 2, 0],
        [width, height / 2],
        [width / 2, height],
        [0, height / 2]
      ])
    case 'parallelogram':
      return polygon([
        [width * 0.18, 0],
        [width, 0],
        [width * 0.82, height],
        [0, height]
      ])
    case 'trapezoid':
      return polygon([
        [width * 0.22, 0],
        [width * 0.78, 0],
        [width, height],
        [0, height]
      ])
    case 'pentagon':
      return polygon(regular(5, width, height))
    case 'hexagon':
      return polygon(regular(6, width, height))
    case 'octagon':
      return polygon(regular(8, width, height))
    case 'star':
      return polygon(starPoints(width, height))
    case 'pie':
      return `M ${round(width / 2)} ${round(height / 2)} L ${round(width / 2)} 0 A ${round(width / 2)} ${round(
        height / 2
      )} 0 1 1 ${round(width * 0.94)} ${round(height * 0.72)} Z`
    case 'cross':
      return polygon([
        [width * 0.36, 0],
        [width * 0.64, 0],
        [width * 0.64, height * 0.36],
        [width, height * 0.36],
        [width, height * 0.64],
        [width * 0.64, height * 0.64],
        [width * 0.64, height],
        [width * 0.36, height],
        [width * 0.36, height * 0.64],
        [0, height * 0.64],
        [0, height * 0.36],
        [width * 0.36, height * 0.36]
      ])
    case 'arrow_right':
      return polygon([
        [0, height * 0.28],
        [width * 0.62, height * 0.28],
        [width * 0.62, 0],
        [width, height / 2],
        [width * 0.62, height],
        [width * 0.62, height * 0.72],
        [0, height * 0.72]
      ])
    case 'arrow_left':
      return polygon([
        [width, height * 0.28],
        [width * 0.38, height * 0.28],
        [width * 0.38, 0],
        [0, height / 2],
        [width * 0.38, height],
        [width * 0.38, height * 0.72],
        [width, height * 0.72]
      ])
    case 'arrow_up':
      return polygon([
        [width * 0.28, height],
        [width * 0.28, height * 0.38],
        [0, height * 0.38],
        [width / 2, 0],
        [width, height * 0.38],
        [width * 0.72, height * 0.38],
        [width * 0.72, height]
      ])
    case 'arrow_down':
      return polygon([
        [width * 0.28, 0],
        [width * 0.28, height * 0.62],
        [0, height * 0.62],
        [width / 2, height],
        [width, height * 0.62],
        [width * 0.72, height * 0.62],
        [width * 0.72, 0]
      ])
    case 'flowchart_start':
      return roundedRect(width, height, height / 2)
    case 'flowchart_end':
      return polygon([
        [height / 2, 0],
        [width - height / 2, 0],
        [width, height / 2],
        [width - height / 2, height],
        [height / 2, height],
        [0, height / 2]
      ])
    case 'flowchart_process':
      return `M 0 0 H ${round(width)} V ${round(height)} H 0 Z`
    case 'flowchart_decision':
      return polygon([
        [width / 2, 0],
        [width, height / 2],
        [width / 2, height],
        [0, height / 2]
      ])
    case 'flowchart_input_output':
      return polygon([
        [width * 0.16, 0],
        [width, 0],
        [width * 0.84, height],
        [0, height]
      ])
    case 'flowchart_document':
      return (
        `M 0 0 H ${round(width)} V ${round(height)} H 0 Z ` +
        `M 0 ${round(height * 0.22)} H ${round(width)} ` +
        `M 0 ${round(height * 0.78)} H ${round(width)}`
      )
    case 'cloud': {
      const path: string[] = []
      const bumps = 7
      for (let i = 0; i < bumps; i += 1) {
        const cx = width * (0.14 + (i * 0.72) / (bumps - 1))
        const cy = height * (i % 2 === 0 ? 0.38 : 0.62)
        const r = height * (i % 2 === 0 ? 0.34 : 0.28)
        path.push(`A ${round(r)} ${round(r)} 0 0 1 ${round(cx)} ${round(cy)}`)
      }
      return `M 0 ${round(height * 0.5)} ` + path.join(' ') + ` Z`
    }
    default:
      return `M 0 0 H ${round(width)} V ${round(height)} H 0 Z`
  }
}

export function shapeNeedsStrokeAlignment(shape: ShapeName): boolean {
  return shape === 'cloud'
}

export function strokeDash(style: 'normal' | 'dotted' | 'dashed'): string | undefined {
  if (style === 'dashed') return '10 8'
  if (style === 'dotted') return '1 7'
  return undefined
}