export const SHEET_ERRORS = {
  div: '#ДЕЛ/0',
  value: '#ЗНАЧ',
  name: '#ИМЯ?',
  cycle: '#ЦИКЛ',
  ref: '#ССЫЛКА',
  empty: '#ПУСТО'
} as const

export interface SheetModel {
  columns: number
  rows: number
  cells: string[]
}

export interface SheetCell {
  text: string
  numeric: boolean
  formula: boolean
  error: boolean
}

export function columnName(index: number): string {
  let rest = index + 1
  let name = ''
  while (rest > 0) {
    const tail = (rest - 1) % 26
    name = String.fromCharCode(65 + tail) + name
    rest = Math.floor((rest - 1) / 26)
  }
  return name
}

export function cellAddress(column: number, row: number): string {
  return `${columnName(column)}${row + 1}`
}

export function parseAddress(text: string): { column: number; row: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})$/.exec(text)
  if (!match) return null
  const letters = match[1].toUpperCase()
  let column = 0
  for (const char of letters) column = column * 26 + (char.charCodeAt(0) - 64)
  const row = Number(match[2])
  if (!Number.isFinite(row) || row < 1) return null
  return { column: column - 1, row: row - 1 }
}

type Value =
  | { kind: 'num'; n: number }
  | { kind: 'text'; s: string }
  | { kind: 'bool'; b: boolean }
  | { kind: 'empty' }
  | { kind: 'err'; e: string }

const EMPTY: Value = { kind: 'empty' }

function error(text: string): Value {
  return { kind: 'err', e: text }
}

function truthy(value: Value): boolean {
  if (value.kind === 'num') return value.n !== 0
  if (value.kind === 'bool') return value.b
  if (value.kind === 'text') return value.s.toLowerCase() === 'истина' || value.s.toLowerCase() === 'true'
  return false
}

function asNumber(value: Value): number | null {
  if (value.kind === 'num') return value.n
  if (value.kind === 'bool') return value.b ? 1 : 0
  if (value.kind === 'empty') return 0
  if (value.kind === 'text') {
    const clean = value.s.replace(/\s/g, '').replace(',', '.')
    if (!/^[-+]?[\d.]+([e][-+]?\d+)?$/.test(clean)) return null
    const parsed = Number(clean)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return SHEET_ERRORS.div
  const rounded = Math.abs(value) < 1e-10 ? 0 : Math.round(value * 1e10) / 1e10
  if (Number.isInteger(rounded)) return String(rounded)
  return String(rounded)
}

function parseFormulaSource(text: string): Value {
  const clean = text.replace(/\s/g, '').replace(',', '.')
  if (!clean) return EMPTY
  if (/^[-+]?[\d.]+([e][-+]?\d+)?$/.test(clean)) {
    const parsed = Number(clean)
    return Number.isFinite(parsed) ? { kind: 'num', n: parsed } : error(SHEET_ERRORS.value)
  }
  return { kind: 'text', s: text }
}

type Token =
  | { t: 'num'; v: number }
  | { t: 'text'; v: string }
  | { t: 'ref'; c: number; r: number }
  | { t: 'range'; a: { c: number; r: number }; b: { c: number; r: number } }
  | { t: 'fn'; v: string }
  | { t: 'op'; v: string }
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'sep' }

const OPERATORS = ['<=', '>=', '<>', '=', '<', '>', '+', '-', '*', '/', '^', '&']

