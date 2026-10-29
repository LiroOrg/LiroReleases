import { useCallback, useMemo, useRef } from 'react'
import type { LiveMessage } from '@shared/live'

export interface MediaState {
  video: string
  playing: boolean
  time: number
  stamp: number
}

export interface MediaBridge {
  report: (state: MediaState) => void
  ask: () => void
  subscribe: (handler: (state: MediaState) => void) => () => void
}

export interface MediaSync extends MediaBridge {
  handle: (message: LiveMessage) => void
}

export function useMediaSync(sendOps: (message: LiveMessage) => void): MediaSync {
  const localRef = useRef<MediaState | null>(null)
  const appliedRef = useRef(0)
  const handlersRef = useRef(new Set<(state: MediaState) => void>())

  const report = useCallback(
    (state: MediaState): void => {
      localRef.current = state
      appliedRef.current = Math.max(appliedRef.current, state.stamp)
      sendOps({ t: 'media', video: state.video, playing: state.playing, time: state.time, stamp: state.stamp })
    },
    [sendOps]
  )

  const ask = useCallback((): void => {
    sendOps({ t: 'media', video: '', playing: false, time: 0, stamp: Date.now(), asking: true })
  }, [sendOps])

  const subscribe = useCallback((handler: (state: MediaState) => void): (() => void) => {
    handlersRef.current.add(handler)
    return () => {
      handlersRef.current.delete(handler)
    }
  }, [])

  const handle = useCallback(
    (message: LiveMessage): void => {
      if (message.t !== 'media') return
      if (message.asking) {
        const local = localRef.current
        if (local) sendOps({ t: 'media', video: local.video, playing: local.playing, time: local.time, stamp: local.stamp })
        return
      }
      if (message.stamp <= appliedRef.current) return
      appliedRef.current = message.stamp
      const state: MediaState = { video: message.video, playing: message.playing, time: message.time, stamp: message.stamp }
      for (const handler of handlersRef.current) handler(state)
    },
    [sendOps]
  )

  return useMemo(() => ({ report, ask, subscribe, handle }), [report, ask, subscribe, handle])
}
