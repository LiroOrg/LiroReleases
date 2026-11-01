import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LiveMessage, LiveParticipant, LivePreview } from '@shared/live'
import type { BoardDoc } from '@shared/types'
import { api } from '../lib/api'
import { useApp } from '../lib/store'
import { LiveSession, colorForId } from './session'
import type { RemoteCursor } from './session'
import { clearGuestBoardId, getGuestBoardId } from './guestBoard'

export type LiveRole = 'host' | 'guest'

export interface LiveBoardBridge {
  role: LiveRole
  code: string | null
  partner: LiveParticipant | null
  partnerAway: boolean
  ping: number
  connected: boolean
  canEdit: boolean
  preparing: boolean
  watching: boolean
  following: boolean
  cursors: RemoteCursor[]
  preview: LivePreview | null
  startHost: (getDoc: () => BoardDoc | null) => Promise<void>
  joinGuest: (code: string, doc: BoardDoc, offer?: string) => Promise<void>
  leave: () => void
  leaveAndCleanup: () => void
  togglePermission: (canEdit: boolean) => void
  pullPartner: (viewport: { x: number; y: number; zoom: number }) => void
  watchPartner: () => void
  stopFollow: () => void
  transferHost: () => void
  onRemoteOps: (handler: (message: LiveMessage) => void) => void
  onRemoteViewport: (handler: (viewport: { x: number; y: number; zoom: number; ask?: boolean }) => void) => void
  onRemoteChunk: (handler: (id: string, payload: string) => void) => void
  onChunkProgress: (handler: (id: string, done: number, total: number) => void) => void
  sendCursor: (x: number, y: number) => void
  sendPreview: (preview: LivePreview) => void
  clearRemotePreview: () => void
  hideCursor: () => void
  sendOps: (message: LiveMessage) => void
  sendChunked: (id: string, payload: string) => void
}

function randomId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function sendSnapshot(session: LiveSession, getDoc: () => BoardDoc | null): void {
  const timer = window.setInterval(() => {
    if (session.isConnected) {
      window.clearInterval(timer)
      const doc = getDoc()
      if (doc) session.sendChunked('snapshot', JSON.stringify({ title: doc.title, items: doc.items }))
      return
    }
    if (session.isClosed) window.clearInterval(timer)
  }, 250)
}