function tokenize(source: string): Token[] | string {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (char === ' ' || char === '\t') {
      index += 1
      continue
    }
    if (char === '(') {
      tokens.push({ t: 'open' })
      index += 1
      continue
    }
    if (char === ')') {
      tokens.push({ t: 'close' })
      index += 1
      continue
    }
    if (char === ',' || char === ';') {
      tokens.push({ t: 'sep' })
      index += 1
      continue
    }
    if (char === '"' || char === "'") {
      const quote = char
      let tail = index + 1
      let text = ''
      while (tail < source.length && source[tail] !== quote) {
        text += source[tail]
        tail += 1
      }
      if (tail >= source.length) return 'кавычка не закрыта'
      tokens.push({ t: 'text', v: text })
      index = tail + 1
      continue
    }
    const operator = OPERATORS.find((entry) => source.startsWith(entry, index))
    if (operator) {
      tokens.push({ t: 'op', v: operator })
      index += operator.length
      continue
    }
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(source[index + 1] ?? ''))) {
      let tail = index
      let digits = ''
      while (tail < source.length && /[0-9.,]/.test(source[tail])) {
        digits += source[tail]
        tail += 1
      }
      while (tail < source.length && /[eE]/.test(source[tail])) {
        digits += source[tail]
        tail += 1
        if (/[+-]/.test(source[tail] ?? '')) {
          digits += source[tail]
          tail += 1
        }
        while (tail < source.length && /[0-9]/.test(source[tail])) {
          digits += source[tail]
          tail += 1
        }
      }
      const parsed = Number(digits.replace(/\s/g, '').replace(',', '.'))
      if (!Number.isFinite(parsed)) return `не удалось прочесть число «${digits}»`
      tokens.push({ t: 'num', v: parsed })
      index = tail
      continue
    }
    const ref = /^\$?[A-Za-z]{1,3}\$?\d{1,6}/.exec(source.slice(index))
    if (ref) {
      const start = parseAddress(ref[0])
      if (!start) return `ссылка «${ref[0]}» непонятна`
      const rest = source.slice(index + ref[0].length)
      const rangeTail = /^\s*:\s*\$?[A-Za-z]{1,3}\$?\d{1,6}/.exec(rest)
      if (rangeTail) {
        const end = parseAddress(rangeTail[0].replace(/:/g, ''))
        if (end) {
          tokens.push({ t: 'range', a: { c: start.column, r: start.row }, b: { c: end.column, r: end.row } })
          index += ref[0].length + rangeTail[0].length
          continue
        }
      }
      tokens.push({ t: 'ref', c: start.column, r: start.row })
      index += ref[0].length
      continue
    }
    const word = /^[A-Za-zА-Яа-яЁё]+/.exec(source.slice(index))
    if (word) {
      const after = source.slice(index + word[0].length).replace(/^\s+/, '')
      if (after.startsWith('(')) {
        tokens.push({ t: 'fn', v: word[0].toUpperCase() })
        index += word[0].length
        continue
      }
      if (word[0].toUpperCase() === 'ИСТИНА' || word[0].toUpperCase() === 'TRUE') {
        tokens.push({ t: 'text', v: 'истина' })
        index += word[0].length
        continue
      }
      if (word[0].toUpperCase() === 'ЛОЖЬ' || word[0].toUpperCase() === 'FALSE') {
        tokens.push({ t: 'text', v: 'ложь' })
        index += word[0].length
        continue
      }
      return `функция или имя «${word[0]}» не найдено`
    }
    return `не распознан символ «${char}»`
  }
  return tokens
}

type Node =
  | { k: 'value'; value: Value }
  | { k: 'ref'; c: number; r: number }
  | { k: 'range'; a: { c: number; r: number }; b: { c: number; r: number } }
  | { k: 'unary'; op: string; node: Node }
  | { k: 'binary'; op: string; left: Node; right: Node }
  | { k: 'call'; name: string; args: Node[] }

