import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Crown, Eye, Check, Copy, LogOut, LocateFixed, Save, UserRoundArrowLeft, Users, X } from 'lucide-react'
import { api } from '../lib/api'
import type { ToastKind } from '../lib/store'
import type { LiveParticipant } from '@shared/live'
import { readableOn } from './session'
import { ContextMenu } from '../components/menu'
import type { MenuItem } from '../components/menu'
import { anyMenuOpen, watchMenus } from '../components/menu'

export interface LivePanelProps {
  role: 'host' | 'guest'
  code: string | null
  myName: string
  partner: LiveParticipant | null
  partnerAway: boolean
  ping: number
  connected: boolean
  canEdit: boolean
  preparing: boolean
  watching: boolean
  following: boolean
  topMenuOpen: boolean
  onTogglePermission: (canEdit: boolean) => void
  onWatchPartner: () => void
  onPullPartner: () => void
  onGoToPartner: () => void
  onTransferHost: () => void
  onSaveBoard: () => void
  onLeave: () => void
  onToast: (text: string, kind?: ToastKind) => void
}

const IDLE_MS = 6000

function initial(name: string): string {
  const trimmed = name.trim()
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : '—'
}

function LiveWatcher(props: { on: boolean; hidden: boolean }): ReactNode {
  const [anchor, setAnchor] = useState({ top: 0, left: 0 })
  const [menusBusy, setMenusBusy] = useState(false)

  useLayoutEffect(() => {
    const sync = (): void => {
      const toggle = document.querySelector('.livepanel__toggle')
      if (!toggle) return
      const box = toggle.getBoundingClientRect()
      setAnchor({ top: box.bottom + 5, left: box.left + box.width / 2 })
    }
    sync()
    window.addEventListener('resize', sync)
    window.addEventListener('scroll', sync, true)
    return () => {
      window.removeEventListener('resize', sync)
      window.removeEventListener('scroll', sync, true)
    }
  }, [props.on])

  useEffect(() => {
    const watch = (): void => setMenusBusy(anyMenuOpen())
    watch()
    return watchMenus(watch)
  }, [])

  if (!props.on || props.hidden || menusBusy) return null

  return createPortal(
    <span className="livewatcher" style={{ top: anchor.top, left: anchor.left }}>
      <Eye size={10} />
      следят
    </span>,
    document.body
  )
}

export function LivePanel(props: LivePanelProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const [anchor, setAnchor] = useState({ top: 0, right: 0 })
  const idleRef = useRef<number | null>(null)
  const toggleRef = useRef<HTMLButtonElement | null>(null)
  const moreRef = useRef<HTMLButtonElement | null>(null)

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
  }, [open, menu])

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
      props.onToast('Ссылка скопирована', 'copy')
    } catch {
      props.onToast('Не удалось скопировать ссылку', 'error')
    }
  }, [link, props])

  const openMenu = (event: ReactMouseEvent<Element>): void => {
    event.preventDefault()
    event.stopPropagation()
    const box = (moreRef.current ?? (event.currentTarget as HTMLElement)).getBoundingClientRect()
    setMenu({ x: box.right - 188, y: box.bottom + 6 })
    bump()
  }

  const partnerItems = (): MenuItem[] => {
    const items: MenuItem[] = [
      {
        id: 'goto',
        label: 'Перейти к участнику',
        icon: <LocateFixed size={14} />,
        section: 'Обзор',
        disabled: !props.connected,
        run: () => {
          props.onGoToPartner()
          props.onToast(`Перешли к ${props.partner?.name ?? 'участнику'}`, 'locate')
        }
      },
      {
        id: 'follow',
        label: props.following ? 'Не следить за участником' : 'Следить за участником',
        icon: <Eye size={14} />,
        active: props.following,
        disabled: !props.connected,
        run: () => {
          props.onWatchPartner()
          props.onToast(props.following ? 'Слежение выключено' : 'Следим за участником', 'follow')
        }
      },
      {
        id: 'pull',
        label: 'Перенести к себе',
        icon: <UserRoundArrowLeft size={14} />,
        disabled: !props.connected,
        run: () => props.onPullPartner()
      }
    ]
    if (props.role === 'host') {
      items.push({
        id: 'mode',
        label: props.canEdit ? 'Разрешить только просмотр' : 'Разрешить редактирование',
        icon: props.canEdit ? <Eye size={14} /> : <Check size={14} />,
        section: 'Права',
        run: () => props.onTogglePermission(!props.canEdit)
      })
      items.push({ id: 'handover', label: 'Передать ведущего', icon: <Crown size={14} />, run: () => props.onTransferHost() })
    }
    return items
  }

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
        <span className="livepanel__dot" data-on={props.connected} />
      </button>
      <LiveWatcher on={props.watching} hidden={open || menu !== null || props.topMenuOpen} />
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
              <span className="livepanel__name livepanel__name--me">{props.myName}</span>
              <span className="livepanel__tags">
                <span className="livepanel__tag">{host ? 'ведущий' : 'гость'}</span>
                {!host ? <span className="livepanel__tag">{editTag}</span> : null}
                {props.watching ? <span className="livepanel__tag livepanel__tag--on">за вами следят</span> : null}
              </span>
            </div>
            {partner ? (
              <div className="livepanel__person">
                <span className="livepanel__chip" style={{ background: partner.color, color: readableOn(partner.color) }}>
                  {initial(partner.name)}
                </span>
                <span className="livepanel__who">
                  <button
                    type="button"
                    className="livepanel__name livepanel__name--link"
                    disabled={!props.connected}
                    onClick={() => {
                      props.onGoToPartner()
                      props.onToast(`Перешли к ${partner.name}`, 'locate')
                    }}
                    onContextMenu={openMenu}
                    title={`Перейти к ${partner.name}`}
                  >
                    {partner.name}
                  </button>
                  <span className="livepanel__note">
                    {props.partnerAway ? 'окно свёрнуто' : props.connected ? `${props.ping} мс` : 'нет связи'}
                  </span>
                </span>
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
                <button
                  ref={moreRef}
                  type="button"
                  className="livepanel__more"
                  aria-label="Действия с участником"
                  title="Действия с участником"
                  data-open={menu ? 'true' : undefined}
                  onClick={openMenu}
                  onContextMenu={openMenu}
                >
                  ···
                </button>
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
      {menu && partner ? (
        <ContextMenu
          title={partner.name}
          items={partnerItems()}
          x={menu.x}
          y={menu.y}
          onClose={() => {
            setMenu(null)
            bump()
          }}
        />
      ) : null}
    </div>
  )
}
