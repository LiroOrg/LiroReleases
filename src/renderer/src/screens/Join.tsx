import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Loader2, Users } from 'lucide-react'
import { useApp } from '../lib/store'
import { api } from '../lib/api'
import { navigate } from '../router'
import { setPendingJoin } from '../live/pending'
import { setGuestBoardId } from '../live/guestBoard'

const WAIT_ROOMS_MS = 30000

export function JoinScreen(props: { code: string }): ReactNode {
  const toast = useApp((state) => state.toast)
  const [code, setCode] = useState(props.code)
  const [state, setState] = useState<'wait' | 'ready' | 'error'>('wait')
  const [message, setMessage] = useState('Подключение к доске…')
  const startedRef = useRef(false)

  const connect = useCallback(
    async (raw: string): Promise<void> => {
      const wanted = raw.trim().toLowerCase()
      if (!wanted) return
      setState('wait')
      setMessage('Подключение к доске…')
      const deadline = Date.now() + WAIT_ROOMS_MS
      let offer: string | null = null
      while (Date.now() < deadline) {
        try {
          offer = await api.live.guestFetch(wanted)
        } catch (error) {
          setState('error')
          setMessage(error instanceof Error ? error.message : String(error))
          return
        }
        if (offer) break
        setMessage('Ждём, пока хост откроет сессию…')
        await new Promise((resolve) => setTimeout(resolve, 900))
      }
      if (!offer) {
        setState('error')
        setMessage('Сессия не найдена или уже закрыта')
        return
      }
      try {
        setPendingJoin(wanted, offer)
        const board = await api.board.createSession(`Совместная доска ${wanted}`)
        setGuestBoardId(board.id)
        navigate({ name: 'board', docId: board.id })
      } catch (error) {
        setState('error')
        setMessage(error instanceof Error ? error.message : String(error))
      }
    },
    []
  )

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    void connect(props.code)
  }, [connect, props.code])

  return (
    <div className="join">
      <div className="join__box">
        <div className="join__icon">
          {state === 'wait' ? <Loader2 size={22} className="spin" /> : <Users size={22} />}
        </div>
        <h1 className="join__title">Совместная работа</h1>
        <p className="join__text">{message}</p>
        <label className="join__field">
          <span>Код приглашения</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="abc-def-ghi"
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <div className="join__actions">
          <button type="button" className="btn btn--sm btn--primary" onClick={() => void connect(code)} disabled={state === 'wait'}>
            Подключиться
          </button>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => {
              toast('Сессия не открыта', 'info')
              navigate({ name: 'home' })
            }}
          >
            На главную
          </button>
        </div>
      </div>
    </div>
  )
}