function parseTokens(tokens: Token[]): Node | string {
  let cursor = 0
  const peek = (): Token | undefined => tokens[cursor]
  const compare = (): Node | string => {
    let left = additive()
    if (typeof left === 'string') return left
    for (;;) {
      const token = peek()
      if (token && token.t === 'op' && ['=', '<', '>', '<=', '>=', '<>'].includes(token.v)) {
        cursor += 1
        const right = additive()
        if (typeof right === 'string') return right
        left = { k: 'binary', op: token.v, left, right }
        continue
      }
      return left
    }
  }
  const additive = (): Node | string => {
    let left = term()
    if (typeof left === 'string') return left
    for (;;) {
      const token = peek()
      if (token && token.t === 'op' && (token.v === '+' || token.v === '-' || token.v === '&')) {
        cursor += 1
        const right = term()
        if (typeof right === 'string') return right
        left = { k: 'binary', op: token.v, left, right }
        continue
      }
      return left
    }
  }
  const term = (): Node | string => {
    let left = power()
    if (typeof left === 'string') return left
    for (;;) {
      const token = peek()
      if (token && token.t === 'op' && (token.v === '*' || token.v === '/')) {
        cursor += 1
        const right = power()
        if (typeof right === 'string') return right
        left = { k: 'binary', op: token.v, left, right }
        continue
      }
      return left
    }
  }
  const power = (): Node | string => {
    let left = unary()
    if (typeof left === 'string') return left
    const token = peek()
    if (token && token.t === 'op' && token.v === '^') {
      cursor += 1
      const right = unary()
      if (typeof right === 'string') return right
      left = { k: 'binary', op: '^', left, right }
    }
    return left
  }
  const unary = (): Node | string => {
    const token = peek()
    if (token && token.t === 'op' && (token.v === '-' || token.v === '+')) {
      cursor += 1
      const node = unary()
      if (typeof node === 'string') return node
      return token.v === '-' ? { k: 'unary', op: '-', node } : node
    }
    return primary()
  }
  const primary = (): Node | string => {
    const token = peek()
    if (!token) return 'формула обрывается'
    if (token.t === 'num') {
      cursor += 1
      return { k: 'value', value: { kind: 'num', n: token.v } }
    }
    if (token.t === 'text') {
      cursor += 1
      return { k: 'value', value: { kind: 'text', s: token.v } }
    }
    if (token.t === 'range') {
      cursor += 1
      return { k: 'range', a: token.a, b: token.b }
    }
    if (token.t === 'ref') {
      cursor += 1
      return { k: 'ref', c: token.c, r: token.r }
    }
    if (token.t === 'open') {
      cursor += 1
      const inner = compare()
      if (typeof inner === 'string') return inner
      const close = peek()
      if (!close || close.t !== 'close') return 'не хватает закрывающей скобки'
      cursor += 1
      return inner
    }
    if (token.t === 'fn') {
      const name = token.v
      cursor += 1
      cursor += 1
      const args: Node[] = []
      if (peek()?.t === 'close') {
        cursor += 1
        return { k: 'call', name, args }
      }
      for (;;) {
        const arg = compare()
        if (typeof arg === 'string') return arg
        args.push(arg)
        const next = peek()
        if (next && next.t === 'sep') {
          cursor += 1
          continue
        }
        if (next && next.t === 'close') {
          cursor += 1
          return { k: 'call', name, args }
        }
        return 'не хватает закрывающей скобки'
      }
    }
    return 'формула обрывается'
  }
  const parsed = compare()
  if (typeof parsed === 'string') return parsed
  if (cursor < tokens.length) return 'в формуле лишний символ'
  return parsed
}

interface Range {
  c1: number
  c2: number
  r1: number
  r2: number
}

function rangeOf(a: { c: number; r: number }, b: { c: number; r: number }): Range {
  return {
    c1: Math.min(a.c, b.c),
    c2: Math.max(a.c, b.c),
    r1: Math.min(a.r, b.r),
    r2: Math.max(a.r, b.r)
  }
}

interface Context {
  model: SheetModel
  resolve: (index: number) => Value
}

function indexOfCell(model: SheetModel, column: number, row: number): number | null {
  if (column < 0 || row < 0 || column >= model.columns || row >= model.rows) return null
  return row * model.columns + column
}

