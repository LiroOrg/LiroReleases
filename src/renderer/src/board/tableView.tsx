import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { TableItem } from '@shared/types'

export interface TableViewProps {
  item: TableItem
  selected: boolean
  editable: boolean
  onChange: (patch: Partial<TableItem>) => void
}

const MIN_CELL = 60

export function TableView(props: TableViewProps): ReactNode {
  const { item } = props
  const [active, setActive] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    if (active === null) return
    const node = inputRef.current
    if (!node) return
    node.focus()
    node.select()
  }, [active])

  const columns = Math.max(1, item.columns)
  const rows = Math.max(1, item.rows)
  const columnWidths = Array.from({ length: columns }, (_, index) => Math.max(MIN_CELL, item.columnWidths[index] ?? 180))
  const rowHeights = Array.from({ length: rows }, (_, index) => Math.max(28, item.rowHeights[index] ?? 44))
  const totalWidth = columnWidths.reduce((sum, value) => sum + value, 0)
  const totalHeight = rowHeights.reduce((sum, value) => sum + value, 0)

  const cellAt = (index: number): { x: number; y: number; width: number; height: number } => {
    const column = index % columns
    const row = Math.floor(index / columns)
    const x = columnWidths.slice(0, column).reduce((sum, value) => sum + value, 0)
    const y = rowHeights.slice(0, row).reduce((sum, value) => sum + value, 0)
    return { x, y, width: columnWidths[column], height: rowHeights[row] }
  }

  const startEdit = (index: number): void => {
    if (!props.editable) return
    setActive(index)
    setDraft(item.cells[index] ?? '')
  }

  const finishEdit = (): void => {
    if (active === null) return
    const cells = [...item.cells]
    cells[active] = draft
    while (cells.length < columns * rows) cells.push('')
    props.onChange({ cells, w: totalWidth, h: totalHeight })
    setActive(null)
  }

  const columnLeft: number[] = []
  const rowTop: number[] = []
  let cursor = 0
  for (const width of columnWidths) {
    columnLeft.push(cursor)
    cursor += width
  }
  cursor = 0
  for (const height of rowHeights) {
    rowTop.push(cursor)
    cursor += height
  }

  return (
    <div className="tableview" style={{ width: '100%', height: '100%' }}>
      <div className="tableview__grid" style={{ width: totalWidth, height: totalHeight }}>
        {rowTop.map((top, row) =>
          columnLeft.map((left, column) => {
            const index = row * columns + column
            const box = cellAt(index)
            const editing = active === index
            return (
              <div
                key={index}
                className="tableview__cell"
                data-active={editing ? 'true' : undefined}
                data-head={row === 0 ? 'true' : undefined}
                style={{
                  left,
                  top,
                  width: box.width,
                  height: box.height,
                  fontSize: item.fontSize,
                  background: row === 0 ? '#f4f4f5' : '#ffffff'
                }}
                onPointerDown={(event) => {
                  if (!props.editable) return
                  event.stopPropagation()
                  setActive(index)
                  setDraft(item.cells[index] ?? '')
                }}
              >
                {editing ? (
                  <textarea
                    ref={inputRef}
                    className="tableview__input"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={finishEdit}
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      event.stopPropagation()
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setActive(null)
                      }
                      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                        event.preventDefault()
                        finishEdit()
                      }
                    }}
                  />
                ) : (
                  <span className="tableview__text">{item.cells[index] ?? ''}</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
