export type LiveRole = 'host' | 'guest'

export interface LiveParticipant {
  id: string
  name: string
  color: string
  canEdit: boolean
  host: boolean
}

export type LivePreview =
  | {
      t: 'preview'
      kind: 'stroke'
      points: Array<{ x: number; y: number }>
      color: string
      width: number
      opacity: number
    }
  | {
      t: 'preview'
      kind: 'shape'
      shape: string
      x: number
      y: number
      w: number
      h: number
      color: string
      width: number
      points?: Array<{ x: number; y: number }>
    }
  | { t: 'preview'; kind: 'solid'; id: string; pitch: number; yaw: number }
  | { t: 'preview'; kind: 'move'; items: Array<{ id: string; x: number; y: number; w?: number; h?: number }> }
  | { t: 'preview'; kind: 'text'; id: string; content: string; plain: string }
  | { t: 'preview'; kind: 'calc'; source: string; result: string; open?: boolean }
  | { t: 'preview'; kind: 'clear' }

export type LiveMessage =
  | { t: 'hello'; id: string; name: string; color: string; host: boolean }
  | { t: 'perm'; canEdit: boolean }
  | { t: 'cursor'; x: number; y: number; hidden?: boolean }
  | { t: 'viewport'; x: number; y: number; zoom: number; ask?: boolean }
  | { t: 'watch'; on: boolean }
  | { t: 'handover'; hostId: string; hostName: string }
  | { t: 'media'; video: string; playing: boolean; time: number; stamp: number; asking?: boolean }
  | { t: 'asset'; item: string }
  | { t: 'ping'; stamp: number }
  | { t: 'pong'; stamp: number }
  | { t: 'chunk'; id: string; index: number; total: number; payload: string }
  | LivePreview
  | { t: 'bye' }

export interface LiveSnapshot {
  title: string
  items: unknown[]
}