function collect(node: Node, context: Context): { values: Value[] } | string {
  if (node.k !== 'range') {
    const value = evalNode(node, context)
    if (value.kind === 'err' && value.e === SHEET_ERRORS.ref) return 'диапазон не найден'
    return { values: [value] }
  }
  const box = rangeOf(node.a, node.b)
  const values: Value[] = []
  for (let row = box.r1; row <= box.r2; row += 1) {
    for (let column = box.c1; column <= box.c2; column += 1) {
      const index = indexOfCell(context.model, column, row)
      values.push(index === null ? error(SHEET_ERRORS.ref) : context.resolve(index))
    }
  }
  return { values }
}

type Arg = Value | Value[]

function flat(args: Arg[]): Value[] {
  const out: Value[] = []
  for (const arg of args) {
    if (Array.isArray(arg)) out.push(...arg)
    else out.push(arg)
  }
  return out
}

function single(args: Arg[]): Value {
  const list = flat(args)
  return list[0] ?? EMPTY
}

interface SheetFunction {
  range: boolean
  run: (args: Arg[]) => Value
}

function numericArgs(args: Arg[]): { list: number[] } | string {
  const list: number[] = []
  for (const value of flat(args)) {
    if (value.kind === 'err') return value.e
    if (value.kind === 'empty') continue
    if (value.kind === 'text' && asNumber(value) === null) return SHEET_ERRORS.value
    const n = asNumber(value)
    if (n !== null) list.push(n)
  }
  return { list }
}

export const SHEET_FUNCTIONS: Record<string, SheetFunction> = {
  SUM: { range: true, run: (args) => { const got = numericArgs(args); return typeof got === 'string' ? error(got) : { kind: 'num', n: got.list.reduce((a, b) => a + b, 0) } } },
  AVERAGE: { range: true, run: (args) => { const got = numericArgs(args); if (typeof got === 'string') return error(got); if (!got.list.length) return error(SHEET_ERRORS.div); return { kind: 'num', n: got.list.reduce((a, b) => a + b, 0) / got.list.length } } },
  MIN: { range: true, run: (args) => { const got = numericArgs(args); if (typeof got === 'string') return error(got); if (!got.list.length) return { kind: 'num', n: 0 }; return { kind: 'num', n: Math.min(...got.list) } } },
  MAX: { range: true, run: (args) => { const got = numericArgs(args); if (typeof got === 'string') return error(got); if (!got.list.length) return { kind: 'num', n: 0 }; return { kind: 'num', n: Math.max(...got.list) } } },
  COUNT: { range: true, run: (args) => { const got = numericArgs(args); return typeof got === 'string' ? error(got) : { kind: 'num', n: got.list.length } } },
  COUNTA: {
    range: true,
    run: (args) => ({ kind: 'num', n: flat(args).filter((value) => value.kind !== 'empty').length })
  },
  PRODUCT: { range: true, run: (args) => { const got = numericArgs(args); if (typeof got === 'string') return error(got); return { kind: 'num', n: got.list.reduce((a, b) => a * b, 1) } } },
  MEDIAN: {
    range: true,
    run: (args) => {
      const got = numericArgs(args)
      if (typeof got === 'string') return error(got)
      if (!got.list.length) return error(SHEET_ERRORS.div)
      const sorted = [...got.list].sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      return { kind: 'num', n: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2 }
    }
  },
  ROUND: {
    range: false,
    run: (args) => {
      const value = asNumber(single(args))
      const digits = asNumber(flat(args)[1] ?? EMPTY)
      if (value === null) return error(SHEET_ERRORS.value)
      const power = 10 ** Math.max(0, Math.round(digits ?? 0))
      return { kind: 'num', n: Math.round(value * power) / power }
    }
  },
  ABS: { range: false, run: (args) => { const v = asNumber(single(args)); return v === null ? error(SHEET_ERRORS.value) : { kind: 'num', n: Math.abs(v) } } },
  SQRT: { range: false, run: (args) => { const v = asNumber(single(args)); if (v === null) return error(SHEET_ERRORS.value); return v < 0 ? error(SHEET_ERRORS.div) : { kind: 'num', n: Math.sqrt(v) } } },
  POWER: {
    range: false,
    run: (args) => {
      const list = numericArgs(args)
      if (typeof list === 'string') return error(list)
      return { kind: 'num', n: list.list[0] ** (list.list[1] ?? 1) }
    }
  },
  INT: { range: false, run: (args) => { const v = asNumber(single(args)); return v === null ? error(SHEET_ERRORS.value) : { kind: 'num', n: Math.floor(v) } } },
  IF: {
    range: false,
    run: (args) => {
      const list = flat(args)
      const condition = list[0]
      if (condition?.kind === 'err') return condition
      return truthy(condition ?? EMPTY) ? list[1] ?? { kind: 'bool', b: true } : list[2] ?? { kind: 'bool', b: false }
    }
  },
  AND: { range: true, run: (args) => ({ kind: 'bool', b: flat(args).every((value) => value.kind !== 'empty' && truthy(value)) }) },
  OR: { range: true, run: (args) => ({ kind: 'bool', b: flat(args).some((value) => truthy(value)) }) },
  NOT: { range: false, run: (args) => ({ kind: 'bool', b: !truthy(single(args)) }) },
  CONCAT: {
    range: true,
    run: (args) => ({ kind: 'text', s: flat(args).map((value) => displayValue(value)).join('') })
  },
  LEN: { range: false, run: (args) => ({ kind: 'num', n: displayValue(single(args)).length }) }
}

