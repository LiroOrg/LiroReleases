export interface GraphToken {
  kind: 'num' | 'var' | 'op' | 'fn' | 'paren'
  value: string
}

const FUNCS: Record<string, (value: number) => number> = {
  sin: (v) => Math.sin(v),
  cos: (v) => Math.cos(v),
  tan: (v) => Math.tan(v),
  asin: (v) => Math.asin(v),
  acos: (v) => Math.acos(v),
  atan: (v) => Math.atan(v),
  sqrt: (v) => Math.sqrt(v),
  abs: (v) => Math.abs(v),
  ln: (v) => Math.log(v),
  log: (v) => Math.log10(v),
  log2: (v) => Math.log2(v),
  exp: (v) => Math.exp(v),
  sign: (v) => Math.sign(v),
  floor: (v) => Math.floor(v),
  ceil: (v) => Math.ceil(v),
  round: (v) => Math.round(v),
  min: (v) => Math.min(v, 1),
  max: (v) => Math.max(v, 1)
}

const FUNCS2: Record<string, (a: number, b: number) => number> = {
  pow: (a, b) => Math.pow(a, b),
  atan2: (a, b) => Math.atan2(a, b),
  mod: (a, b) => a % b
}

export const GRAPH_FUNCTIONS = Object.keys(FUNCS)
export const GRAPH_FUNCTIONS2 = Object.keys(FUNCS2)
export const GRAPH_CONSTANTS = ['pi', 'e']

const PRECEDENCE: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 4 }

