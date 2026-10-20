import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Copy, Link2, LogOut, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import type { LiveParticipant } from '@shared/live'
import { readableOn } from './session'

export interface LivePanelProps {
  role: 'host' | 'guest'
  code: string | null
  partner: LiveParticipant | null
  ping: number
  connected: boolean
  canEdit: boolean
  preparing: boolean
  onTogglePermission: (canEdit: boolean) => void
  onPullPartner: () => void
  onLeave: () => void
  onToast: (text: string, kind?: 'info' | 'error' | 'success') => void
}

export function LivePanel(props: LivePanelProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (props.code) setOpen(true)
  }, [props.code])

  const link = props.code ? `liro://connect/${props.code}` : ''

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

  return (
    <div className="livepanel">
      <button type="button" className="livepanel__toggle" onClick={() => setOpen((value) => !value)} title="Совместная работа">
        <Users size={16} />
        <span className="livepanel__dot" data-on={props.connected} />
      </button>
      {open ? (
        <div className="livepanel__box">
          <div className="livepanel__head">
            <span className="livepanel__title">Совместная работа</span>
            <button type="button" className="livepanel__close" onClick={() => setOpen(false)} title="Закрыть">
              <X size={14} />
            </button>
          </div>
          <div className="livepanel__row">
            <span className="livepanel__label">Код</span>
            <span className="livepanel__code">{props.code}</span>
          </div>
          <div className="livepanel__row livepanel__row--stack">
            <span className="livepanel__label">Ссылка</span>
            <span className="livepanel__link">{link}</span>
          </div>
          <div className="livepanel__row">
            <span className="livepanel__label" />
            <button type="button" className="livepanel__copy" onClick={() => void copyLink()}>
              {copied ? 'Скопировано' : 'Скопировать ссылку'}
              <Copy size={13} />
            </button>
          </div>
          <div className="livepanel__row">
            <span className="livepanel__label">Участник</span>
            {partner ? (
              <span className="livepanel__partner">
                <span className="livepanel__chip" style={{ background: partner.color, color: readableOn(partner.color) }}>
                  {partner.name.slice(0, 1).toUpperCase()}
                </span>
                {partner.name}
              </span>
            ) : (
              <span className="livepanel__muted">{props.preparing ? 'Готовим сессию…' : 'Ожидание'}</span>
            )}
          </div>
          <div className="livepanel__row">
            <span className="livepanel__label">Пинг</span>
            <span className="livepanel__value">{props.connected ? `${props.ping} мс` : '—'}</span>
          </div>
          {props.role === 'host' ? (
            <div className="livepanel__row">
              <span className="livepanel__label">Права гостя</span>
              <button
                type="button"
                className="livepanel__toggleperm"
                data-active={props.canEdit}
                onClick={() => props.onTogglePermission(!props.canEdit)}
                disabled={!partner}
              >
                {props.canEdit ? 'Может редактировать' : 'Только просмотр'}
              </button>
            </div>
          ) : (
            <div className="livepanel__row">
              <span className="livepanel__label">Ваши права</span>
              <span className="livepanel__value">{props.canEdit ? 'Редактирование' : 'Просмотр'}</span>
            </div>
          )}
          <div className="livepanel__actions">
            {props.role === 'host' ? (
              <button type="button" className="livepanel__action" onClick={props.onPullPartner} disabled={!partner}>
                <Link2 size={14} />
                Перенести к себе
              </button>
            ) : null}
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
