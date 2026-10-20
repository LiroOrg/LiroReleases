let guestBoardId = ''

export function setGuestBoardId(docId: string): void {
  guestBoardId = docId
}

export function getGuestBoardId(): string {
  return guestBoardId
}

export function clearGuestBoardId(): void {
  guestBoardId = ''
}
