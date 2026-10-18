import { BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'node:path'
import collectorSource from '@shared/page-collector.js?raw'
import { CollectorServer, type CollectedBoard } from './server'
import { buildDoc, commitDoc } from './commit'
import { parseBoardRef } from '@shared/util'
import type { CaptureSnapshot } from '@shared/api'
import type { BoardMeta } from '@shared/types'

export interface CaptureState {
  port: number
  token: string
  snapshot: CaptureSnapshot | null
}

export class CaptureManager {
  readonly server: CollectorServer
  private window: BrowserWindow | null = null
  private lastError: string | null = null
  private lastBoardName = ''
  private title = ''
  private url = ''

  constructor(
    private readonly onSnapshot: (snapshot: CaptureSnapshot) => void,
    private readonly onEvent: (event: { kind: string; text: string }) => void
  ) {
    this.server = new CollectorServer(
      (board) => this.handleBoard(board),
      (event) => this.onEvent(event)
    )
    ipcMain.on('source:bridge', (_event, message: { type: string; payload: { path: string; payload: unknown } }) => {
      if (!message || message.type !== 'collect') return
      this.server.ingest(message.payload?.path ?? '', message.payload?.payload)
    })
  }

  async start(preferredPort?: number, token?: string): Promise<{ port: number; token: string }> {
    return this.server.start(preferredPort, token)
  }

  get port(): number {
    return this.server.port
  }

  get token(): string {
    return this.server.token
  }

  private handleBoard(board: CollectedBoard | null): void {
    if (!board) {
      this.onSnapshot(this.snapshotOf(null))
      return
    }
    if (typeof board.board?.name === 'string' && board.board.name) this.lastBoardName = board.board.name
    if (typeof board.board?.title === 'string' && board.board.title) this.lastBoardName = board.board.title
    if (typeof board.board?.url === 'string' && board.board.url) this.url = board.board.url
    this.onSnapshot(this.snapshotOf(board))
  }

  private snapshotOf(board: CollectedBoard | null): CaptureSnapshot {
    const items = board?.items.length ?? 0
    const images = board?.images.size ?? 0
    const status: CaptureSnapshot['status'] = !board
      ? 'idle'
      : board.status === 'ready'
        ? 'done'
        : board.status === 'failed'
          ? 'error'
          : items > 0
            ? 'collecting'
            : 'loading'
    return {
      sessionId: 'local',
      status,
      boardTitle: this.lastBoardName || undefined,
      url: this.url || undefined,
      items,
      assets: images,
      bounds: (board?.board?.bounds as { x: number; y: number; width: number; height: number }) ?? undefined,
      warnings: board?.warnings ?? [],
      needsLogin: false,
      message: board?.error ?? undefined
    }
  }

  snapshot(): CaptureSnapshot {
    return this.snapshotOf(this.server.active)
  }

  get error(): string | null {
    return this.lastError
  }

  setError(message: string | null): void {
    this.lastError = message
  }

  openEmbedded(url: string): boolean {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus()
      this.window.loadURL(url).catch(() => undefined)
      return true
    }
    const partition = 'persist:source'
    session.fromPartition(partition)
    this.window = new BrowserWindow({
      width: 1440,
      height: 900,
      title: 'Сбор доски в Liro',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: {
        partition,
        preload: join(__dirname, '../preload/capture.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    })
    this.window.on('closed', () => {
      this.window = null
    })
    const inject = (): void => {
      if (!this.window || this.window.isDestroyed()) return
      this.window.webContents
        .executeJavaScript(`window.__LIRO_CFG=${JSON.stringify({ port: this.port, token: this.token, endpoint: '/collect' })};${collectorSource}`, true)
        .catch(() => undefined)
    }
    this.window.webContents.on('did-finish-load', inject)
    this.window.webContents.on('did-navigate-in-page', inject)
    this.window.loadURL(url).catch(() => undefined)
    return true
  }

  closeEmbedded(): void {
    if (this.window && !this.window.isDestroyed()) this.window.close()
    this.window = null
  }

  async save(options: { title?: string; projectId?: string }): Promise<BoardMeta> {
    const board = this.server.active
    if (!board) throw new Error('Нет собранных данных. Запустите сбор на странице доски.')
    if (!board.items.length) throw new Error('Собранная доска пуста')
    const boardId = String(board.board?.id ?? '') || parseBoardRef(String(board.board?.url ?? '')).boardId
    const title = options.title?.trim() || this.lastBoardName || 'Доска'
    const bounds = board.board?.bounds as { x: number; y: number; width: number; height: number } | undefined
    const result = buildDoc({
      title,
      rawItems: board.items,
      images: board.images,
      source: {
        kind: 'page-capture',
        url: String(board.board?.url ?? this.url ?? ''),
        boardId,
        name: title
      },
      projectId: options.projectId,
      warnings: board.warnings,
      bounds: bounds && bounds.width > 0 && bounds.height > 0 ? bounds : undefined
    })
    const meta = commitDoc(result.doc)
    this.server.reset()
    this.lastBoardName = ''
    return meta
  }

  reset(): void {
    this.server.reset()
    this.lastBoardName = ''
  }

  dispose(): void {
    this.closeEmbedded()
    this.server.stop()
  }
}