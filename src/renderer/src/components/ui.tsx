import type { ReactNode } from 'react'
import { useEffect } from 'react'
import {
  AlertTriangle,
  Box,
  Check,
  CheckCheck,
  ClipboardPaste,
  Copy,
  Download,
  Eye,
  FileText,
  Folder,
  ImagePlus,
  Info,
  Layers,
  LineChart,
  Link2,
  Lock,
  Maximize,
  LockOpen,
  MousePointer2,
  PenLine,
  Redo2,
  RefreshCw,
  Ruler,
  Save,
  Square,
  Trash2,
  Type,
  Undo2,
  X
} from 'lucide-react'
import { useApp } from '../lib/store'
import type { ToastKind } from '../lib/store'

const TOAST_ICONS: Record<ToastKind, ReactNode> = {
  success: <Check size={13} strokeWidth={2.4} />,
  error: <AlertTriangle size={13} strokeWidth={2.2} />,
  info: <Info size={13} strokeWidth={2.2} />,
  paste: <ClipboardPaste size={13} />,
  image: <ImagePlus size={13} />,
  board: <Square size={13} />,
  folder: <Folder size={13} />,
  copy: <Copy size={13} />,
  delete: <Trash2 size={13} />,
  undo: <Undo2 size={13} />,
  redo: <Redo2 size={13} />,
  lock: <Lock size={13} />,
  unlock: <LockOpen size={13} />,
  align: <Ruler size={13} />,
  layer: <Layers size={13} />,
  export: <Download size={13} />,
  save: <Save size={13} />,
  graph: <LineChart size={13} />,
  solid: <Box size={13} />,
  text: <Type size={13} />,
  draw: <PenLine size={13} />,
  link: <Link2 size={13} />,
  zoom: <Maximize size={13} />,
  preview: <Eye size={13} />,
  shape: <Square size={13} />,
  check: <CheckCheck size={13} />,
  file: <FileText size={13} />,
  select: <MousePointer2 size={13} />,
  update: <RefreshCw size={13} />
}

export function Toasts(): ReactNode {
  const toasts = useApp((state) => state.toasts)
  const dismiss = useApp((state) => state.dismiss)
  const visible = toasts.slice(-2)
  return (
    <div className="toasts">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className="toast"
          data-kind={toast.kind}
          data-sticky={toast.sticky ? 'true' : undefined}
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
  useEffect(() => {
    if (!props.open) return
    const listener = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [props.open, props.onClose])

  if (!props.open) return null
  return (
    <div className="modal__backdrop" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <div className={props.wide ? 'modal modal--wide' : 'modal'} role="dialog" aria-modal="true">
        <div className="modal__head">
          <h2 className="modal__title">{props.title}</h2>
        </div>
        <div className="modal__body">{props.children}</div>
        {props.footer ? <div className="modal__foot">{props.footer}</div> : null}
      </div>
    </div>
  )
}

export function Switch(props: { value: boolean; onChange: (value: boolean) => void; label?: string }): ReactNode {
  return (
    <button
      type="button"
      className="switch"
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