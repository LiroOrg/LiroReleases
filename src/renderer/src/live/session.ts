import type { LiveMessage, LiveParticipant } from '@shared/live'

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
]

export const CURSOR_PALETTE = ['#d92b2b', '#1f6feb', '#1a7f37', '#bf8700', '#8250df', '#0b7285', '#c2410c', '#be185d']

export function colorForId(id: string): string {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return CURSOR_PALETTE[hash % CURSOR_PALETTE.length]
}

export function readableOn(color: string): string {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff'
}

export interface RemoteCursor {
  id: string
  name: string
  color: string
  x: number
  y: number
  targetX: number
  targetY: number
  updatedAt: number
  visible: boolean
}

export interface LiveSessionOptions {
  role: 'host' | 'guest'
  selfId: string
  selfName: string
  onMessage: (message: LiveMessage) => void
  onStateChange: (connected: boolean) => void
  onCursor: (cursor: RemoteCursor) => void
  onParticipant: (participant: LiveParticipant) => void
  onPermission: (canEdit: boolean) => void
}

export class LiveSession {
  private currentRole: 'host' | 'guest'
  readonly selfId: string
  readonly selfName: string
  private readonly options: LiveSessionOptions
  private pc: RTCPeerConnection | null = null
  private liveChannel: RTCDataChannel | null = null
  private opsChannel: RTCDataChannel | null = null
  private connected = false
  private closed = false
  private cursorFrame: number | null = null
  private readonly cursors = new Map<string, RemoteCursor>()
  private pingTimer: number | null = null
  private iceCloseTimer: number | null = null
  private lastPongAt = 0
  private pendingPings = new Map<number, number>()
  private ping = 0
  private sent = 0
  private received = 0
  private partnerId = ''
  private partnerName = ''
  private canEdit = false
  private partnerIsHost = false
  private readonly pendingChunks = new Map<string, { total: number; parts: string[]; createdAt: number }>()
  private solidPreview: { id: string; pitch: number; yaw: number; targetPitch: number; targetYaw: number } | null = null

  constructor(options: LiveSessionOptions) {
    this.options = options
    this.currentRole = options.role
    this.selfId = options.selfId
    this.selfName = options.selfName
  }

  get isConnected(): boolean {
    return this.connected
  }

  get isClosed(): boolean {
    return this.closed
  }

  get role(): 'host' | 'guest' {
    return this.currentRole
  }

  get partner(): LiveParticipant | null {
    if (!this.partnerId) return null
    return {
      id: this.partnerId,
      name: this.partnerName,
      color: colorForId(this.partnerId),
      canEdit: this.currentRole === 'host' ? this.canEdit : !this.partnerIsHost,
      host: this.partnerIsHost
    }
  }

  get stats(): { ping: number; sent: number; received: number } {
    return { ping: this.ping, sent: this.sent, received: this.received }
  }

  get remoteCursors(): RemoteCursor[] {
    return [...this.cursors.values()]
  }

  applyHandover(role: 'host' | 'guest'): void {
    this.currentRole = role
    this.partnerIsHost = role === 'guest'
    this.canEdit = true
    const partner = this.partner
    if (partner) this.options.onParticipant(partner)
    this.options.onPermission(true)
  }

  async createOffer(): Promise<string> {
    const pc = this.ensurePeer()
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    await this.waitForGathering(pc)
    return JSON.stringify(pc.localDescription)
  }

