import type { BoardDoc, BoardItem, Rect } from '@shared/types'
import { clamp, parseBoardRef, roundRect, uid } from '@shared/util'
import { normalizeItems, type RawItem } from './normalize'
import { AssetStore } from './assets'
import { buildStats, commitDoc } from './commit'
import { store as library } from '../store'

const API = 'https://api.miro.com/v2'
const PAGE = 50

interface SourceBoardResponse {
  id: string
  name?: string
  description?: string
  teamId?: string
  team?: { id?: string; name?: string }
  viewLink?: string
  createdAt?: string
  modifiedAt?: string
}

export interface SourceBoardSummary {
  id: string
  name: string
  description?: string
  viewLink: string
  teamId?: string
  modifiedAt?: string
}

export type ProgressFn = (
  message: string,
  percent: number,
  extra?: { items?: number; detail?: string; warnings?: string[] }
) => void

export class SourceApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message)
  }
}

const TYPE_ENDPOINTS: Record<string, string> = {
  sticky_note: 'sticky_notes',
  shape: 'shapes',
  text: 'texts',
  card: 'cards',
  frame: 'frames',
  app_card: 'app_cards',
  embed: 'embeds',
  doc_format: 'docs',
  document: 'docs',
  image: 'images'
}

const STYLE_TYPES = new Set(['sticky_note', 'shape', 'text', 'card', 'frame', 'app_card', 'embed'])

async function apiFetch<T>(url: string, token: string, attempt = 0): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
  } catch (error) {
    throw new SourceApiError('Нет связи с сервером. Проверьте VPN и подключение к интернету.')
  }
  if (response.status === 429 && attempt < 5) {
    const reset = Number(response.headers.get('X-RateLimit-Reset') ?? '0')
    const waitMs = reset > 0 ? Math.min(60000, Math.max(1500, (reset * 1000 - Date.now()) + 500)) : 2000 * (attempt + 1)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
    return apiFetch<T>(url, token, attempt + 1)
  }
  if (!response.ok) {
    const map: Record<number, string> = {
      400: 'Некорректный запрос к API доски',
      401: 'Токен недействителен или истёк. Получите свежий access token.',
      403: 'Нет доступа к этой доске: проверьте права и scope токена.',
      404: 'Доска не найдена: проверьте ссылку или идентификатор.',
      429: 'Превышен лимит запросов. Подождите и повторите.'
    }
    throw new SourceApiError(map[response.status] ?? `Ошибка API доски: ${response.status}`, response.status)
  }
  return (await response.json()) as T
}

export async function listBoards(token: string, teamId: string): Promise<SourceBoardSummary[]> {
  const out: SourceBoardSummary[] = []
  let offset = 0
  for (let page = 0; page < 40; page++) {
    const url = new URL(`${API}/boards`)
    url.searchParams.set('team_id', teamId)
    url.searchParams.set('limit', '50')
    url.searchParams.set('offset', String(offset))
    const body = await apiFetch<{ data?: SourceBoardResponse[]; total?: number; size?: number }>(url.toString(), token)
    for (const board of body.data ?? []) {
      out.push({
        id: board.id,
        name: board.name ?? 'Без названия',
        description: board.description,
        viewLink: board.viewLink ?? `https://miro.com/app/board/${encodeURIComponent(board.id)}/`,
        teamId: board.teamId ?? board.team?.id,
        modifiedAt: board.modifiedAt
      })
    }
    offset += body.size ?? body.data?.length ?? 0
    if (!body.data?.length || offset >= (body.total ?? 0)) break
  }
  return out
}

async function fetchAllCursor<T>(path: string, token: string, onPage: (items: T[]) => void): Promise<void> {
  let cursor = ''
  for (let page = 0; page < 6000; page++) {
    const url = new URL(`${API}${path}`)
    url.searchParams.set('limit', String(PAGE))
    if (cursor) url.searchParams.set('cursor', cursor)
    const body = await apiFetch<{ data?: T[]; cursor?: string; size?: number }>(url.toString(), token)
    const data = body.data ?? []
    if (data.length) onPage(data)
    const next = body.cursor ?? ''
    if (!next || next === cursor || !data.length) break
    cursor = next
  }
}

