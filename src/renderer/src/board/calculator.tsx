import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Calculator, History, X } from 'lucide-react'
import { api } from '../lib/api'

const KEYS: Array<{ label: string; value: string; kind: 'digit' | 'action' | 'equal' | 'sign'; span?: number }> = [
  { label: 'C', value: 'clear', kind: 'sign' },
  { label: '±', value: 'sign', kind: 'sign' },
  { label: '%', value: 'percent', kind: 'sign' },
  { label: '÷', value: '/', kind: 'action' },
  { label: '7', value: '7', kind: 'digit' },
  { label: '8', value: '8', kind: 'digit' },
  { label: '9', value: '9', kind: 'digit' },
  { label: '×', value: '*', kind: 'action' },
  { label: '4', value: '4', kind: 'digit' },
  { label: '5', value: '5', kind: 'digit' },
  { label: '6', value: '6', kind: 'digit' },
  { label: '−', value: '-', kind: 'action' },
  { label: '1', value: '1', kind: 'digit' },
  { label: '2', value: '2', kind: 'digit' },
  { label: '3', value: '3', kind: 'digit' },
  { label: '+', value: '+', kind: 'action' },
  { label: '0', value: '0', kind: 'digit', span: 2 },
  { label: ',', value: '.', kind: 'digit' },
  { label: '(', value: '(', kind: 'action' },
  { label: ')', value: ')', kind: 'action', span: 2 },
  { label: '=', value: '=', kind: 'equal', span: 2 }
]

const HISTORY_LIMIT = 30

const DIVIDE_BY_ZERO = 'Деление на ноль'
const UNREADABLE = 'Непонятное выражение'
const TRAILING = 'Лишнее в конце выражения'

export interface CalcOutcome {
  text: string
  ok: boolean
}

