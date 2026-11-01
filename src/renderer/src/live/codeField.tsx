import { Fragment, useRef } from 'react'
import type { ClipboardEvent as ReactClipboardEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { codeFromInput } from './code'

const PLACEHOLDERS = ['abc', 'def', 'ghi']

export function CodeField(props: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  autoFocus?: boolean
}): ReactNode {
  const refs = useRef<Array<HTMLInputElement | null>>([])
  const digits = props.value.replace(/-/g, '')
  const parts = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 9)]

  const focusPart = (index: number): void => {
    const node = refs.current[Math.max(0, Math.min(2, index))]
    node?.focus()
    node?.select()
  }

  const write = (index: number, raw: string): void => {
    const typed = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
    const next = (digits.slice(0, index * 3) + typed).slice(0, 9)
    props.onChange(next)
    if (typed && index < 2 && next.length === (index + 1) * 3) focusPart(index + 1)
  }

  const paste = (index: number, event: ReactClipboardEvent<HTMLInputElement>): void => {
    event.preventDefault()
    const parsed = codeFromInput(event.clipboardData.getData('text')).replace(/-/g, '')
    if (parsed.length === 9) {
      props.onChange(parsed)
      focusPart(2)
      return
    }
    write(index, parsed)
  }

  const erase = (index: number, event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Backspace' || parts[index] || index === 0) return
    event.preventDefault()
    props.onChange(digits.slice(0, index * 3 - 1))
    focusPart(index - 1)
  }

  return (
    <div className="codefield">
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <span className="codefield__sep" /> : null}
          <input
            ref={(node) => {
              refs.current[index] = node
            }}
            className="codefield__part"
            value={part}
            autoFocus={index === 0 && props.autoFocus !== false}
            placeholder={PLACEHOLDERS[index]}
            aria-label={`Группа ${index + 1} из 3`}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            maxLength={3}
            onChange={(event) => write(index, event.target.value)}
            onPaste={(event) => paste(index, event)}
            onKeyDown={(event) => {
              event.stopPropagation()
              erase(index, event)
              if (event.key === 'Enter') props.onSubmit()
            }}
          />
        </Fragment>
      ))}
    </div>
  )
}
