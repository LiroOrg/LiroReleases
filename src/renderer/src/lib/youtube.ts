const ORIGIN = 'https://www.youtube-nocookie.com'
const ID_PATTERN = /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([\w-]{6,})/

export const PLAYER_IDLE = -1
export const PLAYER_PLAYING = 1
export const PLAYER_PAUSED = 2
export const PLAYER_ENDED = 0

export interface PlayerEvent {
  state: number
  time: number
}

export function youtubeId(url: string): string {
  return ID_PATTERN.exec(url)?.[1] ?? ''
}

export function youtubeEmbed(video: string): string {
  return `${ORIGIN}/embed/${video}?enablejsapi=1&playsinline=1&rel=0&modestbranding=1`
}

export function playerCommand(frame: HTMLIFrameElement | null, command: string, args: Array<number | string | boolean> = []): void {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: command, args }), ORIGIN)
}

export function playerListen(frame: HTMLIFrameElement | null, id: number): void {
  frame?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id }), ORIGIN)
}

export function playerChannelId(data: unknown): number | null {
  if (typeof data !== 'string' || data[0] !== '{') return null
  try {
    const record = JSON.parse(data) as { id?: number | string }
    const id = typeof record.id === 'string' ? Number(record.id) : record.id
    return typeof id === 'number' && Number.isFinite(id) ? id : null
  } catch {
    return null
  }
}

export function playerEvent(data: unknown): PlayerEvent | null {
  if (typeof data !== 'string' || data[0] !== '{') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  const record = parsed as {
    info?: { playerState?: number; currentTime?: number; currentTimeData?: { currentTime?: number } } | null
  }
  const info = record.info
  if (!info) return null
  const rawTime = info.currentTimeData?.currentTime ?? info.currentTime
  const time = typeof rawTime === 'number' ? rawTime : -1
  if (typeof info.playerState === 'number') return { state: info.playerState, time }
  return time >= 0 ? { state: PLAYER_IDLE, time } : null
}
