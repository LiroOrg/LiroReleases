import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ExternalLink, FileQuestion, Globe, Minus, Square, WifiOff, X } from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import ini from 'highlight.js/lib/languages/ini'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import type { PreviewPayload, PreviewText } from '@shared/api'
import { api } from '../lib/api'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

function youtubeEmbed(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/)
  if (!match) return null
  return `https://www.youtube.com/embed/${match[1]}`
}

function vimeoEmbed(url: string): string | null {
  const match = url.match(/vimeo\.com\/(\d+)/)
  return match ? `https://player.vimeo.com/video/${match[1]}` : null
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>]/g, (char) => (char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'))
}

export function PreviewScreen(): ReactNode {
  const [payload, setPayload] = useState<PreviewPayload | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [online, setOnline] = useState(() => navigator.onLine)
  const [text, setText] = useState<PreviewText | null>(null)
  const [textReady, setTextReady] = useState(false)
  const [loadError, setLoadError] = useState('')

  const kind = payload?.kind ?? 'file'
  const src = payload?.src ?? ''

  useEffect(() => {
    void api.preview
      .get()
      .then((value) => {
        setPayload(value)
        setLoaded(true)
      })
      .catch((error: unknown) => {
        setLoadError(error instanceof Error ? error.message : String(error))
        setLoaded(true)
      })
  }, [])

  const openExternal = (): void => {
    void api.shell.open(src).catch((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error)
      setPayload((current) => (current ? { ...current, detail: `Браузер не открылся: ${text}` } : current))
    })
  }

  useEffect(() => {
    if (!payload) return
    setOnline(payload.online ?? navigator.onLine)
  }, [payload])

  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  useEffect(() => {
    if (kind !== 'text' || !src) {
      setText(null)
      setTextReady(true)
      return
    }
    let alive = true
    setTextReady(false)
    void api.preview
      .text(src)
      .then((value) => {
        if (!alive) return
        setText(value)
        setTextReady(true)
      })
      .catch(() => {
        if (!alive) return
        setText(null)
        setTextReady(true)
      })
    return () => {
      alive = false
    }
  }, [kind, src])

  const code = useMemo(() => {
    if (!text || text.language === 'document') return ''
    try {
      return hljs.highlight(text.content, { language: text.language, ignoreIllegals: true }).value
    } catch {
      return escapeHtml(text.content)
    }
  }, [text])

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
    const embed = online ? youtubeEmbed(src) ?? vimeoEmbed(src) : null
    body = !online ? (
      <div className="preview__center preview__center--empty">
        <WifiOff size={42} />
        <div className="preview__hint">Нет подключения к интернету</div>
        <div className="preview__hint preview__hint--dim">Страница и видео приходят из сети, офлайн показать их нельзя</div>
        <div className="preview__path">{src}</div>
      </div>
    ) : embed ? (
      <iframe className="preview__frame" src={embed} title={payload?.title ?? 'Видео'} allow="autoplay; encrypted-media; picture-in-picture" />
    ) : (
      <iframe className="preview__frame" src={src} title={payload?.title ?? 'Страница'} sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />
    )
  } else if (kind === 'text') {
    body = text ? (
      text.language === 'document' ? (
        <div className="preview__doc-wrap">
          <article className="preview__doc" dangerouslySetInnerHTML={{ __html: text.content }} />
          {text.truncated ? <div className="preview__doc-note">Файл большой — показано только начало</div> : null}
        </div>
      ) : (
        <div className="preview__code">
          <pre className="preview__code-body">
            <code className="hljs" dangerouslySetInnerHTML={{ __html: code }} />
          </pre>
          {text.truncated ? <div className="preview__code-note">Файл большой — показано только начало</div> : null}
        </div>
      )
    ) : textReady ? (
      <div className="preview__center preview__center--empty">
        <FileQuestion size={42} />
        <div className="preview__hint">Этот файл нельзя показать текстом.</div>
        <div className="preview__path">{src}</div>
      </div>
    ) : null
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
            <button type="button" title="Открыть во внешнем браузере" aria-label="Открыть во внешнем браузере" onClick={openExternal}>
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
        {loaded ? (
          loadError ? (
            <div className="preview__center preview__center--empty">
              <FileQuestion size={42} />
              <div className="preview__hint">Предпросмотр не загрузился</div>
              <div className="preview__hint preview__hint--dim">{loadError}</div>
            </div>
          ) : (
            body
          )
        ) : null}
      </div>
      {kind === 'web' && online ? (
        <div className="preview__foot">
          <Globe size={13} />
          <span className="truncate">{src}</span>
        </div>
      ) : null}
    </div>
  )
}