export function tokenizeFormula(src: string): GraphToken[] {
  const tokens: GraphToken[] = []
  const text = String(src ?? '')
  let index = 0
  while (index < text.length) {
    const char = text[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (/[0-9.]/.test(char)) {
      let raw = ''
      while (index < text.length && /[0-9.]/.test(text[index])) {
        raw += text[index]
        index += 1
      }
      tokens.push({ kind: 'num', value: raw })
      continue
    }
    if (/[a-zA-Z]/.test(char)) {
      let raw = ''
      while (index < text.length && /[a-zA-Z0-9]/.test(text[index])) {
        raw += text[index]
        index += 1
      }
      tokens.push({ kind: 'var', value: raw.toLowerCase() })
      continue
    }
    if (char === '(' || char === ')') {
      tokens.push({ kind: 'paren', value: char })
      index += 1
      continue
    }
    if (char === '*' && text[index + 1] === '*') {
      tokens.push({ kind: 'op', value: '^' })
      index += 2
      continue
    }
    if (char in PRECEDENCE) {
      tokens.push({ kind: 'op', value: char })
      index += 1
      continue
    }
    throw new Error('Неизвестный символ: ' + char)
  }
  return tokens
}

export type FormulaFn = (x: number) => number

type Ast =
  | { k: 'num'; v: number }
  | { k: 'var' }
  | { k: 'neg'; a: Ast }
  | { k: 'bin'; op: string; a: Ast; b: Ast }
  | { k: 'fn'; name: string; args: Ast[] }

interface Reader {
  tokens: GraphToken[]
  index: number
}

function readExpression(reader: Reader): Ast {
  let left = readTerm(reader)
  for (;;) {
    const token = reader.tokens[reader.index]
    if (!token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) return left
    reader.index += 1
    left = { k: 'bin', op: token.value, a: left, b: readTerm(reader) }
  }
}

function readTerm(reader: Reader): Ast {
  let left = readPower(reader)
  for (;;) {
    const token = reader.tokens[reader.index]
    if (!token || token.kind !== 'op' || (token.value !== '*' && token.value !== '/' && token.value !== '%')) return left
    reader.index += 1
    left = { k: 'bin', op: token.value, a: left, b: readPower(reader) }
  }
}

function readPower(reader: Reader): Ast {
  const base = readUnary(reader)
  const token = reader.tokens[reader.index]
  if (token && token.kind === 'op' && token.value === '^') {
    reader.index += 1
    return { k: 'bin', op: '^', a: base, b: readPower(reader) }
  }
  return base
}

function readUnary(reader: Reader): Ast {
  const token = reader.tokens[reader.index]
  if (token && token.kind === 'op' && (token.value === '-' || token.value === '+')) {
    reader.index += 1
    const value = readUnary(reader)
    return token.value === '-' ? { k: 'neg', a: value } : value
  }
  return readAtom(reader)
}

function readAtom(reader: Reader): Ast {
  const token = reader.tokens[reader.index]
  if (!token) throw new Error('Не хватает значения')
  if (token.kind === 'num') {
    reader.index += 1
    return { k: 'num', v: Number(token.value) }
  }
  if (token.kind === 'paren' && token.value === '(') {
    reader.index += 1
    const value = readExpression(reader)
    const close = reader.tokens[reader.index]
    if (!close || close.value !== ')') throw new Error('Нет закрывающей скобки')
    reader.index += 1
    return value
  }
  if (token.kind === 'var') {
    reader.index += 1
    const name = token.value
    if (name === 'x' || name === 'y' || name === 't') return { k: 'var' }
    if (name === 'pi') return { k: 'num', v: Math.PI }
    if (name === 'e') return { k: 'num', v: Math.E }
    if (name in FUNCS || name in FUNCS2) {
      const open = reader.tokens[reader.index]
      if (!open || open.value !== '(') throw new Error('После функции нужна скобка')
      reader.index += 1
      const args = [readExpression(reader)]
      if (reader.tokens[reader.index]?.value === ',') {
        reader.index += 1
        args.push(readExpression(reader))
      }
      const tail = reader.tokens[reader.index]
      if (!tail || tail.value !== ')') throw new Error('Нет закрывающей скобки')
      reader.index += 1
      return { k: 'fn', name, args }
    }
    throw new Error('Неизвестное имя: ' + name)
  }
  throw new Error('Неожиданный символ: ' + token.value)
}

function fold(node: Ast): number | null {
  if (node.k === 'num') return node.v
  if (node.k === 'var') return null
  if (node.k === 'neg') {
    const value = fold(node.a)
    return value === null ? null : -value
  }
  if (node.k === 'bin') {
    const left = fold(node.a)
    const right = fold(node.b)
    if (left === null || right === null) return null
    if (node.op === '+') return left + right
    if (node.op === '-') return left - right
    if (node.op === '*') return left * right
    if (node.op === '/') return left / right
    if (node.op === '%') return left % right
    return Math.pow(left, right)
  }
  const values: number[] = []
  for (const arg of node.args) {
    const value = fold(arg)
    if (value === null) return null
    values.push(value)
  }
  const single = FUNCS[node.name]
  if (values.length === 1 && single) return single(values[0])
  if (values.length === 2) {
    const pair = FUNCS2[node.name]
    if (pair) return pair(values[0], values[1])
    if (single) return single(values[0])
  }
  return null
}

function constant(value: number): FormulaFn {
  return () => value
}

function compileNode(node: Ast): FormulaFn {
  const folded = fold(node)
  if (folded !== null) return constant(folded)
  if (node.k === 'num') return constant(node.v)
  if (node.k === 'var') return (x) => x
  if (node.k === 'neg') {
    const inner = compileNode(node.a)
    return (x) => -inner(x)
  }
  if (node.k === 'bin') {
    const left = compileNode(node.a)
    const right = compileNode(node.b)
    if (node.op === '+') return (x) => left(x) + right(x)
    if (node.op === '-') return (x) => left(x) - right(x)
    if (node.op === '*') return (x) => left(x) * right(x)
    if (node.op === '/') return (x) => left(x) / right(x)
    if (node.op === '%') return (x) => left(x) % right(x)
    return (x) => Math.pow(left(x), right(x))
  }
  const args = node.args.map(compileNode)
  const first = args[0]
  const second = args[1] ?? constant(1)
  const pair = FUNCS2[node.name]
  if (pair) return (x) => pair(first(x), second(x))
  const single = FUNCS[node.name]
  if (!single) return constant(Number.NaN)
  return (x) => single(first(x))
}

export function compileFormula(src: string): FormulaFn | null {
  const source = String(src ?? '').trim()
  if (!source) return null
  const cleaned = source.replace(/^y\s*=\s*/i, '')
  if (!cleaned) return null
  let tokens: GraphToken[]
  try {
    tokens = tokenizeFormula(cleaned)
  } catch {
    return null
  }
  if (!tokens.some((token) => token.kind === 'var' && (token.value === 'x' || token.value === 'y' || token.value === 't')))
    return null
  const reader: Reader = { tokens, index: 0 }
  let ast: Ast
  try {
    ast = readExpression(reader)
    if (reader.index !== tokens.length) return null
  } catch {
    return null
  }
  const fn = compileNode(ast)
  try {
    if (typeof fn(0.5) !== 'number') return null
  } catch {
    return null
  }
  return fn
}

interface PixelPoint {
  x: number
  sx: number
  sy: number
}

function refine(
  fn: FormulaFn,
  toX: (x: number) => number,
  toY: (y: number) => number,
  a: PixelPoint,
  b: PixelPoint,
  depth: number,
  budget: { left: number },
  out: PixelPoint[]
): void {
  if (depth > 0 && budget.left > 0 && Math.abs(b.sy - a.sy) < 600) {
    const x = (a.x + b.x) / 2
    const y = fn(x)
    if (Number.isFinite(y)) {
      const sx = toX(x)
      const sy = toY(y)
      if (Math.abs(sy - (a.sy + b.sy) / 2) > 0.3) {
        const mid: PixelPoint = { x, sx, sy }
        budget.left -= 1
        refine(fn, toX, toY, a, mid, depth - 1, budget, out)
        refine(fn, toX, toY, mid, b, depth - 1, budget, out)
        return
      }
    }
  }
  out.push(b)
}

export function curveSegments(
  fn: FormulaFn,
  xFrom: number,
  xTo: number,
  toX: (x: number) => number,
  toY: (y: number) => number,
  width: number,
  height: number
): string[][] {
  const span = xTo - xFrom
  if (!Number.isFinite(span) || span === 0) return []
  const base = Math.max(240, Math.min(1800, Math.round(width)))
  const budget = { left: Math.min(6000, Math.max(1600, base * 3)) }
  const track: PixelPoint[] = []
  let previous: PixelPoint | null = null
  for (let index = 0; index <= base; index += 1) {
    const x = xFrom + (index * span) / base
    const y = fn(x)
    const point: PixelPoint = { x, sx: toX(x), sy: Number.isFinite(y) ? toY(y) : Number.NaN }
    if (!previous) track.push(point)
    else refine(fn, toX, toY, previous, point, 4, budget, track)
    previous = point
  }
  const segments: string[][] = []
  let current: string[] = []
  let lastSx = Number.NaN
  let lastSy = Number.NaN
  let runSide = 0
  const bandTop = -height * 0.08
  const bandBottom = height * 1.08
  const jumpLimit = Math.max(60, height * 2)
  const flush = (): void => {
    if (current.length >= 2) segments.push(current)
    current = []
    lastSx = Number.NaN
    lastSy = Number.NaN
    runSide = 0
  }
  const emit = (sx: number, sy: number): void => {
    if (current.length && Math.abs(sx - lastSx) < 0.4 && Math.abs(sy - lastSy) < 0.4) return
    current.push(`${sx.toFixed(1)},${sy.toFixed(1)}`)
    lastSx = sx
    lastSy = sy
  }
  const sideOf = (sy: number): number => (sy < bandTop ? -1 : sy > bandBottom ? 1 : 0)
  const edge = (side: number): number => (side < 0 ? bandTop : bandBottom)
  const crossing = (a: PixelPoint, b: PixelPoint, target: number): void => {
    const t = (target - a.sy) / (b.sy - a.sy)
    emit(a.sx + (b.sx - a.sx) * t, target)
  }
  for (let index = 1; index < track.length; index += 1) {
    const a = track[index - 1]
    const b = track[index]
    if (!Number.isFinite(a.sy) || !Number.isFinite(b.sy) || Math.abs(b.sy - a.sy) > jumpLimit) {
      flush()
      continue
    }
    const from = sideOf(a.sy)
    const to = sideOf(b.sy)
    if (from === 0 && to === 0) {
      if (current.length === 0) emit(a.sx, a.sy)
      runSide = 0
      emit(b.sx, b.sy)
      continue
    }
    if (from !== 0 && to !== 0) {
      if (from !== to) {
        flush()
        continue
      }
      if (current.length === 0) runSide = from
      else if (runSide !== from) {
        crossing(a, b, edge(from))
        runSide = from
      }
      continue
    }
    if (from === 0) {
      if (current.length === 0) emit(a.sx, a.sy)
      crossing(a, b, edge(to))
      runSide = to
      continue
    }
    if (current.length === 0) crossing(b, a, edge(from))
    runSide = 0
    emit(b.sx, b.sy)
  }
  flush()
  return segments
}
