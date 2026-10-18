import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { api } from '../lib/api'

export function WindowFrame(props: { title?: string }): ReactNode {
  const [maximized, setMaximized] = useState(false)
  useEffect(() => {
    return window.liro.subscribe('window:state', (payload) => {
      setMaximized(Boolean((payload as { maximized?: boolean })?.maximized))
    })
  }, [])
  return (
    <div className="winframe">
      <div className="winframe__drag">
        <span className="winframe__title truncate">{props.title ?? 'Liro'}</span>
      </div>
      <div className="winframe__buttons">
        <button type="button" title="Свернуть" aria-label="Свернуть" onClick={() => void api.windows.minimize()}>
          <Minus size={15} />
        </button>
        <button
          type="button"
          title={maximized ? 'Восстановить' : 'Развернуть'}
          aria-label="Развернуть"
          data-active={maximized}
          onClick={() => void api.windows.maximize()}
        >
          <Square size={12} />
        </button>
        <button type="button" className="winframe__close" title="Закрыть" aria-label="Закрыть" onClick={() => void api.windows.close()}>
          <X size={15} />
        </button>
      </div>
    </div>
  )
}