export interface ApiImportOptions {
  token: string
  boardRef: string
  title?: string
  projectId?: string
  downloadImages: boolean
  withStyles: boolean
  maxImageBytes: number
  signal?: AbortSignal
  onProgress: ProgressFn
}

export interface ApiImportResult {
  meta: import('@shared/types').BoardMeta
  warnings: string[]
}

export async function importFromApi(options: ApiImportOptions): Promise<ApiImportResult> {
  const { token } = options
  const { boardId } = parseBoardRef(options.boardRef)
  if (!boardId) throw new SourceApiError('Укажите ссылку на доску или её идентификатор')
  const warnings: string[] = []
  const docId = uid('bd_')

  options.onProgress('Получаем данные доски', 2)
  const board = await apiFetch<SourceBoardResponse>(`${API}/boards/${encodeURIComponent(boardId)}`, token)

  const raws: RawItem[] = []
  let total = 0
  await fetchAllCursor<RawItem>(`/boards/${encodeURIComponent(boardId)}/items`, token, (page) => {
    raws.push(...page)
    total += page.length
    options.onProgress('Собираем список элементов', clamp(4 + total * 0.004, 4, 24), { items: raws.length })
  })

  await fetchAllCursor<RawItem>(`/boards/${encodeURIComponent(boardId)}/connectors`, token, (page) => {
    raws.push(...page.map((item) => ({ ...item, type: 'connector' })))
  })

  try {
    await fetchAllCursor<RawItem>(`/boards/${encodeURIComponent(boardId)}/groups`, token, (page) => {
      raws.push(...page.map((item) => ({ ...item, type: 'group' })))
    })
  } catch {
    warnings.push('Группы не загружены')
  }

  if (options.withStyles) {
    await enrichStyles(token, boardId, raws, options, warnings)
  } else {
    warnings.push('Стили элементов не загружены: цвета и шрифты могут отличаться от оригинала')
  }

  if (raws.length === 0) throw new SourceApiError('Доска пуста или элементы недоступны для этого токена')

  options.onProgress('Приводим элементы к единому виду', 52, { items: raws.length })
  const normalized = normalizeItems(raws)
  warnings.push(...normalized.warnings)

  const assets = new AssetStore(docId, { token, maxBytes: options.maxImageBytes, boardId }, 'original')
  const mediaItems = normalized.items.filter((item) => hasMedia(item))
  let done = 0
  let failed = 0
  if (options.downloadImages && mediaItems.length) {
    options.onProgress('Скачиваем изображения', 56, { detail: `0 из ${mediaItems.length}` })
    for (const item of mediaItems) {
      if (options.signal?.aborted) throw new SourceApiError('Импорт отменён')
      const url = mediaUrlOf(item)
      if (!url) continue
      const result = await assets.download(url, mediaMimeOf(item))
      done += 1
      if (result) {
        attachMedia(item, result.ref)
      } else {
        failed += 1
        if (failed <= 4) warnings.push(`Не удалось скачать файл: ${url.slice(0, 80)}`)
      }
      if (done % 3 === 0 || done === mediaItems.length) {
        options.onProgress('Скачиваем изображения', clamp(56 + (done / mediaItems.length) * 34, 56, 90), {
          detail: `${done - failed} из ${mediaItems.length}`
        })
      }
    }
  }

  options.onProgress('Сохраняем доску', 94)
  const bounds = roundRect(computeBounds(normalized.items))
  const title = options.title?.trim() || board.name || 'Доска'
  const doc: BoardDoc = {
    schemaVersion: 1,
    id: docId,
    title,
    description: board.description,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    bounds,
    viewport: { x: bounds.x, y: bounds.y, zoom: clamp(Math.min(bounds.width, bounds.height) / 1400, 0.02, 1) },
    items: normalized.items,
    assets: assets.refs,
    stats: buildStats(normalized.items, assets.totalBytes()),
    source: {
      kind: 'server-api',
      url: board.viewLink ?? `https://miro.com/app/board/${encodeURIComponent(boardId)}/`,
      boardId,
      teamId: board.teamId ?? board.team?.id,
      name: board.name,
      importedAt: new Date().toISOString(),
      itemCount: normalized.items.length,
      notes: warnings.slice(0, 24)
    },
    projectId: options.projectId,
    tags: [],
    favorite: false,
    archived: false
  }
  library.createDoc(docId, doc)
  const meta = library.meta(docId)!
  options.onProgress('Готово', 100, { items: normalized.items.length })
  return { meta, warnings }
}