  async acceptOffer(offer: string): Promise<string> {
    const pc = this.ensurePeer()
    await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offer)))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await this.waitForGathering(pc)
    return JSON.stringify(pc.localDescription)
  }

  async acceptAnswer(answer: string): Promise<void> {
    const pc = this.ensurePeer()
    await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(answer)))
  }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this.pc = pc
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') this.markConnected()
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.close()
    }
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected') {
        if (this.iceCloseTimer === null && !this.closed) {
          this.iceCloseTimer = window.setTimeout(() => {
            this.iceCloseTimer = null
            if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') this.close()
          }, 5000)
        }
        return
      }
      if (this.iceCloseTimer !== null) {
        window.clearTimeout(this.iceCloseTimer)
        this.iceCloseTimer = null
      }
      if (pc.iceConnectionState === 'failed') this.close()
    }
    pc.ondatachannel = (event) => this.bindChannel(event.channel)
    if (this.currentRole === 'host') {
      this.bindChannel(pc.createDataChannel('liro-live', { ordered: false, maxRetransmits: 0 }))
      this.bindChannel(pc.createDataChannel('liro-ops', { ordered: true }))
    }
    return pc
  }

  private waitForGathering(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') return Promise.resolve()
    return new Promise((resolve) => {
      const done = (): void => {
        pc.removeEventListener('icegatheringstatechange', check)
        clearTimeout(timer)
        resolve()
      }
      const check = (): void => {
        if (pc.iceGatheringState === 'complete') done()
      }
      const timer = window.setTimeout(done, 2500)
      pc.addEventListener('icegatheringstatechange', check)
    })
  }

  private bindChannel(channel: RTCDataChannel): void {
    if (channel.label === 'liro-live') this.liveChannel = channel
    else this.opsChannel = channel
    channel.onopen = () => {
      this.markConnected()
      this.sendOps({ t: 'hello', id: this.selfId, name: this.selfName, color: colorForId(this.selfId), host: this.currentRole === 'host' })
    }
    channel.onmessage = (event) => this.receive(String(event.data))
    channel.onclose = () => this.close()
  }

  private markConnected(): void {
    if (this.connected || this.closed) return
    this.connected = true
    this.lastPongAt = performance.now()
    this.options.onStateChange(true)
    this.startPing()
    this.startCursorLoop()
  }

  private receive(raw: string): void {
    this.received += 1
    let message: LiveMessage
    try {
      message = JSON.parse(raw) as LiveMessage
    } catch {
      return
    }
    if (message.t === 'hello') {
      this.partnerId = message.id
      this.partnerName = message.name || 'Участник'
      this.partnerIsHost = message.host
      this.options.onParticipant(this.partner!)
      return
    }
    if (message.t === 'ping') {
      this.sendOps({ t: 'pong', stamp: message.stamp })
      return
    }
    if (message.t === 'pong') {
      const started = this.pendingPings.get(message.stamp)
      this.lastPongAt = performance.now()
      if (started !== undefined) {
        this.pendingPings.delete(message.stamp)
        this.ping = Math.round(performance.now() - started)
      }
      return
    }
    if (message.t === 'perm') {
      this.canEdit = message.canEdit
      this.options.onParticipant(this.partner ?? {
        id: this.partnerId,
        name: this.partnerName,
        color: colorForId(this.partnerId),
        canEdit: message.canEdit,
        host: this.partnerIsHost
      })
      this.options.onPermission(message.canEdit)
      return
    }
    if (message.t === 'cursor') {
      const existing = this.cursors.get(this.partnerId)
      const visible = message.hidden !== true
      const snap = !existing || !existing.visible || !visible
      const cursor: RemoteCursor = {
        id: this.partnerId,
        name: this.partnerName,
        color: colorForId(this.partnerId),
        x: snap ? message.x : existing!.x,
        y: snap ? message.y : existing!.y,
        targetX: message.x,
        targetY: message.y,
        updatedAt: performance.now(),
        visible
      }
      this.cursors.set(this.partnerId, cursor)
      this.options.onCursor(cursor)
      this.startCursorLoop()
      return
    }
    if (message.t === 'bye') {
      this.close()
      return
    }
    if (message.t === 'preview') {
      if (message.kind === 'solid') {
        if (!this.solidPreview || this.solidPreview.id !== message.id) {
          this.solidPreview = {
            id: message.id,
            pitch: message.pitch,
            yaw: message.yaw,
            targetPitch: message.pitch,
            targetYaw: message.yaw
          }
        } else {
          this.solidPreview.targetPitch = message.pitch
          this.solidPreview.targetYaw = message.yaw
        }
        this.options.onMessage({
          t: 'preview',
          kind: 'solid',
          id: this.solidPreview.id,
          pitch: this.solidPreview.pitch,
          yaw: this.solidPreview.yaw
        })
        this.startCursorLoop()
        return
      }
      if (message.kind === 'clear') {
        this.solidPreview = null
        this.options.onMessage(message)
        return
      }
      this.options.onMessage(message)
      return
    }
    if (message.t === 'chunk') {
      const pending = this.pendingChunks.get(message.id)
      if (!pending) {
        this.pendingChunks.set(message.id, { total: message.total, parts: new Array(message.total).fill(''), createdAt: Date.now() })
      }
      const target = this.pendingChunks.get(message.id)!
      target.parts[message.index] = message.payload
      if (target.parts.every((part) => part !== '' || message.total === 1)) {
        const whole = target.parts.join('')
        this.pendingChunks.delete(message.id)
        this.options.onMessage({ t: 'chunk', id: message.id, index: 0, total: 1, payload: whole })
      }
      return
    }
    this.options.onMessage(message)
  }

  sendChunked(id: string, payload: string): void {
    const limit = 24000
    const total = Math.max(1, Math.ceil(payload.length / limit))
    for (let index = 0; index < total; index += 1) {
      this.sendOps({
        t: 'chunk',
        id,
        index,
        total,
        payload: payload.slice(index * limit, (index + 1) * limit)
      })
    }
  }

  sendLive(message: LiveMessage): void {
    const channel = this.liveChannel
    if (!channel || channel.readyState !== 'open') return
    try {
      channel.send(JSON.stringify(message))
      this.sent += 1
    } catch {
      return
    }
  }

  sendOps(message: LiveMessage): void {
    const channel = this.opsChannel
    if (!channel || channel.readyState !== 'open') return
    try {
      channel.send(JSON.stringify(message))
      this.sent += 1
    } catch {
      return
    }
  }

  setPermission(canEdit: boolean): void {
    this.canEdit = canEdit
    this.sendOps({ t: 'perm', canEdit })
  }

  get partnerCanEdit(): boolean {
    return this.currentRole === 'host' ? this.canEdit : !this.partnerIsHost
  }

  private startPing(): void {
    if (this.pingTimer !== null) return
    const beat = (): void => {
      if (this.lastPongAt !== 0 && performance.now() - this.lastPongAt > 15000) {
        this.close()
        return
      }
      const now = Date.now()
      for (const [id, pending] of this.pendingChunks) {
        if (now - pending.createdAt > 60000) this.pendingChunks.delete(id)
      }
      const stamp = Date.now()
      this.pendingPings.set(stamp, performance.now())
      if (this.pendingPings.size > 20) {
        const oldest = this.pendingPings.keys().next().value
        if (oldest !== undefined) this.pendingPings.delete(oldest)
      }
      this.sendOps({ t: 'ping', stamp })
    }
    beat()
    this.pingTimer = window.setInterval(beat, 3000)
  }

  private startCursorLoop(): void {
    if (this.cursorFrame !== null) return
    let previous = performance.now()
    const step = (): void => {
      const now = performance.now()
      const dt = Math.min(80, Math.max(8, now - previous))
      previous = now
      const factor = 1 - Math.exp(-dt / 38)
      let changed = false
      if (this.solidPreview) {
        const dp = this.solidPreview.targetPitch - this.solidPreview.pitch
        const dy = this.solidPreview.targetYaw - this.solidPreview.yaw
        if (Math.abs(dp) > 0.03 || Math.abs(dy) > 0.03) {
          this.solidPreview.pitch += dp * factor
          this.solidPreview.yaw += dy * factor
          changed = true
          this.options.onMessage({
            t: 'preview',
            kind: 'solid',
            id: this.solidPreview.id,
            pitch: this.solidPreview.pitch,
            yaw: this.solidPreview.yaw
          })
        }
      }
      for (const cursor of this.cursors.values()) {
        if (now - cursor.updatedAt > 4000) {
          if (cursor.visible) {
            this.options.onCursor({ ...cursor, visible: false })
          }
          this.cursors.delete(cursor.id)
          continue
        }
        if (!cursor.visible) continue
        const dx = cursor.targetX - cursor.x
        const dy = cursor.targetY - cursor.y
        if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) continue
        cursor.x += dx * factor
        cursor.y += dy * factor
        changed = true
        this.options.onCursor(cursor)
      }
      if (!changed) {
        this.cursorFrame = null
        return
      }
      this.cursorFrame = requestAnimationFrame(step)
    }
    this.cursorFrame = requestAnimationFrame(step)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    if (this.connected) this.sendOps({ t: 'bye' })
    this.connected = false
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer)
      this.pingTimer = null
    }
    if (this.iceCloseTimer !== null) {
      window.clearTimeout(this.iceCloseTimer)
      this.iceCloseTimer = null
    }
    if (this.cursorFrame !== null) {
      cancelAnimationFrame(this.cursorFrame)
      this.cursorFrame = null
    }
    this.solidPreview = null
    this.cursors.clear()
    this.liveChannel?.close()
    this.opsChannel?.close()
    this.pc?.close()
    this.pc = null
    this.options.onStateChange(false)
  }
}
