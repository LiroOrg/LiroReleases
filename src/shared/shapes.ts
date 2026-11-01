import type { ShapeName } from '@shared/types'

const round = (value: number): number => Math.round(value * 100) / 100

const polygon = (points: Array<[number, number]>): string => {
  if (!points.length) return ''
  const [first, ...rest] = points
  return `M ${round(first[0])} ${round(first[1])} ` + rest.map(([x, y]) => `L ${round(x)} ${round(y)}`).join(' ') + ' Z'
}

const regular = (sides: number, w: number, h: number, rotation = -Math.PI / 2): Array<[number, number]> => {
  const cx = w / 2
  const cy = h / 2
  const points: Array<[number, number]> = []
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i * 2 * Math.PI) / sides
    points.push([cx + cx * Math.cos(angle), cy + cy * Math.sin(angle)])
  }
  return points
}

const starPoints = (w: number, h: number, points = 5, innerRatio = 0.42): Array<[number, number]> => {
  const cx = w / 2
  const cy = h / 2
  const result: Array<[number, number]> = []
  for (let i = 0; i < points * 2; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points
    const ratio = i % 2 === 0 ? 1 : innerRatio
    result.push([cx + cx * ratio * Math.cos(angle), cy + cy * ratio * Math.sin(angle)])
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

const blobPath = (w: number, h: number): string => {
  const ratios = [0.98, 0.72, 0.94, 0.76, 1, 0.84]
  const points = ratios.map((ratio, index): [number, number] => {
    const angle = (index * 2 * Math.PI) / ratios.length
    return [w / 2 + (w / 2) * ratio * Math.cos(angle), h / 2 + (h / 2) * ratio * Math.sin(angle)]
  })
  const segments = points.map((point, index) => {
    const before = points[(index - 1 + points.length) % points.length]
    const after = points[(index + 1) % points.length]
    const far = points[(index + 2) % points.length]
    const first: [number, number] = [point[0] + (after[0] - before[0]) / 6, point[1] + (after[1] - before[1]) / 6]
    const second: [number, number] = [after[0] - (far[0] - point[0]) / 6, after[1] - (far[1] - point[1]) / 6]
    return `C ${round(first[0])} ${round(first[1])} ${round(second[0])} ${round(second[1])} ${round(after[0])} ${round(after[1])}`
  })
  return `M ${round(points[0][0])} ${round(points[0][1])} ` + segments.join(' ') + ' Z'
}

const bubblePath = (w: number, h: number): string => {
  const body = h * 0.78
  const r = Math.min(18, body / 3, w / 4)
  return (
    `M ${round(r)} 0 H ${round(w - r)} A ${round(r)} ${round(r)} 0 0 1 ${round(w)} ${round(r)} V ${round(body - r)} ` +
    `A ${round(r)} ${round(r)} 0 0 1 ${round(w - r)} ${round(body)} H ${round(w * 0.36)} L ${round(w * 0.1)} ${round(h)} ` +
    `L ${round(w * 0.18)} ${round(body)} H ${round(r)} A ${round(r)} ${round(r)} 0 0 1 0 ${round(body - r)} V ${round(r)} ` +
    `A ${round(r)} ${round(r)} 0 0 1 ${round(r)} 0 Z`
  )
}

const ellipseArcs = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from: number,
  to: number,
  segments: number
): string => {
  const sweep = to >= from ? 1 : 0
  let d = ''
  for (let i = 1; i <= segments; i++) {
    const angle = from + ((to - from) * i) / segments
    d += ` A ${round(rx)} ${round(ry)} 0 0 ${sweep} ${round(cx + rx * Math.cos(angle))} ${round(cy + ry * Math.sin(angle))}`
  }
  return d
}

const ovalBubblePath = (w: number, h: number): string => {
  const body = h * 0.82
  const notch = (118 * Math.PI) / 180
  const tail = (152 * Math.PI) / 180
  const start: [number, number] = [w / 2 + (w / 2) * Math.cos(tail), body / 2 + (body / 2) * Math.sin(tail)]
  return (
    `M ${round(start[0])} ${round(start[1])}` +
    ellipseArcs(w / 2, body / 2, w / 2, body / 2, tail, notch + Math.PI * 2, 8) +
    ` L ${round(w * 0.12)} ${round(h)} Z`
  )
}

const tagPath = (w: number, h: number): string => {
  const r = Math.min(w, h) * 0.07
  const hole = w * 0.3
  return (
    `M ${round(w * 0.26)} 0 H ${round(w)} V ${round(h)} H ${round(w * 0.26)} L 0 ${round(h / 2)} Z ` +
    `M ${round(hole + r)} ${round(h / 2)} A ${round(r)} ${round(r)} 0 1 0 ${round(hole - r)} ${round(h / 2)} ` +
    `A ${round(r)} ${round(r)} 0 1 0 ${round(hole + r)} ${round(h / 2)} Z`
  )
}

const crossXPath = (w: number, h: number): string => {
  const t = 0.17
  return polygon([
    [0, h * t],
    [w * t, 0],
    [w * 0.5, h * (0.5 - t)],
    [w * (1 - t), 0],
    [w, h * t],
    [w * (0.5 + t), h * 0.5],
    [w, h * (1 - t)],
    [w * (1 - t), h],
    [w * 0.5, h * (0.5 + t)],
    [w * t, h],
    [0, h * (1 - t)],
    [w * (0.5 - t), h * 0.5]
  ])
}

const sparklePath = (w: number, h: number): string => {
  const cx = w / 2
  const cy = h / 2
  const arm = `${round(cx)} ${round(cy)}`
  return (
    `M ${round(cx)} 0 Q ${arm} ${round(w)} ${round(cy)} Q ${arm} ${round(cx)} ${round(h)} ` +
    `Q ${arm} 0 ${round(cy)} Q ${arm} ${round(cx)} 0 Z`
  )
}

const closedCircle = (cx: number, cy: number, rx: number, ry: number, dir: 1 | -1): string => {
  const from = -Math.PI / 2
  return `M ${round(cx)} ${round(cy - ry)}` + ellipseArcs(cx, cy, rx, ry, from, from + dir * Math.PI * 2, 4) + ' Z'
}

const cloudPath = (w: number, h: number): string => {
  const outline: Array<[number, number]> = [
    [0.14, 0.94],
    [0.16, 0.56],
    [0.34, 0.34],
    [0.5, 0.46],
    [0.66, 0.18],
    [0.84, 0.42],
    [0.86, 0.94]
  ]
  let d = `M ${round(outline[0][0] * w)} ${round(outline[0][1] * h)}`
  for (let i = 1; i < outline.length; i++) {
    const chord = Math.hypot((outline[i][0] - outline[i - 1][0]) * w, (outline[i][1] - outline[i - 1][1]) * h)
    d += ` A ${round(chord * 0.62)} ${round(chord * 0.62)} 0 0 1 ${round(outline[i][0] * w)} ${round(outline[i][1] * h)}`
  }
  return d + ` Z`
}

const sealPath = (w: number, h: number): string => {
  const bumps = 12
  const cx = w / 2
  const cy = h / 2
  const radius = (Math.min(w, h) / 2) * 0.88
  let d = `M ${round(cx + radius)} ${round(cy)}`
  for (let i = 1; i <= bumps; i++) {
    const angle = (i * 2 * Math.PI) / bumps
    const x = cx + radius * Math.cos(angle)
    const y = cy + radius * Math.sin(angle)
    const chord = 2 * radius * Math.sin(Math.PI / bumps)
    d += ` A ${round(chord * 0.62)} ${round(chord * 0.62)} 0 0 1 ${round(x)} ${round(y)}`
  }
  return d + ' Z'
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
    case 'semicircle':
      return `M 0 ${round(height)} A ${round(width / 2)} ${round(height)} 0 0 1 ${round(width)} ${round(height)} Z`
    case 'quarter_circle':
      return `M 0 ${round(height)} L 0 0 A ${round(width)} ${round(height)} 0 0 1 ${round(width)} ${round(height)} Z`
    case 'arch':
      return `M 0 ${round(height)} V ${round(height / 2)} A ${round(width / 2)} ${round(height / 2)} 0 0 1 ${round(
        width
      )} ${round(height / 2)} V ${round(height)} Z`
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
    case 'star_six':
      return polygon(starPoints(width, height, 6, 0.58))
    case 'star_burst':
      return polygon(starPoints(width, height, 12, 0.76))
    case 'sparkle':
      return sparklePath(width, height)
    case 'pie': {
      const from = (-7 * Math.PI) / 6
      const start: [number, number] = [
        width / 2 + (width / 2) * Math.cos(from),
        height / 2 + (height / 2) * Math.sin(from)
      ]
      return (
        `M ${round(width / 2)} ${round(height / 2)} L ${round(start[0])} ${round(start[1])}` +
        ellipseArcs(width / 2, height / 2, width / 2, height / 2, from, from + (4 * Math.PI) / 3, 6) +
        ' Z'
      )
    }
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
    case 'cross_x':
      return crossXPath(width, height)
    case 'shield':
      return (
        `M 0 0 H ${round(width)} V ${round(height * 0.42)} ` +
        `C ${round(width)} ${round(height * 0.72)} ${round(width * 0.78)} ${round(height * 0.9)} ${round(width / 2)} ${round(height)} ` +
        `C ${round(width * 0.22)} ${round(height * 0.9)} 0 ${round(height * 0.72)} 0 ${round(height * 0.42)} Z`
      )
    case 'tag':
      return tagPath(width, height)
    case 'blob':
      return blobPath(width, height)
    case 'speech_round':
      return bubblePath(width, height)
    case 'speech_oval':
      return ovalBubblePath(width, height)
    case 'ribbon':
      return polygon([
        [0, 0],
        [width, 0],
        [width * 0.86, height / 2],
        [width, height],
        [0, height],
        [width * 0.14, height / 2]
      ])
    case 'chevron':
      return polygon([
        [0, 0],
        [width * 0.6, 0],
        [width, height / 2],
        [width * 0.6, height],
        [0, height],
        [width * 0.34, height / 2]
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
    case 'arrow_double':
      return polygon([
        [0, height / 2],
        [width * 0.22, 0],
        [width * 0.22, height * 0.28],
        [width * 0.78, height * 0.28],
        [width * 0.78, 0],
        [width, height / 2],
        [width * 0.78, height],
        [width * 0.78, height * 0.72],
        [width * 0.22, height * 0.72],
        [width * 0.22, height]
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
    case 'cloud':
      return cloudPath(width, height)
    case 'seal':
      return sealPath(width, height)
    case 'heart':
      return (
        `M ${round(width / 2)} ${round(height)} ` +
        `C ${round(width * 0.16)} ${round(height * 0.72)} 0 ${round(height * 0.52)} 0 ${round(height * 0.32)} ` +
        `C 0 ${round(height * 0.12)} ${round(width * 0.1)} 0 ${round(width * 0.22)} 0 ` +
        `C ${round(width * 0.34)} 0 ${round(width * 0.44)} ${round(height * 0.07)} ${round(width / 2)} ${round(height * 0.16)} ` +
        `C ${round(width * 0.56)} ${round(height * 0.07)} ${round(width * 0.66)} 0 ${round(width * 0.78)} 0 ` +
        `C ${round(width * 0.9)} 0 ${round(width)} ${round(height * 0.12)} ${round(width)} ${round(height * 0.32)} ` +
        `C ${round(width)} ${round(height * 0.52)} ${round(width * 0.84)} ${round(height * 0.72)} ${round(width / 2)} ${round(height)} Z`
      )
    case 'drop':
      return (
        `M ${round(width / 2)} 0 ` +
        `C ${round(width * 0.78)} ${round(height * 0.34)} ${round(width)} ${round(height * 0.5)} ${round(width)} ${round(height * 0.62)} ` +
        `A ${round(width / 2)} ${round(height * 0.38)} 0 0 1 0 ${round(height * 0.62)} ` +
        `C 0 ${round(height * 0.5)} ${round(width * 0.22)} ${round(height * 0.34)} ${round(width / 2)} 0 Z`
      )
    case 'moon': {
      const rx = width / 2
      const ry = height / 2
      const shift = rx * 0.6
      const hornY = ry * Math.sqrt(1 - (shift / (2 * rx)) ** 2)
      const hornX = rx + shift / 2
      return (
        `M ${round(hornX)} ${round(ry - hornY)} ` +
        `A ${round(rx)} ${round(ry)} 0 1 0 ${round(hornX)} ${round(ry + hornY)} ` +
        `A ${round(rx)} ${round(ry)} 0 0 1 ${round(hornX)} ${round(ry - hornY)} Z`
      )
    }
    case 'ring':
      return (
        closedCircle(width / 2, height / 2, width / 2, height / 2, 1) +
        ' ' +
        closedCircle(width / 2, height / 2, width * 0.31, height * 0.31, -1)
      )
    case 'lens': {
      const half = width / 2
      const sag = height * 0.3
      const reach = (half * half + sag * sag) / (2 * sag)
      return (
        `M 0 ${round(height / 2)} A ${round(reach)} ${round(reach)} 0 0 1 ${round(width)} ${round(height / 2)} ` +
        `A ${round(reach)} ${round(reach)} 0 0 1 0 ${round(height / 2)} Z`
      )
    }
    case 'pill': {
      const r = Math.min(width, height) / 2
      if (width >= height)
        return (
          `M ${round(width - r)} 0 L ${round(r)} 0` +
          ellipseArcs(r, height / 2, r, r, -Math.PI / 2, (-3 * Math.PI) / 2, 2) +
          ` L ${round(width - r)} ${round(height)}` +
          ellipseArcs(width - r, height / 2, r, r, Math.PI / 2, -Math.PI / 2, 2) +
          ' Z'
        )
      return (
        `M ${round(width)} ${round(r)} L ${round(width)} ${round(height - r)}` +
        ellipseArcs(width / 2, height - r, r, r, 0, Math.PI, 2) +
        ` L 0 ${round(r)}` +
        ellipseArcs(width / 2, r, r, r, Math.PI, Math.PI * 2, 2) +
        ' Z'
      )
    }
    case 'leaf':
      return (
        `M ${round(width * 0.06)} ${round(height * 0.94)}` +
        ` C ${round(width * 0.04)} ${round(height * 0.36)} ${round(width * 0.36)} ${round(height * 0.04)} ${round(width * 0.94)} ${round(height * 0.06)}` +
        ` C ${round(width * 0.96)} ${round(height * 0.64)} ${round(width * 0.64)} ${round(height * 0.96)} ${round(width * 0.06)} ${round(height * 0.94)} Z`
      )
    case 'lightning':
      return polygon([
        [width * 0.6, 0],
        [width * 0.06, height * 0.54],
        [width * 0.42, height * 0.54],
        [width * 0.3, height],
        [width * 0.94, height * 0.4],
        [width * 0.56, height * 0.4]
      ])
    case 'frame':
      return (
        roundedRect(width, height, Math.min(10, Math.min(width, height) / 5)) +
        ` M ${round(width * 0.22)} ${round(height * 0.22)} V ${round(height * 0.78)} H ${round(width * 0.78)} V ${round(
          height * 0.22
        )} H ${round(width * 0.22)} Z`
      )
    case 'bookmark':
      return polygon([
        [0, 0],
        [width, 0],
        [width, height],
        [width / 2, height * 0.62],
        [0, height]
      ])
    case 'flowchart_database': {
      const rx = width / 2
      const ry = height * 0.13
      return (
        `M ${round(width)} ${round(ry)}` +
        ellipseArcs(rx, ry, rx, ry, 0, -Math.PI, 2) +
        ` L 0 ${round(height - ry)}` +
        ellipseArcs(rx, height - ry, rx, ry, Math.PI, 0, 2) +
        ` L ${round(width)} ${round(ry)} Z M 0 ${round(ry)}` +
        ellipseArcs(rx, ry, rx, ry, Math.PI, 0, 2)
      )
    }
    default:
      return `M 0 0 H ${round(width)} V ${round(height)} H 0 Z`
  }
}

export const SHAPE_LABELS: Record<ShapeName, string> = {
  rectangle: 'Прямоугольник',
  round_rectangle: 'Скруглённый прямоугольник',
  square: 'Квадрат',
  circle: 'Круг',
  semicircle: 'Полукруг',
  quarter_circle: 'Четверть круга',
  arch: 'Арка',
  heart: 'Сердце',
  drop: 'Капля',
  moon: 'Полумесяц',
  ring: 'Кольцо',
  lens: 'Линза',
  pill: 'Капсула',
  leaf: 'Лист',
  triangle: 'Треугольник',
  right_triangle: 'Прямоугольный треугольник',
  diamond: 'Ромб',
  pentagon: 'Пятиугольник',
  hexagon: 'Шестиугольник',
  octagon: 'Восьмиугольник',
  trapezoid: 'Трапеция',
  parallelogram: 'Параллелограмм',
  star: 'Звезда',
  star_six: 'Шестиконечная звезда',
  sparkle: 'Искра',
  star_burst: 'Взрыв',
  pie: 'Сектор',
  cross: 'Плюс',
  cross_x: 'Крест',
  shield: 'Щит',
  tag: 'Ярлык',
  seal: 'Печать',
  lightning: 'Молния',
  frame: 'Рамка',
  cloud: 'Облако',
  blob: 'Клякса',
  speech_round: 'Облачко',
  speech_oval: 'Овальное облачко',
  bookmark: 'Закладка',
  ribbon: 'Лента',
  chevron: 'Шеврон',
  arrow_right: 'Стрелка вправо',
  arrow_left: 'Стрелка влево',
  arrow_up: 'Стрелка вверх',
  arrow_down: 'Стрелка вниз',
  arrow_double: 'Стрелка в обе стороны',
  flowchart_start: 'Старт',
  flowchart_end: 'Финал',
  flowchart_process: 'Процесс',
  flowchart_decision: 'Решение',
  flowchart_input_output: 'Ввод и вывод',
  flowchart_document: 'Документ',
  flowchart_database: 'База данных',
  unknown: 'Фигура'
}

export const SHAPE_GROUPS: Array<{ title: string; items: ShapeName[] }> = [
  {
    title: 'Основные',
    items: [
      'rectangle',
      'round_rectangle',
      'circle',
      'semicircle',
      'quarter_circle',
      'triangle',
      'right_triangle',
      'diamond',
      'trapezoid',
      'parallelogram',
      'pie',
      'heart',
      'drop',
      'moon',
      'ring',
      'lens',
      'pill',
      'leaf'
    ]
  },
  { title: 'Многоугольники', items: ['pentagon', 'hexagon', 'octagon', 'cloud', 'blob', 'arch'] },
  {
    title: 'Знаки',
    items: [
      'star',
      'star_six',
      'sparkle',
      'star_burst',
      'cross',
      'cross_x',
      'shield',
      'tag',
      'seal',
      'lightning',
      'frame'
    ]
  },
  { title: 'Выноски', items: ['speech_round', 'speech_oval', 'bookmark', 'ribbon', 'chevron'] },
  { title: 'Стрелки', items: ['arrow_right', 'arrow_left', 'arrow_up', 'arrow_down', 'arrow_double'] },
  {
    title: 'Схемы',
    items: [
      'flowchart_start',
      'flowchart_end',
      'flowchart_process',
      'flowchart_decision',
      'flowchart_input_output',
      'flowchart_document',
      'flowchart_database'
    ]
  }
]

export function strokeDash(style: 'normal' | 'dotted' | 'dashed'): string | undefined {
  if (style === 'dashed') return '10 8'
  if (style === 'dotted') return '1 7'
  return undefined
}
