import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { BoardDoc, BoardItem, Rect } from '@shared/types'
import { api } from '../lib/api'
import { ItemView, visibleItems } from '../board/scene'
import { ConnectorLayer } from '../board/connectors'

const PAPER_PX: Record<string, { width: number; height: number }> = {
  a4: { width: 1123, height: 794 },
  a3: { width: 1587, height: 1123 }
}

const PAPER_MM: Record<string, { width: number; height: number }> = {
  a4: { width: 297, height: 210 },
  a3: { width: 420, height: 297 }
}

export interface RenderQuery {
  docId: string
  scope: 'board' | 'frame' | 'selection' | 'thumb'
  targetId?: string
  selection?: string
  bbox?: Rect
  scale: number
  background: 'white' | 'transparent'
  mode: 'png' | 'html' | 'print'
  width: number
  height: number
  paper: string
  tileCols: number
  tileRows: number
}

export function readRenderQuery(): RenderQuery | null {
  const hash = window.location.hash.replace(/^#/, '')
  const index = hash.indexOf('?')
  if (!hash.startsWith('/render') || index < 0) return null
  const search = new URLSearchParams(hash.slice(index + 1))
  const docId = search.get('docId')
  if (!docId) return null
  const selection = search.get('selection') ?? ''
  const bboxRaw = (search.get('bbox') ?? '').split(',').map(Number)
  const bbox =
    bboxRaw.length === 4 && bboxRaw.every((n) => Number.isFinite(n)) && bboxRaw[2] > 0 && bboxRaw[3] > 0
      ? { x: bboxRaw[0], y: bboxRaw[1], width: bboxRaw[2], height: bboxRaw[3] }
      : undefined
  return {
    docId,
    scope: (search.get('scope') as RenderQuery['scope']) ?? 'board',
    targetId: search.get('targetId') ?? undefined,
    selection: selection || undefined,
    bbox,
    scale: Number(search.get('scale') ?? '1') || 1,
    background: (search.get('background') as 'white' | 'transparent') ?? 'white',
    mode: (search.get('mode') as RenderQuery['mode']) ?? 'png',
    width: Number(search.get('width') ?? '1600'),
    height: Number(search.get('height') ?? '1000'),
    paper: search.get('paper') ?? 'a3',
    tileCols: Math.max(1, Number(search.get('tileCols') ?? '1') || 1),
    tileRows: Math.max(1, Number(search.get('tileRows') ?? '1') || 1)
  }
}

interface RenderHandle {
  info: () => { width: number; height: number; printWidth: string; printHeight: string; ready: boolean }
  ready: () => Promise<{ width: number; height: number; printWidth: string; printHeight: string; ready: boolean }>
  html: () => Promise<string>
}

export function RenderMode(): ReactNode {
  const query = useMemo(() => readRenderQuery(), [])
  const [doc, setDoc] = useState<BoardDoc | null>(null)
  const [assetsReady, setAssetsReady] = useState(false)
  const [info, setInfo] = useState({ width: 0, height: 0, printWidth: '0', printHeight: '0', ready: false })
  const resolveReady = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!query) return
    let alive = true
    api.board
      .open(query.docId)
      .then((loaded) => {
        if (alive) setDoc(loaded)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [query])

  const region = useMemo<Rect>(() => {
    if (!doc) return { x: 0, y: 0, width: 100, height: 100 }
    if (query?.scope === 'thumb' && query.bbox) return query.bbox
    if (query?.scope === 'frame' && query.targetId) {
      const frame = doc.items.find((item) => item.id === query.targetId)
      if (frame) return { x: frame.x - 60, y: frame.y - 60, width: frame.w + 120, height: frame.h + 120 }
    }
    if (query?.scope === 'selection' && query.selection) {
      const ids = new Set(query.selection.split(','))
      const items = doc.items.filter((item) => ids.has(item.id))
      if (items.length) {
        const minX = Math.min(...items.map((item) => item.x)) - 40
        const minY = Math.min(...items.map((item) => item.y)) - 40
        const maxX = Math.max(...items.map((item) => item.x + Math.max(1, item.w))) + 40
        const maxY = Math.max(...items.map((item) => item.y + Math.max(1, item.h))) + 40
        return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
      }
    }
    return doc.bounds
  }, [doc, query])

  const assetUrl = useCallback(
    (file: string) => (file ? `lirofile://${encodeURIComponent(query?.docId ?? '')}/${encodeURIComponent(file)}` : ''),
    [query?.docId]
  )

  useEffect(() => {
    if (!doc || !query) return
    const images = Array.from(document.querySelectorAll('img'))
    if (!images.length) {
      setAssetsReady(true)
      return
    }
    let pending = images.length
    let done = false
    const finish = (): void => {
      if (done) return
      done = true
      setAssetsReady(true)
    }
    const settle = (): void => {
      pending -= 1
      if (pending <= 0) finish()
    }
    const timer = window.setTimeout(finish, 15000)
    for (const image of images) {
      if (image.complete) {
        settle()
        continue
      }
      image.addEventListener('load', settle)
      image.addEventListener('error', settle)
    }
    return () => window.clearTimeout(timer)
  }, [doc, query])

  useEffect(() => {
    if (!doc || !query || !assetsReady) return
    const paper = PAPER_PX[query.paper] ?? PAPER_PX.a3
    let width = 0
    let height = 0
    if (query.mode === 'print') {
      width = paper.width * query.tileCols
      height = paper.height * query.tileRows
      const mm = PAPER_MM[query.paper] ?? PAPER_MM.a3
      setInfo({ width, height, printWidth: String(mm.width), printHeight: String(mm.height), ready: true })
      return
    }
    if (query.scope === 'thumb') {
      width = Math.max(1, Math.round(query.width))
      height = Math.max(1, Math.round(query.height))
      setInfo({ width, height, printWidth: '0', printHeight: '0', ready: true })
      return
    }
    width = Math.max(1, Math.round(region.width * query.scale))
    height = Math.max(1, Math.round(region.height * query.scale))
    setInfo({ width, height, printWidth: '0', printHeight: '0', ready: true })
  }, [doc, query, region, assetsReady])

  const buildHtml = useCallback(async (): Promise<string> => {
    const images = Array.from(document.querySelectorAll('img'))
    await Promise.all(
      images.map(async (image) => {
        try {
          const response = await fetch(image.src)
          const blob = await response.blob()
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = () => reject(new Error('read'))
            reader.readAsDataURL(blob)
          })
          image.setAttribute('src', dataUrl)
        } catch {
          image.removeAttribute('src')
        }
      })
    )
    const styles: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules)) styles.push(rule.cssText)
      } catch {
        continue
      }
    }
    const title = (doc?.title ?? 'Доска').replace(/[<>&"]/g, '')
    const payload = JSON.stringify({
      title: doc?.title ?? 'Доска',
      bounds: region,
      exported: new Date().toISOString()
    }).replace(/</g, '\\u003c')
    const viewer = `<div class="liro-html-bar"><span>${title}</span><span id="zoom">100%</span><button id="fit">Вписать</button><button id="one">100%</button></div>
<script>
(function(){
  var stage = document.getElementById('liro-stage');
  var data = JSON.parse(document.getElementById('liro-doc').textContent);
  var view = { x: data.bounds.x, y: data.bounds.y, z: 1 };
  function apply(){
    stage.style.transform = 'translate(-' + (view.x * view.z) + 'px,' + (-view.y * view.z) + 'px) scale(' + view.z + ')';
    document.getElementById('zoom').textContent = Math.round(view.z * 100) + '%';
  }
  function fit(){
    var r = data.bounds;
    var z = Math.min(window.innerWidth / r.width, (window.innerHeight - 44) / r.height);
    view.z = Math.max(0.01, Math.min(4, z * 0.94));
    view.x = r.x + r.width / 2;
    view.y = r.y + r.height / 2;
    apply();
  }
  document.getElementById('fit').onclick = fit;
  document.getElementById('one').onclick = function(){ view.z = 1; apply(); };
  document.addEventListener('wheel', function(e){
    e.preventDefault();
    var f = Math.exp(-e.deltaY * 0.0016);
    view.z = Math.max(0.01, Math.min(6, view.z * f));
    apply();
  }, { passive: false });
  var drag = null;
  document.addEventListener('mousedown', function(e){ drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; });
  document.addEventListener('mousemove', function(e){
    if (!drag) return;
    view.x = drag.vx - (e.clientX - drag.x) / view.z;
    view.y = drag.vy - (e.clientY - drag.y) / view.z;
    apply();
  });
  document.addEventListener('mouseup', function(){ drag = null; });
  fit();
})();
</script>`
    return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${title}</title>
<style>${styles.join('\n')}
body{overflow:hidden;margin:0;background:#ffffff;font-family:'Inter',-apple-system,'Segoe UI',sans-serif}
.liro-html-bar{position:fixed;left:0;right:0;top:0;height:44px;display:flex;align-items:center;gap:14px;padding:0 16px;background:#0d0d0f;color:#fff;font-size:13px;z-index:99999}
.liro-html-bar span{margin-left:auto;opacity:.75;font-variant-numeric:tabular-nums}
.liro-html-bar button{background:#ffffff22;color:#fff;border:1px solid #ffffff33;border-radius:6px;height:26px;padding:0 10px;cursor:pointer;font:inherit}
.liro-stage{position:fixed;inset:44px 0 0 0;overflow:hidden;background:#fff;background-image:radial-gradient(circle at 1px 1px,#ededf0 1px,transparent 0);background-size:40px 40px}
.liro-stage-inner{position:absolute;top:0;left:0;transform-origin:0 0}
</style></head><body>
<div class="liro-stage"><div class="liro-stage-inner" id="liro-stage">${document.querySelector('.rendermode')?.innerHTML ?? ''}</div></div>
<script type="application/json" id="liro-doc">${payload}</script>
${viewer}
</body></html>`
  }, [doc, region])

  useEffect(() => {
    const handle: RenderHandle = {
      info: () => info,
      ready: () =>
        new Promise((resolve) => {
          if (info.ready) resolve(info)
          else resolveReady.current = () => resolve(info)
        }),
      html: () => buildHtml()
    }
    ;(window as unknown as { __liroAppRender: RenderHandle }).__liroAppRender = handle
    return () => {
      resolveReady.current = null
    }
  }, [info, buildHtml])

  useEffect(() => {
    if (info.ready) resolveReady.current?.()
  }, [info.ready])

  if (!query || !doc) return <div className="rendermode" />

  const paper = PAPER_PX[query.paper] ?? PAPER_PX.a3
  const tiled = query.mode === 'print' && (query.tileCols > 1 || query.tileRows > 1)

  const stage = (offsetX: number, offsetY: number, scale: number, viewW: number, viewH: number, key: string): ReactNode => {
    const originX = offsetX / scale
    const originY = offsetY / scale
    return (
      <div key={key}>
        <div style={{ position: 'absolute', left: offsetX, top: offsetY, width: viewW, height: viewH }}>
          <ConnectorLayer
            doc={doc}
            viewRef={{ current: { x: originX + region.width / 2, y: originY + region.height / 2, zoom: scale } }}
            size={{ width: viewW, height: viewH }}
            visible={region}
            dpr={1}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
            width: region.width,
            height: region.height,
            transform: `scale(${scale})`,
            transformOrigin: '0 0'
          }}
        >
          {visibleItems(doc, region).map((item: BoardItem) => (
            <ItemView key={item.id} item={item} doc={doc} assetUrl={assetUrl} selected={false} dimmed={false} />
          ))}
        </div>
      </div>
    )
  }

  if (query.mode === 'html') {
    const viewW = Math.max(400, Math.min(query.width || 2400, 4000))
    const viewH = Math.max(300, Math.min(query.height || 1400, 2400))
    const originX = region.x + region.width / 2 - viewW / 2
    const originY = region.y + region.height / 2 - viewH / 2
    const rect: Rect = { x: originX, y: originY, width: viewW, height: viewH }
    return (
      <div className="rendermode" data-background={query.background} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}>
        <div style={{ position: 'absolute', left: originX, top: originY, width: viewW, height: viewH }}>
          <ConnectorLayer
            doc={doc}
            viewRef={{ current: { x: originX + viewW / 2, y: originY + viewH / 2, zoom: 1 } }}
            size={{ width: viewW, height: viewH }}
            visible={rect}
            dpr={1}
          />
        </div>
        <div style={{ position: 'absolute', left: 0, top: 0 }}>
          {visibleItems(doc, rect).map((item: BoardItem) => (
            <ItemView key={item.id} item={item} doc={doc} assetUrl={assetUrl} selected={false} dimmed={false} />
          ))}
        </div>
      </div>
    )
  }

  if (query.mode === 'print') {
    const tileWidth = region.width / query.tileCols
    const tileHeight = region.height / query.tileRows
    const scaleFactor = tiled ? paper.width / tileWidth : Math.min(paper.width / region.width, paper.height / region.height)
    const pages: ReactNode[] = []
    for (let row = 0; row < query.tileRows; row += 1) {
      for (let col = 0; col < query.tileCols; col += 1) {
        const contentX = tiled ? col * tileWidth : region.x
        const contentY = tiled ? row * tileHeight : region.y
        const tx = -contentX * scaleFactor + (paper.width - region.width * scaleFactor) / 2
        const ty = -contentY * scaleFactor + (paper.height - region.height * scaleFactor) / 2
        pages.push(
          <div
            key={`page-${row}-${col}`}
            className="printpage"
            style={{
              width: paper.width,
              height: paper.height,
              left: col * paper.width,
              top: row * paper.height,
              position: 'absolute'
            }}
          >
            {stage(tx, ty, scaleFactor, paper.width / scaleFactor, paper.height / scaleFactor, `s-${row}-${col}`)}
          </div>
        )
      }
    }
    const mm = PAPER_MM[query.paper] ?? PAPER_MM.a3
    return (
      <div
        className="rendermode"
        data-background={query.background}
        style={{ width: paper.width * query.tileCols, height: paper.height * query.tileRows, position: 'relative' }}
      >
        <style>{`@page{size:${mm.width}mm ${mm.height}mm;margin:0}`}</style>
        {pages}
      </div>
    )
  }

  if (query.scope === 'thumb') {
    const frameWidth = Math.max(1, Math.round(query.width))
    const frameHeight = Math.max(1, Math.round(query.height))
    const fit = Math.min(1, frameWidth / region.width, frameHeight / region.height)
    const offsetX = (frameWidth - region.width * fit) / 2 - region.x * fit
    const offsetY = (frameHeight - region.height * fit) / 2 - region.y * fit
    return (
      <div
        className="rendermode"
        data-background={query.background}
        data-scope="thumb"
        style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}
      >
        {stage(offsetX, offsetY, fit, frameWidth / fit, frameHeight / fit, 'main')}
      </div>
    )
  }

  const scale = query.scale
  const width = Math.max(1, Math.round(region.width * scale))
  const height = Math.max(1, Math.round(region.height * scale))

  return (
    <div className="rendermode" data-background={query.background} style={{ width, height, position: 'relative', overflow: 'hidden' }}>
      {stage(-region.x * scale, -region.y * scale, scale, width, height, 'main')}
    </div>
  )
}