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

interface Parser {
  tokens: GraphToken[]
  index: number
}

function parseExpression(parser: Parser): number {
  let left = parseTerm(parser)
  for (;;) {
    const token = parser.tokens[parser.index]
    if (!token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) return left
    parser.index += 1
    const right = parseTerm(parser)
    left = token.value === '+' ? left + right : left - right
  }
}

function parseTerm(parser: Parser): number {
  let left = parsePower(parser)
  for (;;) {
    const token = parser.tokens[parser.index]
    if (!token || token.kind !== 'op' || (token.value !== '*' && token.value !== '/' && token.value !== '%')) return left
    parser.index += 1
    const right = parsePower(parser)
    if (token.value === '*') left *= right
    else if (token.value === '/') left /= right
    else left %= right
  }
}

function parsePower(parser: Parser): number {
  const base = parseUnary(parser)
  const token = parser.tokens[parser.index]
  if (token && token.kind === 'op' && token.value === '^') {
    parser.index += 1
    const exponent = parsePower(parser)
    return Math.pow(base, exponent)
  }
  return base
}

function parseUnary(parser: Parser): number {
  const token = parser.tokens[parser.index]
  if (token && token.kind === 'op' && (token.value === '-' || token.value === '+')) {
    parser.index += 1
    const value = parseUnary(parser)
    return token.value === '-' ? -value : value
  }
  return parseAtom(parser)
}

function parseAtom(parser: Parser): number {
  const token = parser.tokens[parser.index]
  if (!token) throw new Error('Не хватает значения')
  if (token.kind === 'num') {
    parser.index += 1
    return Number(token.value)
  }
  if (token.kind === 'paren' && token.value === '(') {
    parser.index += 1
    const value = parseExpression(parser)
    const close = parser.tokens[parser.index]
    if (!close || close.value !== ')') throw new Error('Нет закрывающей скобки')
    parser.index += 1
    return value
  }
  if (token.kind === 'var') {
    parser.index += 1
    const name = token.value
    if (name === 'x' || name === 'y' || name === 't') return 0
    if (name === 'pi') return Math.PI
    if (name === 'e') return Math.E
    if (name in FUNCS || name in FUNCS2) {
      const open = parser.tokens[parser.index]
      if (!open || open.value !== '(') throw new Error('После функции нужна скобка')
      parser.index += 1
      const first = parseExpression(parser)
      let value = first
      const close = parser.tokens[parser.index]
      if (close && close.value === ',') {
        parser.index += 1
        const second = parseExpression(parser)
        value = (FUNCS2[name] ?? ((a: number, b: number) => FUNCS[name]?.(a) ?? b))(first, second)
      } else {
        const fn = FUNCS[name]
        if (!fn) throw new Error('Неизвестная функция: ' + name)
        value = fn(first)
      }
      const tail = parser.tokens[parser.index]
      if (!tail || tail.value !== ')') throw new Error('Нет закрывающей скобки')
      parser.index += 1
      return value
    }
    throw new Error('Неизвестное имя: ' + name)
  }
  throw new Error('Неожиданный символ: ' + token.value)
}

export type FormulaFn = (x: number) => number

export function compileFormula(src: string): FormulaFn | null {
  const source = String(src ?? '').trim()
  if (!source) return null
  const cleaned = source.replace(/^y\s*=\s*/i, '').replace(/\^/g, '^')
  if (!cleaned) return null
  let tokens: GraphToken[]
  try {
    tokens = tokenizeFormula(cleaned)
  } catch {
    return null
  }
  const parser: Parser = { tokens, index: 0 }
  try {
    let usesVariable = false
    const walk = (list: GraphToken[]): void => {
      for (const token of list) {
        if (token.kind === 'var' && (token.value === 'x' || token.value === 'y' || token.value === 't')) usesVariable = true
      }
    }
    walk(tokens)
    if (!usesVariable) return null
    parseExpression(parser)
    if (parser.index !== parser.tokens.length) return null
  } catch {
    return null
  }
  return (x: number): number => {
    const scoped: Parser = { tokens, index: 0 }
    try {
      return evaluate(scoped, x)
    } catch {
      return Number.NaN
    }
  }
}

function evaluate(parser: Parser, x: number): number {
  return parseExpressionValue(parser, x)
}

function parseExpressionValue(parser: Parser, x: number): number {
  let left = parseTermValue(parser, x)
  for (;;) {
    const token = parser.tokens[parser.index]
    if (!token || token.kind !== 'op' || (token.value !== '+' && token.value !== '-')) return left
    parser.index += 1
    const right = parseTermValue(parser, x)
    left = token.value === '+' ? left + right : left - right
  }
}

function parseTermValue(parser: Parser, x: number): number {
  let left = parsePowerValue(parser, x)
  for (;;) {
    const token = parser.tokens[parser.index]
    if (!token || token.kind !== 'op' || (token.value !== '*' && token.value !== '/' && token.value !== '%')) return left
    parser.index += 1
    const right = parsePowerValue(parser, x)
    if (token.value === '*') left *= right
    else if (token.value === '/') left /= right
    else left %= right
  }
}

function parsePowerValue(parser: Parser, x: number): number {
  const base = parseUnaryValue(parser, x)
  const token = parser.tokens[parser.index]
  if (token && token.kind === 'op' && token.value === '^') {
    parser.index += 1
    return Math.pow(base, parsePowerValue(parser, x))
  }
  return base
}

function parseUnaryValue(parser: Parser, x: number): number {
  const token = parser.tokens[parser.index]
  if (token && token.kind === 'op' && (token.value === '-' || token.value === '+')) {
    parser.index += 1
    const value = parseUnaryValue(parser, x)
    return token.value === '-' ? -value : value
  }
  return parseAtomValue(parser, x)
}

function parseAtomValue(parser: Parser, x: number): number {
  const token = parser.tokens[parser.index]
  if (!token) return Number.NaN
  if (token.kind === 'num') {
    parser.index += 1
    return Number(token.value)
  }
  if (token.kind === 'paren' && token.value === '(') {
    parser.index += 1
    const value = parseExpressionValue(parser, x)
    if (parser.tokens[parser.index]?.value === ')') parser.index += 1
    return value
  }
  if (token.kind === 'var') {
    parser.index += 1
    const name = token.value
    if (name === 'x' || name === 't') return x
    if (name === 'y') return x
    if (name === 'pi') return Math.PI
    if (name === 'e') return Math.E
    if (parser.tokens[parser.index]?.value === '(') {
      parser.index += 1
      const first = parseExpressionValue(parser, x)
      let value = first
      if (parser.tokens[parser.index]?.value === ',') {
        parser.index += 1
        const second = parseExpressionValue(parser, x)
        value = FUNCS2[name] ? FUNCS2[name](first, second) : Math.pow(first, second)
      } else {
        value = FUNCS[name] ? FUNCS[name](first) : Number.NaN
      }
      if (parser.tokens[parser.index]?.value === ')') parser.index += 1
      return value
    }
    return Number.NaN
  }
  return Number.NaN
}

export interface CurvePoint {
  x: number
  y: number
}

export function sampleCurve(fn: FormulaFn, xFrom: number, xTo: number, samples = 420): CurvePoint[] {
  const out: CurvePoint[] = []
  const span = xTo - xFrom
  if (!Number.isFinite(span) || span === 0) return out
  const step = span / samples
  for (let index = 0; index <= samples; index += 1) {
    const x = xFrom + index * step
    const y = fn(x)
    if (!Number.isFinite(y)) {
      if (out.length) out.push({ x, y: Number.NaN })
      continue
    }
    out.push({ x, y })
  }
  return out
}