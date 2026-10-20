import { app } from 'electron'

const SCHEME = 'liro'

export function registerLiveProtocol(): void {
  if (!app.isDefaultProtocolClient(SCHEME)) {
    const exe = process.env.PORTABLE_EXECUTABLE_FILE ?? process.execPath
    app.setAsDefaultProtocolClient(SCHEME, exe)
  }
  app.on('open-url', (event, url) => {
    event.preventDefault()
    sendLink(url)
  })
}

export function codeFromLink(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== `${SCHEME}:`) return ''
    const path = parsed.pathname.replace(/^\/+/, '')
    if (path.startsWith('connect/')) return decodeURIComponent(path.slice('connect/'.length)).split('/')[0]
    if (parsed.host === 'connect') return decodeURIComponent(parsed.pathname.replace(/^\/+/, '')).split('/')[0]
    return ''
  } catch {
    return ''
  }
}

let sendLink: (url: string) => void = () => undefined
let pendingCode = ''

export function onLiveLink(handler: (url: string) => void): void {
  sendLink = handler
}

export function setPendingLink(url: string): void {
  pendingCode = codeFromLink(url)
}

export function takePendingCode(): string {
  const value = pendingCode
  pendingCode = ''
  return value
}

export function linkFromArgv(argv: string[]): string {
  for (const value of argv) {
    if (typeof value === 'string' && value.toLowerCase().startsWith(`${SCHEME}://`)) return value
  }
  return ''
}
