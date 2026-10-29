import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, Crown, Eye, Check, LogOut, Save, UserRoundArrowLeft, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import type { LiveParticipant } from '@shared/live'
import { readableOn } from './session'

export interface LivePanelProps {
  role: 'host' | 'guest'
  code: string | null
  myName: string
  partner: LiveParticipant | null
  ping: number
  connected: boolean
  canEdit: boolean
  preparing: boolean
  watching: boolean
  following: boolean
  onTogglePermission: (canEdit: boolean) => void
  onWatchPartner: () => void
  onPullPartner: () => void
  onTransferHost: () => void
  onSaveBoard: () => void
  onLeave: () => void
  onToast: (text: string, kind?: 'info' | 'error' | 'success') => void
}

const IDLE_MS = 5000

function initial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '—'
}

export function LivePanel(props: LivePanelProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [anchor, setAnchor] = useState({ top: 0, right: 0 })
  const idleRef = useRef<number | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)

  const link = props.code ? `liro://connect/${props.code}` : ''

  useLayoutEffect(() => {
    if (!open) return undefined
    const place = (): void => {
      const node = toggleRef.current
      if (!node) return
      const box = node.getBoundingClientRect()
      setAnchor({ top: box.bottom + 8, right: Math.max(8, window.innerWidth - box.right) })
    }
    place()
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('resize', place)
    }
  }, [open])

  useEffect(() => {
    if (props.code) setOpen(true)
  }, [props.code])

  useEffect(() => {
    if (!open) return undefined
    idleRef.current = window.setTimeout(() => setOpen(false), IDLE_MS)
    return () => {
      if (idleRef.current !== null) window.clearTimeout(idleRef.current)
      idleRef.current = null
    }
  }, [open])

  const bump = useCallback((): void => {
    if (idleRef.current === null) return
    window.clearTimeout(idleRef.current)
    idleRef.current = window.setTimeout(() => setOpen(false), IDLE_MS)
  }, [])

  const copyLink = useCallback(async () => {
    if (!link) return
    try {
      await api.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      props.onToast('Ссылка скопирована', 'success')
    } catch {
      props.onToast('Не удалось скопировать ссылку', 'error')
    }
  }, [link, props])

  if (!props.code) return null

  const partner = props.partner
  const host = props.role === 'host'
  const editTag = props.canEdit ? 'редактирует' : 'просмотр'

  return (
    <div className="livepanel">
      <button
        ref={toggleRef}
        type="button"
        className="toolbtn livepanel__toggle"
        onClick={() => setOpen((value) => !value)}
        aria-label="Участники"
        title={props.watching ? 'Участники — за вами следят' : 'Участники'}
        data-active={open}
      >
        <Users size={17} />
        {props.watching ? (
          <Eye size={11} className="livepanel__eye" aria-hidden="true" />
        ) : (
          <span className="livepanel__dot" data-on={props.connected} />
        )}
      </button>
      {open ? (
        <div className="livepanel__box" style={{ top: anchor.top, right: anchor.right }} onPointerMove={bump} onPointerDown={bump}>
          <div className="livepanel__head">
            <span className="livepanel__title">Участники</span>
            <button type="button" className="livepanel__close" onClick={() => setOpen(false)} title="Закрыть">
              <X size={14} />
            </button>
          </div>
          <div className="livepanel__list">
            <div className="livepanel__person">
              <span className="livepanel__chip livepanel__chip--me">{initial(props.myName)}</span>
              <span className="livepanel__name">{props.myName}</span>
              <span className="livepanel__tags">
                <span className="livepanel__tag">{host ? 'ведущий' : 'гость'}</span>
                {!host ? <span className="livepanel__tag">{editTag}</span> : null}
              </span>
            </div>
            {partner ? (
              <div className="livepanel__person">
                <span className="livepanel__chip" style={{ background: partner.color, color: readableOn(partner.color) }}>
                  {initial(partner.name)}
                </span>
                <span className="livepanel__name">{partner.name}</span>
                {host ? (
                  <button
                    type="button"
                    className="livepanel__tag"
                    data-active={props.canEdit}
                    onClick={() => props.onTogglePermission(!props.canEdit)}
                    title={props.canEdit ? 'Разрешить только просмотр' : 'Разрешить редактирование'}
                  >
                    {editTag}
                  </button>
                ) : null}
                <div className="livepanel__acts">
                  <button
                    type="button"
                    className="livepanel__act"
                    data-active={props.following}
                    onClick={() => {
                      props.onWatchPartner()
                      props.onToast(props.following ? 'Слежение выключено' : 'Следим за участником', 'info')
                    }}
                    disabled={!props.connected}
                    title={props.following ? 'Не следить за участником' : 'Следить за участником'}
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    type="button"
                    className="livepanel__act"
                    onClick={props.onPullPartner}
                    disabled={!props.connected}
                    title="Перенести к себе"
                  >
                    <UserRoundArrowLeft size={13} />
                  </button>
                  {host ? (
                    <button type="button" className="livepanel__act" onClick={props.onTransferHost} title="Передать ведущего">
                      <Crown size={13} />
                    </button>
                  ) : null}
                  <span className="livepanel__ping">{props.connected ? `${props.ping} мс` : '—'}</span>
                </div>
              </div>
            ) : (
              <div className="livepanel__person livepanel__person--waiting">
                <span className="livepanel__chip livepanel__chip--ghost">·</span>
                <span className="livepanel__name">{props.preparing ? 'Готовим сессию…' : 'Ждём второго участника'}</span>
              </div>
            )}
          </div>
          <div className="livepanel__link">
            <span className="livepanel__label">Ссылка-приглашение</span>
            <div className="livepanel__linkrow">
              <code className="livepanel__code selectable">{link}</code>
              <button type="button" className="livepanel__copy" onClick={() => void copyLink()} title="Скопировать ссылку">
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </div>
          <div className="livepanel__actions">
            <button type="button" className="livepanel__action" onClick={props.onSaveBoard} disabled={!props.connected}>
              <Save size={14} />
              Сохранить себе
            </button>
            <button type="button" className="livepanel__action" onClick={props.onLeave}>
              <LogOut size={14} />
              Отключиться
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
