import type { ReactNode } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  BellRing,
  Box,
  Camera,
  CheckCheck,
  ClipboardPaste,
  ClipboardX,
  CircleArrowUp,
  CircleCheck,
  Copy,
  Crown,
  DownloadCloud,
  Eye,
  FileText,
  FolderClosed,
  ImageDown,
  Info,
  Layers,
  Link2,
  LocateFixed,
  Lock,
  LockKeyholeOpen,
  MousePointerClick,
  PackageCheck,
  PanelsTopLeft,
  PencilLine,
  PencilOff,
  Redo2,
  RefreshCw,
  Ruler,
  Save,
  Scan,
  Shapes,
  Share2,
  TextCursorInput,
  Trash2,
  Undo2,
  UserRoundX,
  Users,
  X,
  ZoomIn
} from 'lucide-react'
import { useApp } from '../lib/store'
import type { ToastKind } from '../lib/store'
import { createPortal } from 'react-dom'

const TOAST_ICONS: Record<ToastKind, ReactNode> = {
  success: <CircleCheck size={13} strokeWidth={2.2} />,
  error: <AlertTriangle size={13} strokeWidth={2.2} />,
  info: <Info size={13} strokeWidth={2.2} />,
  check: <CheckCheck size={13} strokeWidth={2.2} />,
  paste: <ClipboardPaste size={13} />,
  clipboard: <ClipboardX size={13} />,
  copy: <Copy size={13} />,
  save: <Save size={13} />,
  export: <DownloadCloud size={13} />,
  image: <ImageDown size={13} />,
  file: <FileText size={13} />,
  preview: <Scan size={13} />,
  board: <PanelsTopLeft size={13} />,
  folder: <FolderClosed size={13} />,
  archive: <Archive size={13} />,
  delete: <Trash2 size={13} />,
  undo: <Undo2 size={13} />,
  redo: <Redo2 size={13} />,
  lock: <Lock size={13} />,
  unlock: <LockKeyholeOpen size={13} />,
  align: <Ruler size={13} />,
  layer: <Layers size={13} />,
  graph: <Share2 size={13} />,
  solid: <Box size={13} />,
  text: <TextCursorInput size={13} />,
  link: <Link2 size={13} />,
  zoom: <ZoomIn size={13} />,
  shape: <Shapes size={13} />,
  select: <MousePointerClick size={13} />,
  update: <BellRing size={13} />,
  'update-check': <RefreshCw size={13} />,
  'update-ready': <PackageCheck size={13} />,
  'update-applied': <CircleArrowUp size={13} />,
  live: <Users size={13} />,
  'live-out': <UserRoundX size={13} />,
  lead: <Crown size={13} />,
  follow: <Eye size={13} />,
  locate: <LocateFixed size={13} />,
  editable: <PencilLine size={13} />,
  readonly: <PencilOff size={13} />,
  capture: <Camera size={13} />
}

