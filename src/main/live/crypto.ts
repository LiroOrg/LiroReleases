import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto'

const CODE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

export function newCode(): string {
  const raw = randomBytes(9)
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    out += CODE_ALPHABET[raw[index] % CODE_ALPHABET.length]
    if (index === 2 || index === 5) out += '-'
  }
  return out
}

export function normalizeCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
}

export function keyCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function pickRoomCode(wanted?: string): string {
  const candidate = keyCode(wanted ?? '')
  if (candidate.length === 9) {
    return `${candidate.slice(0, 3)}-${candidate.slice(3, 6)}-${candidate.slice(6, 9)}`
  }
  return newCode()
}

export function roomId(code: string): string {
  return createHash('sha256').update(keyCode(code)).digest('hex')
}

function roomKey(code: string): Buffer {
  const material = hkdfSync(
    'sha256',
    Buffer.from(keyCode(code), 'utf8'),
    Buffer.from('liro-live-room', 'utf8'),
    Buffer.from('offer-answer', 'utf8'),
    32
  )
  return Buffer.from(material)
}

export function encryptRoom(code: string, plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', roomKey(code), iv)
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptRoom(code: string, packed: string): string {
  const parts = packed.split('.')
  if (parts.length !== 3) throw new Error('Повреждённые данные комнаты')
  const iv = Buffer.from(parts[0], 'base64url')
  const tag = Buffer.from(parts[1], 'base64url')
  const body = Buffer.from(parts[2], 'base64url')
  const decipher = createDecipheriv('aes-256-gcm', roomKey(code), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
}
