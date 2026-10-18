import { deflateRawSync, inflateRawSync } from 'node:zlib'

export interface ZipEntry {
  name: string
  data: Buffer
  store?: boolean
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

export function createZip(entries: ZipEntry[], now = new Date()): Buffer {
  const { time, date } = dosDateTime(now)
  const chunks: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8')
    const raw = entry.data
    const compressed = entry.store ? raw : deflateRawSync(raw, { level: 9 })
    const useStore = entry.store || compressed.length >= raw.length
    const payload = useStore ? raw : compressed
    const method = useStore ? 0 : 8
    const crc = crc32(raw)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(date, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(payload.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    local.writeUInt16LE(0, 28)
    chunks.push(local, nameBuf, payload)
    const header = Buffer.alloc(46)
    header.writeUInt32LE(0x02014b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(20, 6)
    header.writeUInt16LE(0x0800, 8)
    header.writeUInt16LE(method, 10)
    header.writeUInt16LE(time, 12)
    header.writeUInt16LE(date, 14)
    header.writeUInt32LE(crc, 16)
    header.writeUInt32LE(payload.length, 20)
    header.writeUInt32LE(raw.length, 24)
    header.writeUInt16LE(nameBuf.length, 28)
    header.writeUInt16LE(0, 30)
    header.writeUInt16LE(0, 32)
    header.writeUInt16LE(0, 34)
    header.writeUInt16LE(0, 36)
    header.writeUInt32LE(0, 38)
    header.writeUInt32LE(offset, 42)
    central.push(header, nameBuf)
    offset += local.length + nameBuf.length + payload.length
  }
  const centralBuf = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralBuf.length, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...chunks, centralBuf, end])
}

export function isZip(buffer: Buffer): boolean {
  return buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b
}

export function readZip(buffer: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>()
  if (!isZip(buffer)) return out
  let eocd = -1
  const limit = Math.max(0, buffer.length - 66000)
  for (let i = buffer.length - 22; i >= limit; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return out
  const count = buffer.readUInt16LE(eocd + 10)
  let pointer = buffer.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (pointer + 46 > buffer.length) break
    if (buffer.readUInt32LE(pointer) !== 0x02014b50) break
    const method = buffer.readUInt16LE(pointer + 10)
    const compressedSize = buffer.readUInt32LE(pointer + 20)
    const nameLength = buffer.readUInt16LE(pointer + 28)
    const extraLength = buffer.readUInt16LE(pointer + 30)
    const commentLength = buffer.readUInt16LE(pointer + 32)
    const localOffset = buffer.readUInt32LE(pointer + 42)
    const name = buffer.toString('utf8', pointer + 46, pointer + 46 + nameLength)
    pointer += 46 + nameLength + extraLength + commentLength
    if (!name.endsWith('/')) {
      if (localOffset + 30 > buffer.length) continue
      const localNameLength = buffer.readUInt16LE(localOffset + 26)
      const localExtraLength = buffer.readUInt16LE(localOffset + 28)
      const dataStart = localOffset + 30 + localNameLength + localExtraLength
      const payload = buffer.subarray(dataStart, dataStart + compressedSize)
      try {
        out.set(name, method === 8 ? inflateRawSync(payload) : Buffer.from(payload))
      } catch {
        continue
      }
    }
  }
  return out
}