export function useLiveBoard(options: { userName: string }): LiveBoardBridge {
  const toast = useApp((state) => state.toast)
  const [role, setRole] = useState<LiveRole>('host')
  const [code, setCode] = useState<string | null>(null)
  const [partner, setPartner] = useState<LiveParticipant | null>(null)
  const [ping, setPing] = useState(0)
  const [connected, setConnected] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [watching, setWatching] = useState(false)
  const [following, setFollowing] = useState(false)
  const [cursors, setCursors] = useState<RemoteCursor[]>([])
  const [preview, setPreview] = useState<LivePreview | null>(null)
  const sessionRef = useRef<LiveSession | null>(null)
  const opsHandlerRef = useRef<((message: LiveMessage) => void) | null>(null)
  const chunkHandlerRef = useRef<((id: string, payload: string) => void) | null>(null)
  const chunkProgressHandlerRef = useRef<((id: string, done: number, total: number) => void) | null>(null)
  const viewportHandlerRef = useRef<((viewport: { x: number; y: number; zoom: number; ask?: boolean }) => void) | null>(null)
  const cursorTimerRef = useRef<number | null>(null)
  const pendingCursorRef = useRef<{ x: number; y: number; hidden: boolean } | null>(null)
  const selfIdRef = useRef(randomId())
  const canEditRef = useRef(false)
  const codeRef = useRef<string | null>(null)
  const roleRef = useRef<LiveRole>('host')
  const lastCursorSentRef = useRef(0)
  const lastCursorRef = useRef<{ x: number; y: number } | null>(null)
  const minimizedRef = useRef(false)
  const focusedRef = useRef(true)
  const wasConnectedRef = useRef(false)
  const leavingRef = useRef(false)
  const armSeqRef = useRef(0)
  const hadPartnerRef = useRef(false)
  const hostDocRef = useRef<(() => BoardDoc | null) | null>(null)
  const rearmRef = useRef<() => void>(() => undefined)

  const handleMessage = useCallback((message: LiveMessage): void => {
    if (message.t === 'viewport') {
      viewportHandlerRef.current?.(message)
      return
    }
    if (message.t === 'watch') {
      setWatching(message.on)
      return
    }
    if (message.t === 'handover') {
      roleRef.current = 'host'
      setRole('host')
      canEditRef.current = true
      sessionRef.current?.applyHandover('host')
      toast('Вы теперь ведущий совместной сессии', 'lead')
      return
    }
    if (message.t === 'chunk') {
      chunkHandlerRef.current?.(message.id, message.payload)
      return
    }
    if (message.t === 'preview') {
      setPreview(message.kind === 'clear' ? null : message)
      return
    }
    opsHandlerRef.current?.(message)
  }, [toast])

  const createSession = useCallback(
    (role: LiveRole): LiveSession => {
      const session = new LiveSession({
        role,
        selfId: selfIdRef.current,
        selfName: options.userName || (role === 'host' ? 'Хост' : 'Гость'),
        onMessage: handleMessage,
        onStateChange: (value) => {
          setConnected(value)
          if (value) {
            wasConnectedRef.current = true
          } else if (wasConnectedRef.current && !leavingRef.current) {
            wasConnectedRef.current = false
            toast('Партнёр отключился', 'live-out')
          }
          if (!value) {
            setPartner(null)
            setCursors([])
            setPreview(null)
            setWatching(false)
            setFollowing(false)
          }
        },
        onCursor: (cursor) => {
          setCursors((current) => {
            const next = current.filter((item) => item.id !== cursor.id)
            if (cursor.visible) next.push(cursor)
            return next
          })
        },
        onParticipant: (value) => setPartner(value),
        onPermission: (value) => {
          setCanEdit(roleRef.current === 'guest' ? value : canEditRef.current)
        },
        onChunkProgress: (id, done, total) => {
          chunkProgressHandlerRef.current?.(id, done, total)
        }
      })
      sessionRef.current = session
      leavingRef.current = false
      setRole(role)
      roleRef.current = role
      return session
    },
    [handleMessage, options.userName, toast]
  )

  const armHost = useCallback(
    async (inviteCode: string): Promise<void> => {
      const seq = ++armSeqRef.current
      const alive = (): boolean => seq === armSeqRef.current && codeRef.current === inviteCode && !leavingRef.current
      const getDoc = hostDocRef.current
      if (!getDoc) return
      setPreparing(true)
      const session = createSession('host')
      try {
        const offer = await session.createOffer()
        await api.live.hostCreate(offer, inviteCode)
      } catch {
        session.close()
        if (alive()) window.setTimeout(() => rearmRef.current(), 3000)
        return
      }
      if (!alive()) {
        session.close()
        return
      }
      setPreparing(false)
      let answer: string | null = null
      let lost = false
      try {
        answer = await api.live.hostWait(inviteCode)
      } catch {
        lost = true
      }
      if (answer) {
        try {
          await session.acceptAnswer(answer)
        } catch {
          lost = true
          answer = null
        }
      }
      if (!alive()) {
        session.close()
        return
      }
      if (!answer) {
        session.close()
        await api.live.hostCleanup(inviteCode).catch(() => undefined)
        if (!leavingRef.current && seq === armSeqRef.current) window.setTimeout(() => rearmRef.current(), lost ? 3000 : 1200)
        return
      }
      await api.live.hostCleanup(inviteCode).catch(() => undefined)
      sendSnapshot(session, getDoc)
    },
    [createSession]
  )

  const startHost = useCallback(
    async (getDoc: () => BoardDoc | null): Promise<void> => {
      if (codeRef.current) return
      const doc = getDoc()
      if (!doc) return
      const stored = await api.board.workspace.get(doc.id).catch(() => null)
      const inviteCode = (stored && stored.invite) || (await api.live.hostCode())
      if (!stored || stored.invite !== inviteCode) void api.board.workspace.set(doc.id, { invite: inviteCode }).catch(() => undefined)
      hostDocRef.current = getDoc
      setCode(inviteCode)
      codeRef.current = inviteCode
      await armHost(inviteCode)
    },
    [armHost]
  )

  const joinGuest = useCallback(
    async (inviteCode: string, doc: BoardDoc, sourceOffer?: string): Promise<void> => {
      const session = createSession('guest')
      try {
        const offer = sourceOffer ?? (await api.live.guestFetch(inviteCode))
        if (!offer) {
          session.close()
          setCode(null)
          codeRef.current = null
          return
        }
        const answer = await session.acceptOffer(offer)
        await api.live.guestAnswer(inviteCode, answer)
      } catch (error) {
        session.close()
        throw error
      }
      setCode(inviteCode)
      codeRef.current = inviteCode
      setCanEdit(false)
    },
    [createSession]
  )

  const leave = useCallback((): void => {
    const room = codeRef.current
    leavingRef.current = true
    armSeqRef.current += 1
    hadPartnerRef.current = false
    hostDocRef.current = null
    sessionRef.current?.close()
    sessionRef.current = null
    setCode(null)
    codeRef.current = null
    setPartner(null)
    setConnected(false)
    setCanEdit(false)
    setPreparing(false)
    setCursors([])
    lastCursorRef.current = null
    setWatching(false)
    setFollowing(false)
    if (cursorTimerRef.current !== null) {
      window.clearInterval(cursorTimerRef.current)
      cursorTimerRef.current = null
    }
    if (room && roleRef.current === 'host') {
      void api.live.hostCleanup(room).catch(() => undefined)
    }
  }, [])

  const leaveAndCleanup = useCallback((): void => {
    const guestBoard = getGuestBoardId()
    leave()
    if (!guestBoard) return
    clearGuestBoardId()
    void api.board.remove(guestBoard, true).catch(() => undefined)
  }, [leave])

  const togglePermission = useCallback((value: boolean): void => {
    canEditRef.current = value
    setCanEdit(value)
    sessionRef.current?.setPermission(value)
  }, [])

  const pullPartner = useCallback((viewport: { x: number; y: number; zoom: number }): void => {
    sessionRef.current?.sendOps({ t: 'viewport', x: viewport.x, y: viewport.y, zoom: viewport.zoom })
  }, [])

  const watchPartner = useCallback((): void => {
    const session = sessionRef.current
    if (!session || !session.isConnected) return
    setFollowing(true)
    session.sendOps({ t: 'watch', on: true })
    session.sendOps({ t: 'viewport', x: 0, y: 0, zoom: 0, ask: true })
  }, [])

  const stopFollow = useCallback((): void => {
    setFollowing(false)
    sessionRef.current?.sendOps({ t: 'watch', on: false })
  }, [])

  const transferHost = useCallback((): void => {
    const session = sessionRef.current
    if (!session || !session.isConnected) return
    session.sendOps({ t: 'handover', hostId: selfIdRef.current, hostName: session.selfName })
    roleRef.current = 'guest'
    setRole('guest')
    canEditRef.current = true
    session.applyHandover('guest')
    toast('Ведущим стал партнёр', 'lead')
  }, [toast])

  const onRemoteOps = useCallback((handler: (message: LiveMessage) => void): void => {
    opsHandlerRef.current = handler
  }, [])

  const onRemoteViewport = useCallback((handler: (viewport: { x: number; y: number; zoom: number }) => void): void => {
    viewportHandlerRef.current = handler
  }, [])

  const onRemoteChunk = useCallback((handler: (id: string, payload: string) => void): void => {
    chunkHandlerRef.current = handler
  }, [])

  const onChunkProgress = useCallback((handler: (id: string, done: number, total: number) => void): void => {
    chunkProgressHandlerRef.current = handler
  }, [])

  const sendCursor = useCallback((x: number, y: number): void => {
    lastCursorRef.current = { x, y }
    pendingCursorRef.current = { x, y, hidden: false }
    const now = performance.now()
    if (now - lastCursorSentRef.current >= 16) {
      lastCursorSentRef.current = now
      pendingCursorRef.current = null
      sessionRef.current?.sendLive({ t: 'cursor', x, y, hidden: false })
    }
  }, [])

  const hideCursor = useCallback((): void => {
    pendingCursorRef.current = { x: 0, y: 0, hidden: true }
  }, [])

  const sendPreview = useCallback((value: LivePreview): void => {
    sessionRef.current?.sendLive(value)
  }, [])

  const clearRemotePreview = useCallback((): void => {
    setPreview(null)
  }, [])

  const sendOps = useCallback((message: LiveMessage): void => {
    sessionRef.current?.sendOps(message)
  }, [])

  const sendChunked = useCallback((id: string, payload: string): void => {
    sessionRef.current?.sendChunked(id, payload)
  }, [])

  useEffect(() => {
    cursorTimerRef.current = window.setInterval(() => {
      const pending = pendingCursorRef.current
      if (!pending) return
      pendingCursorRef.current = null
      sessionRef.current?.sendLive({ t: 'cursor', x: pending.x, y: pending.y, hidden: pending.hidden })
    }, 30)
    return () => {
      if (cursorTimerRef.current !== null) {
        window.clearInterval(cursorTimerRef.current)
        cursorTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const announce = (): void => {
      const session = sessionRef.current
      const at = lastCursorRef.current
      if (!session || !session.isConnected || !at) return
      if (document.visibilityState === 'hidden' || minimizedRef.current || !focusedRef.current) {
        session.sendLive({ t: 'cursor', x: at.x, y: at.y, away: true })
      } else session.sendLive({ t: 'cursor', x: at.x, y: at.y })
    }
    const offState = window.liro.subscribe('window:state', (payload) => {
      minimizedRef.current = Boolean((payload as { minimized?: boolean })?.minimized)
      announce()
    })
    const onBlur = (): void => {
      focusedRef.current = false
      announce()
    }
    const onFocus = (): void => {
      focusedRef.current = true
      announce()
    }
    document.addEventListener('visibilitychange', announce)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      offState()
      document.removeEventListener('visibilitychange', announce)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const session = sessionRef.current
      if (!session) return
      setPing(session.stats.ping)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    rearmRef.current = () => {
      const inviteCode = codeRef.current
      if (!inviteCode || leavingRef.current || !hostDocRef.current) return
      void armHost(inviteCode)
    }
  }, [armHost])

  useEffect(() => {
    if (connected) {
      hadPartnerRef.current = true
      return undefined
    }
    if (!hadPartnerRef.current) return undefined
    hadPartnerRef.current = false
    if (roleRef.current !== 'host' || leavingRef.current) return undefined
    const timer = window.setTimeout(() => rearmRef.current(), 1500)
    return () => window.clearTimeout(timer)
  }, [connected])

  useEffect(() => () => leave(), [leave])

  return useMemo(
    () => ({
      role,
      code,
      partner,
      partnerAway: cursors.some((cursor) => cursor.away),
      ping,
      connected,
      canEdit,
      preparing,
      watching,
      following,
      cursors,
      preview,
      startHost,
      joinGuest,
      leave,
      leaveAndCleanup,
      togglePermission,
      pullPartner,
      watchPartner,
      stopFollow,
      transferHost,
      onRemoteOps,
      onRemoteViewport,
      onRemoteChunk,
      onChunkProgress,
      sendCursor,
      sendPreview,
      clearRemotePreview,
      hideCursor,
      sendOps,
      sendChunked
    }),
    [
      role,
      code,
      partner,
      ping,
      connected,
      canEdit,
      preparing,
      watching,
      following,
      cursors,
      preview,
      startHost,
      joinGuest,
      leave,
      leaveAndCleanup,
      togglePermission,
      pullPartner,
      watchPartner,
      stopFollow,
      transferHost,
      onRemoteOps,
      onRemoteViewport,
      onRemoteChunk,
      onChunkProgress,
      sendCursor,
      sendPreview,
      clearRemotePreview,
      hideCursor,
      sendOps,
      sendChunked
    ]
  )
}

export function colorOfParticipant(participant: LiveParticipant): string {
  return participant.color || colorForId(participant.id)
}