const NAME_ALIASES: Record<string, string> = {
  СУММ: 'SUM',
  СРЗНАЧ: 'AVERAGE',
  МИН: 'MIN',
  МАКС: 'MAX',
  СЧЁТ: 'COUNT',
  СЧЕТ: 'COUNT',
  СЧЁТЗ: 'COUNTA',
  СЧЕТЗ: 'COUNTA',
  ПРОИЗВЕД: 'PRODUCT',
  МЕДИАНА: 'MEDIAN',
  ОКРУГЛ: 'ROUND',
  ABS: 'ABS',
  АБС: 'ABS',
  КОРНЬ: 'SQRT',
  STEПЕНЬ: 'POWER',
  СТЕПЕНЬ: 'POWER',
  ЦЕЛОЕ: 'INT',
  ЕСЛИ: 'IF',
  И: 'AND',
  ИЛИ: 'OR',
  НЕ: 'NOT',
  СЦЕП: 'CONCAT',
  СЦЕПИТЬ: 'CONCAT',
  ДЛСТР: 'LEN'
}

function functionOf(name: string): { key: string; fn: SheetFunction } | null {
  const upper = name.toUpperCase()
  const key = SHEET_FUNCTIONS[upper] ? upper : NAME_ALIASES[upper] ?? ''
  const fn = key ? SHEET_FUNCTIONS[key] : undefined
  return fn ? { key, fn } : null
}

export function displayValue(value: Value): string {
  if (value.kind === 'num') return formatNumber(value.n)
  if (value.kind === 'text') return value.s
  if (value.kind === 'bool') return value.b ? 'ИСТИНА' : 'ЛОЖЬ'
  if (value.kind === 'err') return value.e
  return ''
}

