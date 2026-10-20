import { net } from 'electron'
import { decryptRoom, encryptRoom, roomId } from './crypto'

const PROJECT_URL = 'https://aceydfszfxjsortqfkfp.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_s1BMu4dKwBGezJTr3oV4Jw_qdah5d7b'
const ROOM_TTL_MINUTES = 15

interface RoomRow {
  id: string
  offer: string
  answer?: string | null
  expires_at: string
}

function headers(): Record<string, string> {
  return {
    apikey: PUBLISHABLE_KEY,
    Authorization: `Bearer ${PUBLISHABLE_KEY}`,
    'Content-Type': 'application/json'
  }
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await net.fetch(`${PROJECT_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers as Record<string, string> | undefined) }
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`Сервер сигналов ответил ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`)
  }
  const body = await response.text()
  if (!body) return null as T
  return JSON.parse(body) as T
}

export async function createRoom(code: string, offer: string): Promise<void> {
  const expires = new Date(Date.now() + ROOM_TTL_MINUTES * 60 * 1000).toISOString()
  await request<RoomRow[]>('rooms', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      id: roomId(code),
      offer: encryptRoom(code, offer),
      expires_at: expires
    })
  })
}

export async function readRoom(code: string): Promise<{ offer?: string; answer?: string } | null> {
  const rows = await request<RoomRow[]>(`rooms?id=eq.${roomId(code)}&select=offer,answer&expires_at=gt.${new Date().toISOString()}`, {
    method: 'GET'
  })
  const row = rows?.[0]
  if (!row) return null
  const result: { offer?: string; answer?: string } = {}
  if (row.offer) result.offer = decryptRoom(code, row.offer)
  if (row.answer) result.answer = decryptRoom(code, row.answer)
  return result
}

export async function writeAnswer(code: string, answer: string): Promise<void> {
  await request<RoomRow[]>(`rooms?id=eq.${roomId(code)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ answer: encryptRoom(code, answer) })
  })
}

export async function deleteRoom(code: string): Promise<void> {
  await request<boolean>('rpc/rooms_delete', {
    method: 'POST',
    body: JSON.stringify({ p_id: roomId(code) })
  })
}

export async function waitForAnswer(code: string, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const room = await readRoom(code)
    if (room?.answer) return room.answer
    await new Promise((resolve) => setTimeout(resolve, 700))
  }
  return null
}
