import { useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { PLAYER_ENDED, PLAYER_PAUSED, PLAYER_PLAYING, playerChannelId, playerCommand, playerEvent, playerListen, youtubeEmbed } from '../lib/youtube'
import type { MediaBridge, MediaState } from '../live/mediaSync'

const SUPPRESS_MS = 900
const DRIFT_S = 1.2

export function YouTubePlayer(props: { video: string; media: MediaBridge; interactive: boolean }): ReactNode {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const readyRef = useRef(false)
  const pendingRef = useRef<MediaState | null>(null)
  const timeRef = useRef(0)
  const suppressRef = useRef(0)
  const channelRef = useRef(Math.floor(Math.random() * 1e9))

  const apply = useCallback((state: MediaState): void => {
    const frame = frameRef.current
    const target = state.playing ? state.time + (Date.now() - state.stamp) / 1000 : state.time
    if (!frame || !readyRef.current) {
      pendingRef.current = state
      return
    }
    if (Math.abs(target - timeRef.current) > DRIFT_S) playerCommand(frame, 'seekTo', [Math.max(0, target), true])
    playerCommand(frame, state.playing ? 'playVideo' : 'pauseVideo')
    timeRef.current = target
    suppressRef.current = Date.now() + SUPPRESS_MS
  }, [])

  useEffect(() => {
    readyRef.current = false
    pendingRef.current = null
    timeRef.current = 0
    props.media.ask()
    return props.media.subscribe((state) => {
      if (state.video === props.video) apply(state)
    })
  }, [props.media, props.video, apply])

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return undefined
    playerListen(frame, channelRef.current)
    const ping = window.setInterval(() => {
      if (readyRef.current) {
        window.clearInterval(ping)
        return
      }
      playerListen(frame, channelRef.current)
    }, 350)
    const onMessage = (event: MessageEvent): void => {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const message = playerEvent(event.data)
      if (!readyRef.current) {
        readyRef.current = true
        const channel = playerChannelId(event.data)
        if (channel !== null) channelRef.current = channel
        playerListen(frameRef.current, channelRef.current)
        const pending = pendingRef.current
        pendingRef.current = null
        if (pending) apply(pending)
      }
      if (!message) return
      if (message.time >= 0) timeRef.current = message.time
      if (message.state !== PLAYER_PLAYING && message.state !== PLAYER_PAUSED && message.state !== PLAYER_ENDED) return
      if (Date.now() < suppressRef.current) return
      props.media.report({
        video: props.video,
        playing: message.state === PLAYER_PLAYING,
        time: timeRef.current,
        stamp: Date.now()
      })
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.clearInterval(ping)
      window.removeEventListener('message', onMessage)
    }
  }, [props.media, props.video, apply])

  return (
    <div className="ytplayer">
      <iframe
        ref={frameRef}
        className="ytplayer__frame"
        src={youtubeEmbed(props.video)}
        title=""
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        style={{ pointerEvents: props.interactive ? 'auto' : 'none' }}
      />
    </div>
  )
}
