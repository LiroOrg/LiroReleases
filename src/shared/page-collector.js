;(() => {
  if (window.__liroAppCollectorActive) {
    try {
      window.__liroAppCollectorActive.run()
    } catch (error) {}
    return
  }
  window.__liroAppCollectorActive = {
    run: () => main('manual'),
    stop: () => {
      state.running = false
      hideOverlay()
    },
    state: () => ({ ...state, items: state.items.size })
  }

  const cfg = Object.assign({ port: 47811, token: '', endpoint: '/collect' }, window.__LIRO_CFG || {})
  let configReady = !!(cfg.port && cfg.token)

  const ensureConfig = async () => {
    if (configReady && cfg.token) return cfg
    const ports = [cfg.port, 47811, 47812, 47813, 47814, 47815].filter(Boolean)
    for (const port of ports) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/config`, { cache: 'no-store' })
        if (!response.ok) continue
        const data = await response.json()
        if (text(data.app) !== 'Liro') continue
        cfg.port = Number(data.port) || port
        cfg.token = String(data.token || '')
        cfg.endpoint = String(data.endpoint || '/collect')
        configReady = true
        log(`Приём данных: 127.0.0.1:${cfg.port}`, 'meta')
        return cfg
      } catch {}
    }
    for (const port of ports) {
      const data = await fetchJsonViaExtension(`http://127.0.0.1:${port}/config`)
      if (!data || text(data.app) !== 'Liro') continue
      cfg.port = Number(data.port) || port
      cfg.token = String(data.token || '')
      cfg.endpoint = String(data.endpoint || '/collect')
      configReady = true
      log(`Приём данных через расширение: 127.0.0.1:${cfg.port}`, 'meta')
      return cfg
    }
    configReady = true
    state.warnings.push('Не удалось получить токен локального сервера — откройте Liro и повторите сбор')
    return cfg
  }

  const state = {
    running: false,
    startedAt: Date.now(),
    items: new Map(),
    board: {},
    images: new Map(),
    warnings: [],
    logs: [],
    sdkReady: false,
    restOk: false,
    phase: 'idle',
    total: 0
  }

  const text = (value) => (typeof value === 'string' ? value : value == null ? '' : String(value))
  const number = (value) => {
    const n = typeof value === 'number' ? value : parseFloat(text(value).replace('%', ''))
    return Number.isFinite(n) ? n : undefined
  }

  const PROXY_SOURCE = 'liro-collector-request'
  const PROXY_RESPONSE = 'liro-collector-response'
  let proxySeq = 0
  const proxyWaiters = new Map()

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== PROXY_RESPONSE) return
    const waiter = proxyWaiters.get(data.id)
    if (!waiter) return
    proxyWaiters.delete(data.id)
    clearTimeout(waiter.timer)
    waiter.resolve(data)
  })

  const proxyFetch = (url, timeoutMs = 45000) =>
    new Promise((resolve) => {
      const id = `p${Date.now().toString(36)}${(proxySeq += 1)}`
      const timer = setTimeout(() => {
        proxyWaiters.delete(id)
        resolve({ ok: false, error: 'расширение не ответило' })
      }, timeoutMs)
      proxyWaiters.set(id, { resolve, timer })
      try {
        window.postMessage({ source: PROXY_SOURCE, id, url: text(url) }, '*')
      } catch (error) {
        proxyWaiters.delete(id)
        clearTimeout(timer)
        resolve({ ok: false, error: text(error) })
      }
    })

  const fetchViaExtension = async (url) => {
    const answer = await proxyFetch(url)
    if (!answer || !answer.ok) return null
    if (!answer.dataUrl) return null
    return { dataUrl: answer.dataUrl, mime: answer.mime || '', bytes: Number(answer.bytes) || 0 }
  }

  const fetchJsonViaExtension = async (url) => {
    const answer = await proxyFetch(url)
    if (!answer || !answer.ok || !answer.text) return null
    try {
      return JSON.parse(answer.text)
    } catch {
      return null
    }
  }

  const log = (message, phase) => {
    const entry = { at: Date.now(), message: text(message).slice(0, 300) }
    state.logs.unshift(entry)
    if (state.logs.length > 60) state.logs.length = 60
    if (phase) state.phase = phase
    updateOverlay()
  }

  const overlay = createOverlay()
  function createOverlay() {
    let el = document.getElementById('liro-collector-overlay')
    if (el) return el
    const host = document.createElement('div')
    host.id = 'liro-collector-overlay'
    host.style.cssText =
      'position:fixed;z-index:2147483647;right:16px;bottom:16px;width:300px;padding:14px 16px;border-radius:12px;' +
      'background:#0b0b0c;color:#fff;font:13px/1.45 -apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);'
    host.innerHTML =
      '<div style="font-weight:600;letter-spacing:.02em;margin-bottom:6px">Liro — сбор доски</div>' +
      '<div data-phase>Подготовка…</div>' +
      '<div data-items style="margin-top:6px;opacity:.72;font-size:12px"></div>' +
      '<div data-warn style="margin-top:6px;opacity:.72;font-size:12px"></div>'
    const attach = () => {
      if (!host.isConnected && document.body) document.body.appendChild(host)
    }
    attach()
    if (!document.body) document.addEventListener('DOMContentLoaded', attach)
    return host
  }

  function updateOverlay() {
    if (!overlay || !overlay.isConnected) return
    const phase = overlay.querySelector('[data-phase]')
    const items = overlay.querySelector('[data-items]')
    const warn = overlay.querySelector('[data-warn]')
    const phaseText = {
      idle: 'Ожидание…',
      sdk: 'Ждём Miro Web SDK',
      items: 'Собираем элементы',
      images: 'Забираем картинки',
      sweep: 'Обходим доску по кадрам',
      done: 'Готово, данные отправлены в Liro',
      error: 'Ошибка — подробности в Liro'
    }
    if (phase) phase.textContent = phaseText[state.phase] ?? state.phase
    if (items) items.textContent = `Элементов: ${state.items.size}${state.images.size ? ` · картинок: ${state.images.size}` : ''}`
    if (warn) warn.textContent = state.warnings.slice(0, 2).join(' · ')
  }

  function hideOverlay() {
    try {
      if (overlay && overlay.isConnected) overlay.remove()
    } catch {}
  }

  function baseUrl(path) {
    return `http://127.0.0.1:${cfg.port}${cfg.endpoint}${path}`
  }

  async function post(path, payload) {
    const bridge = window.__liroBridge
    if (bridge && typeof bridge.send === 'function') {
      bridge.send('collect', { path, payload })
      return { ok: true, via: 'bridge' }
    }
    configReady = false
    await ensureConfig()
    let response = await send(path, payload)
    if (response.status === 403) {
      log('Токен устарел, обновляем из /config и повторяем запрос', 'meta')
      configReady = false
      await ensureConfig()
      response = await send(path, payload)
      if (response.status === 403) {
        throw new Error('Приложение отклонило сбор: неверный токен. Откройте Liro заново и повторите.')
      }
    }
    if (!response.ok) throw new Error('Локальный сервер отклонил ' + path + ': HTTP ' + response.status)
    return response
  }

  async function send(path, payload) {
    const headers = { 'content-type': 'application/json' }
    if (cfg.token) headers['x-liro-token'] = cfg.token
    const response = await fetch(baseUrl(path), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store'
    })
    return { ok: response.ok, via: 'http', status: response.status }
  }

  const boardIdFromUrl = (url) => {
    const m = /\/app\/board\/([^/?#]+)/.exec(text(url))
    if (m) return decodeURIComponent(m[1])
    const alt = /boards\/([A-Za-z0-9_=-]{8,})/.exec(text(url))
    return alt ? alt[1] : ''
  }

  const currentBoardId = () => {
    const fromUrl = boardIdFromUrl(location.href)
    if (fromUrl) return fromUrl
    const link = document.querySelector('a[href*="/app/board/"]')
    return link ? boardIdFromUrl(link.getAttribute('href') || '') : ''
  }

  const waitFor = async (fn, timeoutMs, intervalMs = 200) => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      try {
        const value = await fn()
        if (value) return value
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
    return null
  }

  const ingestItems = (list) => {
    let added = 0
    for (const raw of Array.isArray(list) ? list : []) {
      if (!raw || typeof raw !== 'object') continue
      const id = text(raw.id)
      const type = text(raw.type || raw.item_type)
      if (!id && !type) continue
      const key = id || `${type}:${state.items.size}`
      const previous = state.items.get(key)
      if (previous) {
        if (JSON.stringify(raw).length > JSON.stringify(previous).length) state.items.set(key, raw)
        continue
      }
      state.items.set(key, raw)
      added += 1
    }
    state.total = Math.max(state.total, state.items.size)
    updateOverlay()
    return added
  }

  const sanitizeBounds = (value) => {
    if (!value) return undefined
    if (Array.isArray(value.x) && Array.isArray(value.y)) {
      const xs = value.x.map((v) => number(v)).filter((n) => n != null)
      const ys = value.y.map((v) => number(v)).filter((n) => n != null)
      if (xs.length >= 2 && ys.length >= 2) {
        const minX = Math.min(...xs)
        const minY = Math.min(...ys)
        return { x: minX, y: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }
      }
    }
    if (typeof value === 'object') {
      const x = number(value.x ?? value.left ?? value.minX)
      const y = number(value.y ?? value.top ?? value.minY)
      const width = number(value.width ?? (value.maxX != null && x != null ? value.maxX - x : undefined))
      const height = number(value.height ?? (value.maxY != null && y != null ? value.maxY - y : undefined))
      if ([x, y, width, height].every((n) => n != null) && width > 0 && height > 0) return { x, y, width, height }
    }
    if (typeof value === 'string') {
      try {
        return sanitizeBounds(JSON.parse(value))
      } catch {
        const nums = value.split(/[,;:\s]+/).map((v) => parseFloat(v)).filter((n) => Number.isFinite(n))
        if (nums.length >= 4) return { x: nums[0], y: nums[1], width: nums[2] - nums[0], height: nums[3] - nums[1] }
      }
    }
    return undefined
  }

  const mergeBoard = (patch) => {
    state.board = { ...state.board, ...patch }
    updateOverlay()
    return state.board
  }

  const sdkReady = () => {
    state.sdkReady = !!window.miro && typeof window.miro.board?.get === 'function'
    return state.sdkReady
  }

  const harvestSdk = async () => {
    const boardId = currentBoardId()
    if (boardId) mergeBoard({ id: boardId, url: location.href })
    const ready = await waitFor(sdkReady, 60000)
    if (!ready) {
      state.warnings.push('Miro Web SDK не появился за 60 секунд')
      log('Web SDK недоступен, пробуем внутренние запросы', 'items')
      return false
    }
    log('Web SDK готов, забираем элементы', 'items')
    try {
      const info = await window.miro.board.getInfo()
      if (info) mergeBoard({ id: text(info.id) || state.board.id, createdAt: text(info.createdAt), modifiedAt: text(info.updatedAt) })
    } catch {}
    try {
      const viewport = await window.miro.board.viewport.get()
      const bounds = sanitizeBounds(viewport)
      if (bounds) mergeBoard({ bounds })
    } catch {}
    const items = await window.miro.board.get()
    ingestItems(items)
    log(`Получено элементов: ${state.items.size}`, 'images')
    return state.items.size > 0
  }

  const harvestRest = async (boardId, types) => {
    const out = []
    let cursor = ''
    let guard = 0
    let viaProxy = 0
    while (guard < 2000) {
      guard += 1
      const url = new URL(`https://api.miro.com/v2/boards/${encodeURIComponent(boardId)}/items`)
      url.searchParams.set('limit', '50')
      if (types) url.searchParams.set('type', types)
      if (cursor) url.searchParams.set('cursor', cursor)
      let body = null
      try {
        const response = await fetch(url.toString(), { credentials: 'include', headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        body = await response.json()
      } catch (error) {
        const viaExt = await fetchJsonViaExtension(url.toString())
        if (!viaExt) throw new Error('сеть недоступна: ' + text(error))
        body = viaExt
        viaProxy += 1
      }
      const data = Array.isArray(body) ? body : body.data || body.items || []
      out.push(...data)
      const next = text(body.cursor || body.links?.next || '')
      if (!next || next === cursor || !data.length) break
      cursor = next
    }
    state.restOk = true
    if (viaProxy) log(`REST-запросы через расширение: ${viaProxy}`, 'items')
    return out
  }

  const toBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(text(reader.result))
      reader.onerror = () => reject(new Error('FileReader'))
      reader.readAsDataURL(blob)
    })

  const uploadImage = async (itemId, url, label) => {
    const target = text(url)
    if (!target) return false
    try {
      if (target.startsWith('data:')) {
        const head = target.slice(0, target.indexOf(';') + 1)
        state.images.set(itemId, {
          mime: head.slice(5, -1),
          dataUrl: target,
          bytes: Math.round(target.length * 0.75),
          label
        })
        log(`Картинка ${state.images.size}: ${label || itemId}`)
        return true
      }
      let payload = null
      let lastError = ''
      try {
        const response = await fetch(target, { credentials: 'include' })
        if (!response.ok) throw new Error('HTTP ' + response.status)
        const blob = await response.blob()
        if (blob.size < 32) throw new Error('пустой файл')
        payload = { dataUrl: await toBase64(blob), mime: blob.type || 'image/png', bytes: blob.size }
      } catch (error) {
        lastError = text(error)
        payload = await fetchViaExtension(target)
      }
      if (!payload || !payload.dataUrl || payload.bytes < 32) {
        throw new Error(lastError || 'расширение не вернуло данные')
      }
      state.images.set(itemId, { mime: payload.mime || 'image/png', dataUrl: payload.dataUrl, bytes: payload.bytes, label })
      log(`Картинка ${state.images.size}: ${label || itemId}`)
      return true
    } catch (error) {
      state.warnings.push(`Картинка ${label || itemId}: ${text(error).slice(0, 80)}`)
      return false
    }
  }

  const withRedirect = (url) => {
    const parsed = new URL(url)
    parsed.searchParams.set('redirect', 'true')
    return parsed.toString()
  }

  const withFormat = (url, format) => {
    const parsed = new URL(url)
    if (format) parsed.searchParams.set('format', format)
    return parsed.toString()
  }

  const harvestImagesRest = async (boardId) => {
    const items = await harvestRest(boardId, 'image')
    ingestItems(items)
    let done = 0
    let failed = 0
    for (const item of items) {
      if (!state.running) break
      const id = text(item.id)
      const imageUrl = text(item.data?.imageUrl || item.data?.url || item.data?.previewUrl)
      if (!id || !imageUrl) continue
      const ok =
        (await uploadImage(id, withFormat(withRedirect(imageUrl), 'original'), text(item.data?.title))) ||
        (await uploadImage(id, withRedirect(imageUrl), text(item.data?.title)))
      if (ok) done += 1
      else failed += 1
      if ((done + failed) % 3 === 0) log(`Картинки: ${done} из ${items.length}`, 'images')
    }
    return { done, failed, total: items.length }
  }

  const itemRect = (item) => {
    const width = number(item.width ?? item.geometry?.width) || 0
    const height = number(item.height ?? item.geometry?.height) || 0
    const x = number(item.x ?? item.position?.x) || 0
    const y = number(item.y ?? item.position?.y) || 0
    const origin = text(item.origin ?? item.position?.origin ?? 'center')
    const left = origin === 'x_y' || origin === 'top_left' ? x : x - width / 2
    const top = origin === 'x_y' || origin === 'top_left' ? y : y - height / 2
    return { x: left, y: top, width, height }
  }

  const imageItems = () =>
    Array.from(state.items.values()).filter((item) => text(item.type) === 'image' || text(item.type) === 'preview')

  const viewportTransform = async () => {
    const viewport = await window.miro?.board?.viewport?.get?.().catch(() => null)
    if (!viewport) return null
    const canvases = Array.from(document.querySelectorAll('canvas, [class*="board"], [class*="canvas"]'))
      .map((el) => el.getBoundingClientRect())
      .filter((rect) => rect.width > 200 && rect.height > 200)
      .sort((a, b) => b.width * b.height - a.width * a.height)
    const rect = canvases[0]
    if (!rect) return null
    const scaleX = viewport.width / rect.width
    const scaleY = viewport.height / rect.height
    return {
      scale: scaleX || scaleY || 1,
      offsetX: viewport.x - rect.left * scaleX,
      offsetY: viewport.y - rect.top * scaleY
    }
  }

  const domImages = (transform) => {
    const nodes = Array.from(document.querySelectorAll('img'))
    const out = []
    for (const node of nodes) {
      const src = node.currentSrc || node.src || ''
      if (!src || src.startsWith('data:')) {
        if (src.startsWith('data:') && transform) {
          const rect = node.getBoundingClientRect()
          out.push({
            src,
            rect: {
              x: rect.left * transform.scale + transform.offsetX,
              y: rect.top * transform.scale + transform.offsetY,
              width: rect.width * transform.scale,
              height: rect.height * transform.scale
            }
          })
        }
        continue
      }
      if (!transform) continue
      const rect = node.getBoundingClientRect()
      if (rect.width < 8 || rect.height < 8) continue
      out.push({
        src,
        rect: {
          x: rect.left * transform.scale + transform.offsetX,
          y: rect.top * transform.scale + transform.offsetY,
          width: rect.width * transform.scale,
          height: rect.height * transform.scale
        }
      })
    }
    return out
  }

  const overlapScore = (a, b) => {
    const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
    const inter = x * y
    const areaA = Math.max(1, a.width * a.height)
    const areaB = Math.max(1, b.width * b.height)
    return inter / Math.min(areaA, areaB)
  }

  const harvestImagesDom = async (label) => {
    const transform = await viewportTransform()
    if (!transform) {
      state.warnings.push('Не удалось определить масштаб доски для поиска картинок')
      return 0
    }
    const pending = imageItems().filter((item) => !state.images.has(text(item.id)))
    if (!pending.length) return 0
    const nodes = domImages(transform)
    let matched = 0
    const used = new Set()
    for (const item of pending) {
      const rect = itemRect(item)
      let best = null
      let bestScore = 0
      for (const node of nodes) {
        if (used.has(node.src)) continue
        const score = overlapScore(rect, node.rect)
        if (score > bestScore) {
          bestScore = score
          best = node
        }
      }
      if (best && bestScore > 0.45) {
        used.add(best.src)
        if (await uploadImage(text(item.id), best.src, `${label || 'dom'} ${matched + 1}`)) matched += 1
      }
    }
    return matched
  }

  const harvestVectorSvg = async () => {
    const api = window.cmd?.board?.api
    if (!api || typeof api.export?.makeVector !== 'function') return 0
    log('Пробуем векторный экспорт Miro для картинок', 'images')
    let svg = ''
    try {
      if (typeof api.clearSelection === 'function') api.clearSelection()
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          svg = text(await api.export.makeVector())
          break
        } catch (error) {
          await new Promise((resolve) => setTimeout(resolve, 1200))
        }
      }
    } catch {}
    if (!svg) return 0
    let parsed
    try {
      parsed = new DOMParser().parseFromString(svg, 'image/svg+xml')
    } catch {
      return 0
    }
    const nodes = Array.from(parsed.querySelectorAll('image'))
    const pending = imageItems().filter((item) => !state.images.has(text(item.id)))
    let matched = 0
    for (const node of nodes) {
      const href = node.getAttribute('href') || node.getAttribute('xlink:href') || ''
      if (!href) continue
      if (!href.startsWith('data:') && !href.startsWith('http')) continue
      const rect = {
        x: number(node.getAttribute('x')) || 0,
        y: number(node.getAttribute('y')) || 0,
        width: number(node.getAttribute('width')) || 0,
        height: number(node.getAttribute('height')) || 0
      }
      let best = null
      let bestScore = 0
      for (const item of pending) {
        if (state.images.has(text(item.id))) continue
        const score = overlapScore(itemRect(item), rect)
        if (score > bestScore) {
          bestScore = score
          best = item
        }
      }
      if (!best || bestScore < 0.4) continue
      const id = text(best.id)
      if (href.startsWith('data:')) {
        state.images.set(id, {
          mime: href.slice(5, href.indexOf(';')),
          dataUrl: href,
          bytes: Math.round(href.length * 0.75),
          label: 'svg'
        })
        matched += 1
      } else if (await uploadImage(id, href, 'svg')) {
        matched += 1
      }
    }
    log(`Векторный экспорт дал картинок: ${matched}`, 'images')
    return matched
  }

  const sweepBoard = async () => {
    const viewportApi = window.miro?.board?.viewport
    if (!viewportApi || typeof viewportApi.set !== 'function') return 0
    const bounds = state.board.bounds
    if (!bounds) return 0
    const cols = 3
    const rows = 3
    const stepX = bounds.width / cols
    const stepY = bounds.height / rows
    let total = 0
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!state.running) return total
        const reverse = row % 2 === 1
        const index = reverse ? cols - 1 - col : col
        try {
          await viewportApi.set({
            viewport: { x: bounds.x + index * stepX, y: bounds.y + row * stepY, width: stepX, height: stepY },
            animationDurationInMs: 0
          })
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, 900))
        total += await harvestImagesDom(`кадр ${row + 1}.${index + 1}`)
        log(`Обход доски: кадр ${row + 1}.${index + 1}, картинок ${state.images.size}`, 'sweep')
      }
    }
    return total
  }

  const flush = async () => {
    const boardId = state.board.id || currentBoardId()
    mergeBoard({ id: boardId, url: location.href || state.board.url, capturedAt: new Date().toISOString() })
    await post('/meta', {
      version: 1,
      board: state.board,
      itemCount: state.items.size,
      imageCount: state.images.size,
      warnings: state.warnings.slice(0, 40),
      sdkReady: state.sdkReady,
      restOk: state.restOk,
      title: document.title,
      userAgent: navigator.userAgent
    })
    const list = Array.from(state.items.values())
    const chunkSize = 300
    for (let i = 0; i < list.length; i += chunkSize) {
      if (!state.running) break
      await post('/items', list.slice(i, i + chunkSize))
    }
    let index = 0
    for (const [itemId, image] of state.images.entries()) {
      if (!state.running) break
      await post('/image', { itemId, ...image })
      index += 1
      if (index % 2 === 0) log(`Передаём картинки: ${index} из ${state.images.size}`, 'images')
    }
    await post('/done', { itemCount: state.items.size, imageCount: state.images.size, warnings: state.warnings.slice(0, 40) })
    log('Готово', 'done')
  }

  const run = async (trigger) => {
    if (state.running) return
    state.running = true
    updateOverlay()
    try {
      const boardId = currentBoardId()
      if (!boardId) throw new Error('Это не страница доски Miro. Откройте доску и повторите сбор.')
      mergeBoard({ id: boardId, url: location.href })
      const sdkOk = await harvestSdk()
      if (!sdkOk) {
        try {
          const rest = await harvestRest(boardId)
          ingestItems(rest)
        } catch (error) {
          throw new Error('Не удалось получить элементы: ' + text(error).slice(0, 120))
        }
      }
      log('Собираем картинки', 'images')
      const needsImages = imageItems().some((item) => !state.images.has(text(item.id)))
      if (needsImages) {
        try {
          const stats = await harvestImagesRest(boardId)
          log(`Картинок получено: ${stats.done} из ${stats.total}`, 'images')
        } catch (error) {
          state.warnings.push('REST-доступ к картинкам закрыт: ' + text(error).slice(0, 80))
        }
      }
      const stillMissing = imageItems().filter((item) => !state.images.has(text(item.id)))
      if (stillMissing.length) {
        await harvestImagesDom('снимок экрана')
        if (stillMissing.some((item) => !state.images.has(text(item.id)))) {
          await harvestVectorSvg()
        }
      }
      if (imageItems().some((item) => !state.images.has(text(item.id)))) {
        await sweepBoard()
      }
      await flush()
      if (trigger === 'manual') setTimeout(hideOverlay, 2500)
      try {
        window.postMessage({ source: 'liro-collector', status: 'done' }, '*')
      } catch {}
    } catch (error) {
      state.warnings.push(text(error).slice(0, 200))
      log(text(error), 'error')
      try {
        await post('/fail', { error: text(error).slice(0, 400), itemCount: state.items.size })
      } catch {}
      setTimeout(hideOverlay, 6000)
    } finally {
      state.running = false
    }
  }

  const main = (trigger) => {
    try {
      overlay.isConnected || (document.body && document.body.appendChild(overlay))
    } catch {}
    updateOverlay()
    run(trigger)
  }

  updateOverlay()
  main('auto')
})()