import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TableItem } from '@shared/types'
import { cellAddress, columnName, evaluateSheet } from '@shared/sheet'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { letterKey } from '../lib/letterKey'

export interface TableViewProps {
  item: TableItem
  selected: boolean
  editable: boolean
  onChange: (patch: Partial<TableItem>, silent?: boolean) => void
}

const MIN_WIDTH = 56
const DEFAULT_WIDTH = 168
const DEFAULT_HEIGHT = 34

export function sheetFrame(fontSize: number): { pad: number; minRow: number; gutter: number; head: number } {
  const size = Math.max(11, Math.round(fontSize || 14))
  const pad = Math.max(5, Math.round(size * 0.42))
  return {
    pad,
    minRow: Math.round(size * 1.3) + pad * 2 + 2,
    gutter: Math.max(30, Math.round(size * 2.4)),
    head: Math.max(22, Math.round(size * 1.6))
  }
}

export function sheetSize(columns: number, rows: number, columnWidth: number, rowHeight: number, fontSize: number) {
  const { gutter, head, minRow } = sheetFrame(fontSize)
  const width = gutter + Math.max(MIN_WIDTH, columnWidth) * Math.max(1, columns) + 2
  const height = head + Math.max(minRow, rowHeight) * Math.max(1, rows) + 2
  return { width, height }
}