async function enrichStyles(
  token: string,
  boardId: string,
  raws: RawItem[],
  options: ApiImportOptions,
  warnings: string[]
): Promise<void> {
  const targets = raws.filter((raw) => STYLE_TYPES.has(String(raw.type).toLowerCase()))
  if (!targets.length) return
  const total = targets.length
  let done = 0
  let index = 0
  let rateLimited = 0
  const workers = Array.from({ length: 6 }, async () => {
    while (index < targets.length) {
      const raw = targets[index]
      index += 1
      const endpoint = TYPE_ENDPOINTS[String(raw.type).toLowerCase()]
      if (!endpoint) continue
      try {
        const detail = await apiFetch<RawItem>(
          `${API}/boards/${encodeURIComponent(boardId)}/${endpoint}/${encodeURIComponent(String(raw.id))}`,
          token
        )
        if (detail) {
          raw.style = { ...(raw.style ?? {}), ...(detail.style ?? {}) }
          if (!raw.data) raw.data = {}
          if (detail.data && Object.keys(raw.data).length === 0) raw.data = detail.data
        }
      } catch (error) {
        if (error instanceof SourceApiError && error.status === 429) rateLimited += 1
      }
      done += 1
      if (done % 25 === 0) {
        options.onProgress('Загружаем стили элементов', clamp(24 + (done / total) * 28, 24, 52), {
          detail: `${done} из ${total}`
        })
      }
    }
  })
  await Promise.all(workers)
  if (rateLimited > 0) warnings.push(`Часть стилей не загружена из-за лимитов (${rateLimited})`)
}

function hasMedia(item: BoardItem): boolean {
  if (item.kind === 'image') return !!item.asset?.sourceUrl
  if (item.kind === 'card') return !!item.thumbnail?.sourceUrl
  if (item.kind === 'embed') return !!item.asset?.sourceUrl
  if (item.kind === 'document') return !!item.asset?.sourceUrl
  if (item.kind === 'video') return !!item.asset?.sourceUrl
  return false
}

function mediaUrlOf(item: BoardItem): string | undefined {
  if (item.kind === 'image') return item.asset?.sourceUrl
  if (item.kind === 'card') return item.thumbnail?.sourceUrl
  if (item.kind === 'embed') return item.asset?.sourceUrl
  if (item.kind === 'document') return item.asset?.sourceUrl
  if (item.kind === 'video') return item.asset?.sourceUrl
  return undefined
}

function mediaMimeOf(item: BoardItem): string | undefined {
  if (item.kind === 'image') return item.asset?.mime
  if (item.kind === 'card') return item.thumbnail?.mime
  if (item.kind === 'embed') return item.asset?.mime
  if (item.kind === 'document') return item.asset?.mime
  if (item.kind === 'video') return item.asset?.mime
  return undefined
}

function attachMedia(item: BoardItem, ref: import('@shared/types').AssetRef): void {
  if (item.kind === 'image') item.asset = { ...ref, local: true }
  if (item.kind === 'card' && item.thumbnail) item.thumbnail = { ...ref, local: true }
  if ((item.kind === 'embed' || item.kind === 'document' || item.kind === 'video') && item.asset)
    item.asset = { ...ref, local: true }
}

function computeBounds(items: BoardItem[]): Rect {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const item of items) {
    if (item.kind === 'connector') continue
    minX = Math.min(minX, item.x)
    minY = Math.min(minY, item.y)
    maxX = Math.max(maxX, item.x + Math.max(1, item.w))
    maxY = Math.max(maxY, item.y + Math.max(1, item.h))
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 2400, height: 1600 }
  const padding = 140
  return { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 }
}

export { commitDoc }