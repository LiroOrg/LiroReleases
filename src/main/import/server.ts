import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import type { RawItem } from './normalize'

export interface CollectedImage {
  mime: string
  dataUrl: string
  bytes: number
  label?: string
}

export interface CollectedBoard {
  id: string
  status: 'receiving' | 'ready' | 'failed'
  board: Record<string, unknown>
  items: RawItem[]
  images: Map<string, CollectedImage>
  warnings: string[]
  startedAt: string
  updatedAt: string
  sdkReady: boolean
  restOk: boolean
  error?: string
}

const MAX_BODY = 256 * 1024 * 1024

export class CollectorServer {
  private server: Server | null = null
  private board: CollectedBoard | null = null
  private currentToken = ''
  private portValue = 0

  constructor(
    private readonly onChange: (board: CollectedBoard | null) => void,
    private readonly onEvent: (event: { kind: string; text: string }) => void
  ) {}

  get port(): number {
    return this.portValue
  }

  get token(): string {
    return this.currentToken
  }

  get active(): CollectedBoard | null {
    return this.board
  }

  async start(preferredPort = 47811, token?: string): Promise<{ port: number; token: string }> {
    this.currentToken = (token ?? '').trim() || randomBytes(16).toString('hex')
    const ports = [preferredPort, preferredPort + 1, preferredPort + 2, preferredPort + 3]
    for (const port of ports) {
      try {
        const server = createServer((req, res) => {
          void this.handle(req, res)
        })
        await new Promise<void>((resolve, reject) => {
          server.once('error', reject)
          server.listen(port, '127.0.0.1', () => resolve())
        })
        server.removeAllListeners('error')
        server.on('error', (error) => this.onEvent({ kind: 'error', text: `Сервер сбора: ${String(error)}` }))
        this.server = server
        this.portValue = port
        this.onEvent({ kind: 'server', text: `Сервер сбора слушает 127.0.0.1:${port}` })
        return { port, token: this.currentToken }
      } catch (error) {
        const code = (error as { code?: string }).code
        if (code !== 'EADDRINUSE') throw error
      }
    }
    throw new Error('Не удалось занять локальный порт для приёма данных')
  }

  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = null
    }
    this.portValue = 0
  }

  reset(): void {
    this.board = null
    this.onChange(null)
  }

  private cors(res: ServerResponse): void {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-liro-token')
    res.setHeader('Access-Control-Allow-Private-Network', 'true')
    res.setHeader('Access-Control-Max-Age', '600')
    res.setHeader('Cache-Control', 'no-store')
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    this.cors(res)
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.portValue}`)
    const path = url.pathname
    if (req.method === 'GET') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      if (path === '/config') {
        res.end(JSON.stringify({ app: 'Liro', port: this.portValue, token: this.currentToken, endpoint: '/collect' }))
        return
      }
      const state = this.board
      res.end(
        JSON.stringify({
          ok: true,
          app: 'Liro',
          port: this.portValue,
          status: state?.status ?? 'idle',
          items: state?.items.length ?? 0,
          images: state?.images.size ?? 0
        })
      )
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const token = String(req.headers['x-liro-token'] ?? url.searchParams.get('t') ?? '')
    if (token !== this.currentToken) {
      this.onEvent({
        kind: 'error',
        text: `Запрос сбора отклонён: неверный токен (${path}). Обновите расширение или закладку в Liro и повторите сбор.`
      })
      res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: false, error: 'invalid token', retryConfig: true, path }))
      return
    }
    let body: any = null
    try {
      body = await readJson(req)
    } catch (error) {
      res.writeHead(400)
      res.end(JSON.stringify({ ok: false, error: String(error) }))
      return
    }
    const ok = this.apply(path, body)
    res.writeHead(ok ? 200 : 400, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok, status: this.board?.status ?? 'idle', items: this.board?.items.length ?? 0 }))
  }

  ingest(path: string, body: unknown): boolean {
    return this.apply(path, body)
  }

  private apply(path: string, body: any): boolean {
    const now = new Date().toISOString()
    switch (path) {
      case '/collect/meta': {
        this.board = {
          id: String(body?.board?.id ?? 'board'),
          status: 'receiving',
          board: (body?.board ?? {}) as Record<string, unknown>,
          items: [],
          images: new Map(),
          warnings: Array.isArray(body?.warnings) ? body.warnings.slice(0, 60) : [],
          startedAt: now,
          updatedAt: now,
          sdkReady: body?.sdkReady === true,
          restOk: body?.restOk === true
        }
        this.onEvent({ kind: 'meta', text: `Получена доска ${String(body?.board?.id ?? '')}` })
        this.onChange(this.board)
        return true
      }
      case '/collect/items': {
        if (!this.board) return false
        const list = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : []
        this.board.items.push(...(list as RawItem[]))
        this.board.updatedAt = now
        this.onChange(this.board)
        return true
      }
      case '/collect/image': {
        if (!this.board) return false
        const id = String(body?.itemId ?? '')
        const dataUrl = String(body?.dataUrl ?? '')
        if (!id || !dataUrl) return false
        this.board.images.set(id, {
          mime: String(body?.mime ?? 'image/png'),
          dataUrl,
          bytes: Number(body?.bytes ?? Math.round(dataUrl.length * 0.75)),
          label: String(body?.label ?? '')
        })
        this.board.updatedAt = now
        this.onEvent({ kind: 'image', text: `Картинка получена (${this.board.images.size})` })
        this.onChange(this.board)
        return true
      }
      case '/collect/done': {
        if (!this.board) return false
        this.board.status = 'ready'
        this.board.updatedAt = now
        if (Array.isArray(body?.warnings)) this.board.warnings.push(...body.warnings.slice(0, 20))
        this.onEvent({ kind: 'done', text: `Сбор завершён: ${this.board.items.length} элементов` })
        this.onChange(this.board)
        return true
      }
      case '/collect/fail': {
        if (!this.board) return false
        this.board.status = 'failed'
        this.board.error = String(body?.error ?? 'Неизвестная ошибка')
        this.board.updatedAt = now
        this.onEvent({ kind: 'fail', text: `Сбор не удался: ${this.board.error}` })
        this.onChange(this.board)
        return true
      }
      default:
        return false
    }
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('Слишком большой объём данных'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (!chunks.length) {
        resolve(null)
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        reject(new Error('Некорректный JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) return null
  const mime = match[1] ?? 'application/octet-stream'
  const isBase64 = !!match[2]
  const payload = match[3]
  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8')
    return { buffer, mime }
  } catch {
    return null
  }
}