function evalNode(node: Node, context: Context): Value {
  if (node.k === 'value') return node.value
  if (node.k === 'ref') {
    const index = indexOfCell(context.model, node.c, node.r)
    if (index === null) return error(SHEET_ERRORS.ref)
    return context.resolve(index)
  }
  if (node.k === 'range') return error(SHEET_ERRORS.ref)
  if (node.k === 'unary') {
    const value = evalNode(node.node, context)
    if (value.kind === 'err') return value
    const n = asNumber(value)
    if (n === null) return error(SHEET_ERRORS.value)
    return { kind: 'num', n: -n }
  }
  if (node.k === 'binary') {
    const left = evalNode(node.left, context)
    if (left.kind === 'err') return left
    const right = evalNode(node.right, context)
    if (right.kind === 'err') return right
    if (node.op === '&') return { kind: 'text', s: displayValue(left) + displayValue(right) }
    if (['=', '<>', '<', '>', '<=', '>='].includes(node.op)) {
      const a = asNumber(left)
      const b = asNumber(right)
      const useText = a === null || b === null
      const first = useText ? displayValue(left).toLowerCase() : a
      const second = useText ? displayValue(right).toLowerCase() : b
      const same = first === second
      const less = useText ? String(first) < String(second) : Number(first) < Number(second)
      if (node.op === '=') return { kind: 'bool', b: same }
      if (node.op === '<>') return { kind: 'bool', b: !same }
      if (node.op === '<') return { kind: 'bool', b: less && !same }
      if (node.op === '>') return { kind: 'bool', b: !less && !same }
      if (node.op === '<=') return { kind: 'bool', b: less || same }
      return { kind: 'bool', b: !less }
    }
    const a = asNumber(left)
    const b = asNumber(right)
    if (a === null || b === null) return error(SHEET_ERRORS.value)
    if (node.op === '+') return { kind: 'num', n: a + b }
    if (node.op === '-') return { kind: 'num', n: a - b }
    if (node.op === '*') return { kind: 'num', n: a * b }
    if (node.op === '/') return b === 0 ? error(SHEET_ERRORS.div) : { kind: 'num', n: a / b }
    return { kind: 'num', n: a ** b }
  }
  const found = functionOf(node.name)
  if (!found) return error(SHEET_ERRORS.name)
  const args: Arg[] = []
  for (const arg of node.args) {
    if (found.fn.range && arg.k === 'range') {
      const got = collect(arg, context)
      if (typeof got === 'string') return error(SHEET_ERRORS.value)
      args.push(got.values)
      continue
    }
    if (arg.k === 'range') return error(SHEET_ERRORS.value)
    args.push(evalNode(arg, context))
  }
  return found.fn.run(args)
}

export function evaluateFormula(source: string, model: SheetModel, resolve: (index: number) => Value): Value {
  const tokens = tokenize(source)
  if (typeof tokens === 'string') return error(SHEET_ERRORS.value)
  const tree = parseTokens(tokens)
  if (typeof tree === 'string') return error(SHEET_ERRORS.value)
  return evalNode(tree, { model, resolve })
}

export function isFormula(raw: string): boolean {
  return /^\s*=[^=]/.test(raw ?? '')
}

export function evaluateSheet(model: SheetModel): SheetCell[] {
  const total = Math.max(0, model.columns * model.rows)
  const cache: (Value | undefined)[] = new Array(total)
  const visiting = new Set<number>()
  const resolve = (index: number): Value => {
    if (cache[index] !== undefined) return cache[index] as Value
    if (visiting.has(index)) return error(SHEET_ERRORS.cycle)
    const raw = model.cells[index] ?? ''
    if (!raw.trim()) return EMPTY
    if (!isFormula(raw)) return parseFormulaSource(raw)
    visiting.add(index)
    const value = evaluateFormula(raw.slice(1), model, resolve)
    visiting.delete(index)
    cache[index] = value
    return value
  }
  const out: SheetCell[] = []
  for (let index = 0; index < total; index += 1) {
    const raw = model.cells[index] ?? ''
    const formula = isFormula(raw)
    const value = resolve(index)
    const numeric = value.kind === 'num' || value.kind === 'bool'
    out.push({ text: displayValue(value), numeric, formula, error: value.kind === 'err' })
  }
  return out
}

export function columnLetters(count: number): string[] {
  return Array.from({ length: count }, (_, index) => columnName(index))
}
