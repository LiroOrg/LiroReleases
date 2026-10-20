let pendingCode = ''
let pendingOffer = ''

export function setPendingJoin(code: string, offer: string): void {
  pendingCode = code
  pendingOffer = offer
}

export function takePendingJoin(): { code: string; offer: string } | null {
  if (!pendingCode || !pendingOffer) return null
  const value = { code: pendingCode, offer: pendingOffer }
  pendingCode = ''
  pendingOffer = ''
  return value
}
