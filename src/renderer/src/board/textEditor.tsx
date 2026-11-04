import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { plainFromRichHtml } from './richHtml'
import { letterKey } from '../lib/letterKey'

export interface TextFormatState {
  b: boolean
  i: boolean
  u: boolean
  s: boolean
  list: boolean
  ordered: boolean
}

export const emptyFormat: TextFormatState = { b: false, i: false, u: false, s: false, list: false, ordered: false }

const FORMAT_COMMANDS: Record<'bold' | 'italic' | 'underline' | 'strike' | 'list' | 'ordered', string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikeThrough',
  list: 'insertUnorderedList',
  ordered: 'insertOrderedList'
}

function stateOf(): TextFormatState {
  const query = (command: string): boolean => {
    try {
      return document.queryCommandState(command)
    } catch {
      return false
    }
  }
  return {
    b: query('bold'),
    i: query('italic'),
    u: query('underline'),
    s: query('strikeThrough'),
    list: query('insertUnorderedList'),
    ordered: query('insertOrderedList')
  }
}

function useStyleTags(): void {
  try {
    document.execCommand('styleWithCSS', false, 'false')
  } catch {}
}

export function applyFormat(command: 'bold' | 'italic' | 'underline' | 'strike' | 'list' | 'ordered'): void {
  useStyleTags()
  document.execCommand(FORMAT_COMMANDS[command], false)
}

export function currentFormat(): TextFormatState {
  return stateOf()
}

export function activeEditorNode(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.texteditor[contenteditable="true"]')
}

export function applyTextColor(color: string): void {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed) return
  try {
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('foreColor', false, color)
  } catch {}
  document.execCommand('styleWithCSS', false, 'false')
}

export function TextEditor(props: {
  itemId: string
  html: string
  placeholder: string
  selectAll: boolean
  autoWidth: boolean
  box: { x: number; y: number }
  minWidth: number
  style: CSSProperties
  onInput: (html: string, plain: string) => void
  onFormat: (state: TextFormatState) => void
  onCommit: () => void
  onMeasure: (width: number, height: number) => void
}): ReactNode {
  const ref = useRef<HTMLDivElement | null>(null)
  const callbacksRef = useRef(props)
  callbacksRef.current = props

  const report = (): void => {
    const node = ref.current
    if (!node) return
    node.dataset.empty = node.textContent?.trim() ? 'false' : 'true'
    callbacksRef.current.onInput(node.innerHTML, plainFromRichHtml(node.innerHTML))
    callbacksRef.current.onMeasure(node.offsetWidth, node.offsetHeight)
  }

  useEffect(() => {
    const node = ref.current
    if (!node) return
    node.innerHTML = props.html
    node.dataset.empty = node.textContent?.trim() ? 'false' : 'true'
    node.focus()
    const selection = window.getSelection()
    if (selection) {
      const range = document.createRange()
      range.selectNodeContents(node)
      if (!props.selectAll) range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    callbacksRef.current.onFormat(stateOf())
    callbacksRef.current.onMeasure(node.offsetWidth, node.offsetHeight)
  }, [props.itemId])

  useEffect(() => {
    const onSelectionChange = (): void => {
      const node = ref.current
      const anchor = window.getSelection()?.anchorNode ?? null
      if (!node || !anchor || !node.contains(anchor)) return
      callbacksRef.current.onFormat(stateOf())
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [])

  return (
    <div
      ref={ref}
      className="texteditor"
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      aria-label={props.placeholder || 'Текст'}
      data-placeholder={props.placeholder || undefined}
      data-auto={props.autoWidth ? 'true' : undefined}
      style={{
        left: props.box.x,
        top: props.box.y,
        minWidth: props.autoWidth ? props.minWidth : undefined,
        maxWidth: props.autoWidth ? 900 : undefined,
        ...props.style
      }}
      onInput={report}
      onBlur={() => callbacksRef.current.onCommit()}
      onKeyUp={() => callbacksRef.current.onFormat(stateOf())}
      onMouseUp={() => callbacksRef.current.onFormat(stateOf())}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          callbacksRef.current.onCommit()
          return
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault()
          callbacksRef.current.onCommit()
          return
        }
        if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
          const key = letterKey(event)
          const format = key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : ''
          if (format) {
            event.preventDefault()
            applyFormat(format)
            report()
            return
          }
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          useStyleTags()
          document.execCommand('insertText', false, '    ')
          report()
        }
      }}
    />
  )
}