export function Toasts(): ReactNode {
  const toasts = useApp((state) => state.toasts)
  const dismiss = useApp((state) => state.dismiss)
  const visible = [...toasts.filter((toast) => toast.sticky), ...toasts.filter((toast) => !toast.sticky).slice(-2)]
  return (
    <div className="toasts" role="status" aria-live="polite">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          role={toast.kind === 'error' ? 'alert' : undefined}
          data-kind={toast.kind}
          data-sticky={toast.sticky ? 'true' : undefined}
          data-progress={typeof toast.progress === 'number' ? 'true' : undefined}
          onClick={() => {
            if (!toast.actions) dismiss(toast.id)
          }}
        >
          <span className="toast__icon">{TOAST_ICONS[toast.kind] ?? TOAST_ICONS.info}</span>
          <span className="toast__text">{toast.text}</span>
          {toast.actions?.length ? (
            <span className="toast__actions">
              {toast.actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className="toast__btn"
                  data-primary={action.primary ? 'true' : undefined}
                  onClick={(event) => {
                    event.stopPropagation()
                    action.run()
                    dismiss(toast.id)
                  }}
                >
                  {action.label}
                </button>
              ))}
            </span>
          ) : null}
          {typeof toast.progress === 'number' ? (
            <span className="toast__bar">
              <i style={{ width: `${Math.max(2, Math.min(100, toast.progress))}%` }} />
            </span>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function Modal(props: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}): ReactNode {
  const titleId = useId()
  const boxRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(props.onClose)

  useEffect(() => {
    closeRef.current = props.onClose
  })

  useEffect(() => {
    if (!props.open) return
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusables = (): HTMLElement[] =>
      boxRef.current
        ? Array.from(
            boxRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
            )
          ).filter((node) => node.offsetParent !== null)
        : []
    const frame = requestAnimationFrame(() => (focusables()[0] ?? boxRef.current)?.focus())
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        closeRef.current()
        return
      }
      if (event.key === 'Enter') {
        const target = event.target as HTMLElement | null
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'SELECT')) return
        const confirm =
          boxRef.current?.querySelector<HTMLButtonElement>('.modal__foot .btn--primary:not([disabled])') ??
          boxRef.current?.querySelector<HTMLButtonElement>('.btn--primary:not([disabled])')
        if (!confirm) return
        event.preventDefault()
        confirm.click()
        return
      }
      if (event.key !== 'Tab') return
      const list = focusables()
      if (!list.length) return
      const first = list[0]
      const last = list[list.length - 1]
      const active = document.activeElement
      if (event.shiftKey && (active === first || active === boxRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', listener)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('keydown', listener)
      previous?.focus()
    }
  }, [props.open])

  if (!props.open) return null
  return createPortal(
    <div className="modal__backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div
        className={props.wide ? 'modal modal--wide' : 'modal'}
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal__head">
          <h2 className="modal__title" id={titleId}>
            {props.title}
          </h2>
        </div>
        <div className="modal__body">{props.children}</div>
        {props.footer ? <div className="modal__foot">{props.footer}</div> : null}
      </div>
    </div>,
    document.body
  )
}

interface PromptState {
  title: string
  value: string
  placeholder: string
  resolve: (value: string | null) => void
}

function PromptForm(props: { state: PromptState; finish: (value: string | null) => void }): ReactNode {
  const [value, setValue] = useState(props.state.value)
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <Modal
      open
      title={props.state.title}
      onClose={() => props.finish(null)}
      footer={
        <>
          <button type="button" className="btn" onClick={() => props.finish(null)}>
            Отмена
          </button>
          <button type="button" className="btn btn--primary" onClick={() => props.finish(value.trim())}>
            Готово
          </button>
        </>
      }
    >
      <input
        ref={ref}
        className="input"
        value={value}
        placeholder={props.state.placeholder}
        onChange={(event) => setValue(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Enter') props.finish(value.trim())
          if (event.key === 'Escape') props.finish(null)
        }}
      />
    </Modal>
  )
}

export interface PromptApi {
  ask: (title: string, value?: string, placeholder?: string) => Promise<string | null>
  element: ReactNode
}

export function usePrompt(): PromptApi {
  const [state, setState] = useState<PromptState | null>(null)
  const ask = useCallback(
    (title: string, value = '', placeholder = ''): Promise<string | null> =>
      new Promise<string | null>((resolve) => {
        setState({ title, value, placeholder, resolve })
      }),
    []
  )
  const finish = useCallback((result: string | null): void => {
    setState((current) => {
      current?.resolve(result)
      return null
    })
  }, [])
  return { ask, element: state ? <PromptForm state={state} finish={finish} /> : null }
}

export function Switch(props: { value: boolean; onChange: (value: boolean) => void; label?: string }): ReactNode {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={props.value}
      data-on={props.value}
      aria-label={props.label ?? 'переключатель'}
      onClick={() => props.onChange(!props.value)}
    >
      <span className="switch__knob" />
    </button>
  )
}

export function Empty(props: { title: string; text?: string; action?: ReactNode }): ReactNode {
  return (
    <div className="empty">
      <div className="empty__title">{props.title}</div>
      {props.text ? <div style={{ maxWidth: '52ch' }}>{props.text}</div> : null}
      {props.action}
    </div>
  )
}

export function Spinner(): ReactNode {
  return <span className="spinner" />
}

export function CloseButton(props: { onClick: () => void }): ReactNode {
  return (
    <button type="button" className="btn btn--ghost btn--icon btn--sm" onClick={props.onClick} aria-label="Закрыть">
      <X size={15} />
    </button>
  )
}