function evaluate(source: string): CalcOutcome {
  let normalized = source
    .trim()
    .replace(/,/g, '.')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
  if (!normalized) return { text: '0', ok: true }
  while (/[-*/+(]$/.test(normalized)) normalized = normalized.slice(0, -1)
  if (!normalized) return { text: '0', ok: true }
  if (!/^[\d+\-*/(). ]+$/.test(normalized)) return { text: UNREADABLE, ok: false }
  const tokens = normalized.match(/\d+\.?\d*|[+\-*/()]/g)
  if (!tokens) return { text: UNREADABLE, ok: false }
  let pos = 0
  let malformed = false
  const peek = (): string | undefined => tokens[pos]
  const factor = (): number => {
    const token = tokens[pos++]
    if (token === undefined) return 0
    if (token === '(') {
      const value = expression()
      if (peek() === ')') pos += 1
      return value
    }
    if (token === '-') return -factor()
    if (token === '+') return factor()
    if (token === ')') {
      malformed = true
      pos -= 1
      return 0
    }
    if (!/^\d/.test(token)) {
      malformed = true
      return 0
    }
    return Number(token)
  }
  const term = (): number => {
    let value = factor()
    while (peek() === '*' || peek() === '/') {
      const op = tokens[pos++]
      const right = factor()
      if (op === '*') value = value * right
      else {
        if (right === 0 && !malformed) throw new Error(DIVIDE_BY_ZERO)
        value = value / right
      }
    }
    return value
  }
  const expression = (): number => {
    let value = term()
    while (peek() === '+' || peek() === '-') {
      const op = tokens[pos++]
      const right = term()
      value = op === '+' ? value + right : value - right
    }
    return value
  }
  try {
    const result = expression()
    if (malformed) return { text: UNREADABLE, ok: false }
    if (pos !== tokens.length) return { text: TRAILING, ok: false }
    if (!Number.isFinite(result)) return { text: DIVIDE_BY_ZERO, ok: false }
    return { text: String(Math.round(result * 1e10) / 1e10), ok: true }
  } catch (error) {
    if (error instanceof Error && error.message === DIVIDE_BY_ZERO) return { text: DIVIDE_BY_ZERO, ok: false }
    return { text: UNREADABLE, ok: false }
  }
}

export interface CalcView {
  source: string
  result: string
}

export function CalculatorPanel(props: {
  docId: string
  partner: CalcView | null
  onClose: () => void
  onChange: (view: CalcView) => void
}): ReactNode {
  const [source, setSource] = useState('')
  const [history, setHistory] = useState<Array<{ expression: string; result: string }>>([])
  const [showHistory, setShowHistory] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const latest = useRef({ source: '', history: [] as Array<{ expression: string; result: string }> })
  latest.current = { source, history }

  useEffect(() => {
    let alive = true
    void api.board.workspace
      .get(props.docId)
      .then((workspace) => {
        if (!alive) return
        setSource(workspace.calculator?.source ?? '')
        setHistory(workspace.calculator?.history ?? [])
        setLoaded(true)
      })
      .catch(() => {
        if (alive) setLoaded(true)
      })
    return () => {
      alive = false
    }
  }, [props.docId])

  useEffect(() => {
    if (!loaded) return
    const timer = window.setTimeout(() => {
      void api.board.workspace
        .set(props.docId, { calculator: { source, history } })
        .catch(() => undefined)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [loaded, props.docId, source, history])

  useEffect(
    () => () => {
      void api.board.workspace
        .set(props.docId, { calculator: latest.current })
        .catch(() => undefined)
    },
    [props.docId]
  )

  const outcome = useMemo(() => evaluate(source), [source])

  useEffect(() => {
    if (loaded) inputRef.current?.focus()
  }, [loaded])

  const onChangeRef = useRef(props.onChange)
  onChangeRef.current = props.onChange

  useEffect(() => {
    onChangeRef.current({ source, result: outcome.text })
  }, [source, outcome])

  const remember = useCallback((expression: string, value: string): void => {
    setHistory((current) => {
      const entry = { expression, result: value }
      const without = current.filter((item) => item.result !== value || item.expression !== expression)
      return [entry, ...without].slice(0, HISTORY_LIMIT)
    })
  }, [])

  const press = useCallback(
    (value: string): void => {
      setSource((current) => {
        if (value === 'clear') return ''
        if (value === 'sign') {
          if (!current || current === '0') return current
          return current.startsWith('-') ? current.slice(1) : `-${current}`
        }
        if (value === 'percent') {
          const number = Number(current.replace(/,/g, '.'))
          if (!Number.isFinite(number)) return current
          return String(Math.round(number * 100) / 100)
        }
        if (value === '=') {
          const computed = evaluate(current)
          if (!computed.ok) return current
          remember(current, computed.text)
          return computed.text
        }
        if (value === '.' && /\d,\d*$/.test(current)) return current
        if (/[+\-*/(]/.test(value) && /[+\-*/(]$/.test(current)) return current
        return `${current}${value}`
      })
    },
    [remember]
  )

  const clearHistory = useCallback((): void => {
    setHistory([])
  }, [])

  return (
    <div className="calculator">
      <div className="calculator__head">
        <span className="calculator__title">
          <Calculator size={15} /> Калькулятор
        </span>
        <div className="calculator__headtools">
          <button
            type="button"
            className="calculator__iconbtn"
            data-active={showHistory}
            onClick={() => setShowHistory((value) => !value)}
            title="История"
            aria-label="История"
          >
            <History size={14} />
          </button>
          <button
            type="button"
            className="livepanel__close"
            onClick={props.onClose}
            title="Закрыть"
            aria-label="Закрыть калькулятор"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {showHistory ? (
        <div className="calculator__history">
          {history.length ? (
            history.map((item) => (
              <button
                key={`${item.expression}=${item.result}`}
                type="button"
                className="calculator__historyitem"
                onClick={() => setSource(item.expression)}
                title={item.expression}
              >
                <span className="calculator__historyexpr">{item.expression}</span>
                <span className="calculator__historyvalue">{item.result}</span>
              </button>
            ))
          ) : (
            <div className="calculator__historyempty">История пуста</div>
          )}
          {history.length ? (
            <button type="button" className="calculator__historyclear" onClick={clearHistory}>
              Очистить историю
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="calculator__screen">
        <input
          ref={inputRef}
          className="calculator__input"
          value={source}
          onChange={(event) => setSource(event.target.value.replace(/[^0-9+\-*/().,\s]/g, ''))}
          onKeyDown={(event) => {
            if (event.key === 'Enter') press('=')
          }}
          spellCheck={false}
          aria-label="Выражение"
        />
        <div className="calculator__result" data-error={outcome.ok ? undefined : 'true'}>
          {outcome.text}
        </div>
      </div>
      {props.partner && (props.partner.source || props.partner.result !== '0') ? (
        <div className="calculator__partner">
          <span className="calculator__partnername">Участник</span>
          <span className="calculator__partnerexpr">{props.partner.source || '—'}</span>
          <span className="calculator__partnervalue">{props.partner.result}</span>
        </div>
      ) : null}
      <div className="calculator__keys">
        {KEYS.map((key) => (
          <button
            key={key.label}
            type="button"
            className="calculator__key"
            data-kind={key.kind}
            style={key.span ? { gridColumn: `span ${key.span}` } : undefined}
            onClick={() => press(key.value)}
          >
            {key.label}
          </button>
        ))}
      </div>
    </div>
  )
}
