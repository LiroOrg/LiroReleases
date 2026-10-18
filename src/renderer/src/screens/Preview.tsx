import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ExternalLink, FileQuestion, Globe, Minus, Square, X } from 'lucide-react'
import type { PreviewPayload } from '@shared/api'
import { api } from '../lib/api'

function youtubeEmbed(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/)
  if (!match) return null
  return `https://www.youtube.com/embed/${match[1]}`
}

function vimeoEmbed(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? `https://player.vimeo.com/video/${match[1]}` : null
}

export function PreviewScreen(): ReactNode {
  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    void api.preview.get().then((value) => {
      setPayload(value)
      setLoaded(true)
    })
  }, [])

  const kind = payload?.kind ?? 'file'
  const src = payload?.src ?? ''

  let body: ReactNode = null
  if (kind === 'image') {
    body = (
      <div className="preview__center">
        <img className="preview__image" src={src} alt="" />
      </div>
    )
  } else if (kind === 'pdf') {
    body = <iframe className="preview__frame" src={src} title={payload?.title ?? 'PDF'} />
  } else if (kind === 'media') {
    const audio = /\.(mp3|wav|ogg|oga|m4a|flac|aac)$/i.test(src.split('?')[0])
    body = audio ? (
      <div className="preview__center">
        <audio className="preview__audio" src={src} controls />
      </div>
    ) : (
      <video className="preview__video" src={src} controls />
    )
  } else if (kind === 'web') {
    const embed = youtubeEmbed(src) ?? vimeoEmbed(src)
    body = embed ? (
      <iframe className="preview__frame" src={embed} title={payload?.title ?? 'Видео'} allow="autoplay; encrypted-media; picture-in-picture" />
    ) : (
      <iframe className="preview__frame" src={src} title={payload?.title ?? 'Страница'} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
    )
  } else if (kind === 'text') {
    body = <iframe className="preview__frame" src={src} title={payload?.title ?? 'Текст'} />
  } else {
    body = (
      <div className="preview__center preview__center--empty">
        <FileQuestion size={42} />
        <div className="preview__hint">Этот формат нельзя показать в окне предпросмотра.</div>
        <div className="preview__path">{src}</div>
      </div>
    )
  }

  return (
    <div className="preview">
      <div className="winframe">
        <div className="winframe__drag">
          <span className="winframe__title truncate">{payload?.title ?? 'Предпросмотр'}</span>
          {payload?.detail ? <span className="preview__detail truncate">{payload.detail}</span> : null}
        </div>
        <div className="winframe__buttons">
          {src ? (
            <button type="button" title="Открыть во внешнем браузере" aria-label="Открыть во внешнем браузере" onClick={() => void api.shell.open(src)}>
              <ExternalLink size={14} />
            </button>
          ) : null}
          <button type="button" title="Свернуть" aria-label="Свернуть" onClick={() => void api.windows.minimize()}>
            <Minus size={15} />
          </button>
          <button type="button" title="Развернуть" aria-label="Развернуть" onClick={() => void api.windows.maximize()}>
            <Square size={12} />
          </button>
          <button type="button" className="winframe__close" title="Закрыть" aria-label="Закрыть" onClick={() => void api.windows.close()}>
            <X size={15} />
          </button>
        </div>
      </div>
      <div className="preview__body" data-kind={kind}>
        {loaded ? body : null}
      </div>
      {kind === 'web' ? (
        <div className="preview__foot">
          <Globe size={13} />
          <span className="truncate">{src}</span>
        </div>
      ) : null}
    </div>
  )
}