export function TableView(props: TableViewProps): ReactNode {
  const { item } = props
  const toast = useApp((state) => state.toast)
  const columns = Math.max(1, item.columns)
  const rows = Math.max(1, item.rows)
  const fontSize = Math.max(11, Math.round(item.fontSize || 14))
  const { pad, minRow, gutter, head } = sheetFrame(item.fontSize)
  const widths = Array.from({ length: columns }, (_, index) =>
    Math.max(MIN_WIDTH, Math.round(item.columnWidths[index] ?? DEFAULT_WIDTH))
  )
  const heights = Array.from({ length: rows }, (_, index) => Math.max(minRow, Math.round(item.rowHeights[index] ?? DEFAULT_HEIGHT)))
  const gridWidth = gutter + widths.reduce((sum, value) => sum + value, 0) + 2
  const gridHeight = head + heights.reduce((sum, value) => sum + value, 0) + 2

  const raw = useMemo(() => {
    const list = item.cells.slice(0, columns * rows)
    while (list.length < columns * rows) list.push('')
    return list
  }, [item.cells, columns, rows])
  const computed = useMemo(() => evaluateSheet({ columns, rows, cells: raw }), [columns, rows, raw])

  const [active, setActive] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<number | null>(null)
  const [edit, setEdit] = useState<{ index: number; value: string } | null>(null)
  const [preview, setPreview] = useState<{ kind: 'column' | 'row'; index: number; size: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const naturalRef = useRef({ width: gridWidth, height: gridHeight })

  const editing = edit !== null
  const columnOf = (index: number): number => index % columns
  const rowOf = (index: number): number => Math.floor(index / columns)
  const at = (column: number, row: number): number => row * columns + column

  useEffect(() => {
    if (active !== null && active >= columns * rows) {
      setActive(null)
      setAnchor(null)
    }
    if (edit !== null && edit.index >= columns * rows) setEdit(null)
  }, [active, edit, columns, rows])

  useEffect(() => {
    if (!editing) return
    const node = inputRef.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [editing])

  const widthsKey = widths.join(',')
  const heightsKey = heights.join(',')
  const [tick, setTick] = useState(0)
  const retriesRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    []
  )
  useEffect(() => {
    if (!props.editable) return
    const grid = gridRef.current
    if (!grid) return
    const values = Array.from(grid.querySelectorAll<HTMLElement>('.sheet__value'))
    if (values.length !== columns * rows) return
    const measured = heights.map((value, row) => {
      let needed = Math.max(minRow, value)
      for (let column = 0; column < columns; column += 1) {
        const node = values[row * columns + column]
        if (node) needed = Math.max(needed, node.offsetHeight + pad * 2 + 2)
      }
      return needed
    })
    const targetWidth = gridWidth
    const targetHeight = head + measured.reduce((sum, value) => sum + value, 0) + 2
    const previous = naturalRef.current
    naturalRef.current = { width: targetWidth, height: targetHeight }
    const gapWidth = Math.abs(item.w - targetWidth)
    const gapHeight = Math.abs(item.h - targetHeight)
    if (gapWidth <= 1 && gapHeight <= 1) {
      retriesRef.current = 0
      if (measured.some((value, row) => Math.abs(value - heights[row]) > 1))
        props.onChange({ columnWidths: widths, rowHeights: measured, w: targetWidth, h: targetHeight }, true)
      return
    }
    const schedule = (): void => {
      if (retriesRef.current >= 5) return
      retriesRef.current += 1
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => setTick((value) => value + 1), 180)
    }
    if (Math.abs(previous.width - targetWidth) > 1 || Math.abs(previous.height - targetHeight) > 1) {
      props.onChange({ columnWidths: widths, rowHeights: measured, w: targetWidth, h: targetHeight }, true)
      schedule()
      return
    }
    const scaleColumns = gapWidth > 1 ? Math.max(0.2, (item.w - gutter - 2) / (targetWidth - gutter - 2)) : 1
    const scaleRows = gapHeight > 1 ? Math.max(0.2, (item.h - head - 2) / (targetHeight - head - 2)) : 1
    props.onChange(
      {
        columnWidths: widths.map((value) => Math.max(MIN_WIDTH, Math.round(value * scaleColumns))),
        rowHeights: measured.map((value) => Math.max(minRow, Math.round(value * scaleRows))),
        w: item.w,
        h: item.h
      },
      true
    )
    schedule()
  }, [computed, item.w, item.h, columns, rows, pad, minRow, widthsKey, heightsKey, props.editable, tick])

  const select = (index: number, extend: boolean): void => {
    setActive(index)
    if (!extend) setAnchor(index)
  }

  const startEdit = (index: number, seed?: string): void => {
    select(index, false)
    setEdit({ index, value: seed ?? (raw[index] ?? '') })
  }

  const finishEdit = (move: 'none' | 'down' | 'right'): void => {
    if (edit === null) return
    setEdit(null)
    if (edit.index < raw.length && raw[edit.index] !== edit.value) {
      const cells = [...raw]
      cells[edit.index] = edit.value
      props.onChange({ cells })
    }
    if (move === 'none') return
    const target = move === 'down' ? edit.index + columns : edit.index + 1
    if (move === 'down' && target < columns * rows) select(target, false)
    else if (move === 'right' && columnOf(edit.index) + 1 < columns) select(target, false)
    else select(edit.index, false)
    rootRef.current?.focus()
  }

  const cancelEdit = (): void => {
    setEdit(null)
    rootRef.current?.focus()
  }

  const range = (() => {
    if (active === null) return null
    const other = anchor ?? active
    return {
      r1: Math.min(rowOf(other), rowOf(active)),
      r2: Math.max(rowOf(other), rowOf(active)),
      c1: Math.min(columnOf(other), columnOf(active)),
      c2: Math.max(columnOf(other), columnOf(active))
    }
  })()

  const startResize = (kind: 'column' | 'row', index: number, event: React.PointerEvent): void => {
    if (!props.editable) return
    event.preventDefault()
    event.stopPropagation()
    const grid = gridRef.current
    const scale = grid && gridWidth > 0 ? grid.getBoundingClientRect().width / gridWidth : 1
    const origin = kind === 'column' ? event.clientX : event.clientY
    const from = kind === 'column' ? widths[index] : heights[index]
    let size = from
    const onMove = (moveEvent: PointerEvent): void => {
      const point = kind === 'column' ? moveEvent.clientX : moveEvent.clientY
      const minimum = kind === 'column' ? MIN_WIDTH : minRow
      size = Math.max(minimum, Math.round(from + (point - origin) / (scale || 1)))
      setPreview({ kind, index, size })
    }
    const onUp = (): void => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setPreview(null)
      if (size === from) return
      if (kind === 'column') {
        const next = [...widths]
        next[index] = size
        props.onChange({ columnWidths: next })
      } else {
        const next = [...heights]
        next[index] = size
        props.onChange({ rowHeights: next })
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const copySelection = (): void => {
    if (!range) return
    const lines: string[] = []
    for (let row = range.r1; row <= range.r2; row += 1) {
      const parts: string[] = []
      for (let column = range.c1; column <= range.c2; column += 1) parts.push(raw[at(column, row)] ?? '')
      lines.push(parts.join('\t'))
    }
    void api.clipboard
      .writeText(lines.join('\n'))
      .then(() => toast('Ячейки скопированы', 'copy'))
      .catch((error: unknown) => toast(error instanceof Error ? error.message : String(error), 'error'))
  }

  const clearSelection = (): void => {
    if (!range) return
    const next = [...raw]
    for (let row = range.r1; row <= range.r2; row += 1)
      for (let column = range.c1; column <= range.c2; column += 1) next[at(column, row)] = ''
    props.onChange({ cells: next })
  }

  const pasteText = (text: string): void => {
    if (active === null) return
    const lines = text.replace(/\r/g, '').split('\n')
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
    if (!lines.length) return
    const block = lines.map((line) => line.split('\t'))
    const startRow = rowOf(active)
    const startColumn = columnOf(active)
    const widest = Math.max(...block.map((line) => line.length))
    const nextColumns = Math.max(columns, startColumn + widest)
    const nextRows = Math.max(rows, startRow + block.length)
    const next: string[] = new Array(nextColumns * nextRows).fill('')
    for (let row = 0; row < rows; row += 1)
      for (let column = 0; column < columns; column += 1) next[row * nextColumns + column] = raw[row * columns + column] ?? ''
    for (let row = 0; row < block.length; row += 1)
      for (let column = 0; column < block[row].length; column += 1)
        next[(startRow + row) * nextColumns + startColumn + column] = block[row][column]
    props.onChange({
      columns: nextColumns,
      rows: nextRows,
      columnWidths: Array.from({ length: nextColumns }, (_, index) => widths[index] ?? DEFAULT_WIDTH),
      rowHeights: Array.from({ length: nextRows }, (_, index) => heights[index] ?? minRow),
      cells: next
    })
    select(at(Math.min(nextColumns - 1, startColumn + widest - 1), Math.min(nextRows - 1, startRow + block.length - 1)), false)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!props.editable || active === null) return
    const target = event.target as HTMLElement
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
    const shift = event.shiftKey
    const control = event.ctrlKey || event.metaKey
    const handled = (): void => {
      event.preventDefault()
      event.stopPropagation()
    }
    const step = (dr: number, dc: number): void => {
      const row = Math.min(rows - 1, Math.max(0, rowOf(active) + dr))
      const column = Math.min(columns - 1, Math.max(0, columnOf(active) + dc))
      select(at(column, row), shift)
    }
    if (control && letterKey(event) === 'c') {
      handled()
      copySelection()
      return
    }
    if (control && letterKey(event) === 'x') {
      handled()
      copySelection()
      clearSelection()
      return
    }
    if (control && letterKey(event) === 'v') return
    if (event.key === 'ArrowDown') {
      handled()
      step(1, 0)
      return
    }
    if (event.key === 'ArrowUp') {
      handled()
      step(-1, 0)
      return
    }
    if (event.key === 'ArrowLeft' || (event.key === 'Tab' && shift)) {
      handled()
      step(0, -1)
      return
    }
    if (event.key === 'ArrowRight' || event.key === 'Tab') {
      handled()
      step(0, 1)
      return
    }
    if (event.key === 'Home') {
      handled()
      select(control ? 0 : at(0, rowOf(active)), shift)
      return
    }
    if (event.key === 'End') {
      handled()
      select(at(columns - 1, rowOf(active)), shift)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      handled()
      clearSelection()
      return
    }
    if (event.key === 'F2' || event.key === 'Enter') {
      handled()
      startEdit(active)
      return
    }
    if (!control && !event.altKey && event.key.length === 1 && event.key !== ' ') {
      handled()
      startEdit(active, event.key)
    }
  }

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>): void => {
    if (!props.editable || active === null || editing) return
    event.preventDefault()
    event.stopPropagation()
    const text = event.clipboardData.getData('text/plain')
    if (text) pasteText(text)
  }

  const barValue = edit !== null && edit.index === active ? edit.value : active === null ? '' : (raw[active] ?? '')

  const templateColumns = [
    `${gutter}px`,
    ...widths.map((value, index) => `${preview?.kind === 'column' && preview.index === index ? preview.size : value}px`)
  ].join(' ')
  const templateRows = [
    `${head}px`,
    ...heights.map((value, index) => `${preview?.kind === 'row' && preview.index === index ? preview.size : value}px`)
  ].join(' ')

  return (
    <div
      className="sheet"
      ref={rootRef}
      tabIndex={props.editable ? 0 : -1}
      style={{ fontSize }}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    >
      {props.selected && props.editable ? (
        <div className="sheet__bar">
          <div className="sheet__addr">{active === null ? '' : cellAddress(columnOf(active), rowOf(active))}</div>
          <span className="sheet__fx">fx</span>
          <input
            className="sheet__formula"
            value={barValue}
            placeholder="Текст или =СУММ(A1:A5)"
            onChange={(event) => {
              if (active === null) return
              setEdit({ index: active, value: event.target.value })
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                finishEdit('down')
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                cancelEdit()
              }
            }}
            onBlur={() => {
              if (edit !== null && edit.index === active) finishEdit('none')
            }}
          />
        </div>
      ) : null}
      <div
        className="sheet__grid"
        ref={gridRef}
        style={{ gridTemplateColumns: templateColumns, gridTemplateRows: templateRows }}
        onPointerDown={() => {
          if (props.editable) rootRef.current?.focus()
        }}
      >
        <div className="sheet__corner" style={{ height: head }} />
        {widths.map((value, index) => (
          <div
            key={`column-${index}`}
            className="sheet__colhead"
            data-active={range && index >= range.c1 && index <= range.c2 ? 'true' : undefined}
            data-edge-x={index === columns - 1 ? 'true' : undefined}
          >
            <span>{columnName(index)}</span>
            {props.editable ? (
              <span
                className="sheet__grip sheet__grip--col"
                onPointerDown={(event) => startResize('column', index, event)}
                title="Ширина столбца"
              />
            ) : null}
          </div>
        ))}
        {Array.from({ length: rows }, (_, row) =>
          Array.from({ length: columns + 1 }, (_, slot) => {
            if (slot === 0)
              return (
                <div
                  key={`row-${row}`}
                  className="sheet__rowhead"
                  data-active={range && row >= range.r1 && row <= range.r2 ? 'true' : undefined}
                  data-edge-y={row === rows - 1 ? 'true' : undefined}
                >
                  <span>{row + 1}</span>
                  {props.editable ? (
                    <span
                      className="sheet__grip sheet__grip--row"
                      onPointerDown={(event) => startResize('row', row, event)}
                      title="Высота строки"
                    />
                  ) : null}
                </div>
              )
            const column = slot - 1
            const index = at(column, row)
            const cell = computed[index]
            const isEditing = edit !== null && edit.index === index
            return (
              <div
                key={index}
                className="sheet__cell"
                data-i={index}
                data-num={cell?.numeric ? 'true' : undefined}
                data-err={cell?.error ? 'true' : undefined}
                data-formula={cell?.formula ? 'true' : undefined}
                data-edge-x={column === columns - 1 ? 'true' : undefined}
                data-edge-y={row === rows - 1 ? 'true' : undefined}
                data-active={active === index ? 'true' : undefined}
                data-range={
                  range && row >= range.r1 && row <= range.r2 && column >= range.c1 && column <= range.c2
                    ? 'true'
                    : undefined
                }
                style={{ padding: pad }}
                onPointerDown={(event) => {
                  if (!props.editable) return
                  select(index, event.shiftKey)
                }}
                onDoubleClick={() => {
                  if (props.editable) startEdit(index)
                }}
              >
                <span className="sheet__value">{isEditing ? edit.value : (cell?.text ?? '')}</span>
                {isEditing ? (
                  <textarea
                    ref={inputRef}
                    className="sheet__editor"
                    style={{ padding: pad }}
                    value={edit.value}
                    onChange={(event) => setEdit({ index, value: event.target.value })}
                    onPointerDown={(event) => event.stopPropagation()}
                    onBlur={() => finishEdit('none')}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelEdit()
                      }
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault()
                        finishEdit('down')
                      }
                      if (event.key === 'Tab') {
                        event.preventDefault()
                        finishEdit('right')
                      }
                    }}
                  />
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
