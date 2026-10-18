export type Route =
  | { name: 'home' }
  | { name: 'board'; docId: string }
  | { name: 'library' }
  | { name: 'preview' }
  | { name: 'settings' }
  | { name: 'about' }
  | { name: 'project'; projectId: string }
  | { name: 'search'; query: string }

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#/, '').replace(/^\/+/, '')
  const [pathPart] = clean.split('?')
  const segments = pathPart.split('/').filter(Boolean)
  if (segments.length === 0) return { name: 'home' }
  const head = decodeURIComponent(segments[0])
  if (head === 'library') return { name: 'library' }
  if (head === 'preview') return { name: 'preview' }
  if (head === 'settings') return { name: 'settings' }
  if (head === 'about') return { name: 'about' }
  if (head === 'search') return { name: 'search', query: clean.split('?')[1] ? decodeURIComponent(clean.split('?')[1]) : '' }
  if (head === 'project' && segments[1]) return { name: 'project', projectId: decodeURIComponent(segments[1]) }
  if (head === 'board' && segments[1]) return { name: 'board', docId: decodeURIComponent(segments[1]) }
  return { name: 'home' }
}

export function buildHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'library':
      return '#/library'
    case 'preview':
      return '#/preview'
    case 'settings':
      return '#/settings'
    case 'about':
      return '#/about'
    case 'project':
      return `#/project/${encodeURIComponent(route.projectId)}`
    case 'search':
      return `#/search/${encodeURIComponent(route.query)}`
    case 'board':
      return `#/board/${encodeURIComponent(route.docId)}`
    default:
      return '#/'
  }
}

export function navigate(route: Route): void {
  const next = buildHash(route)
  if (window.location.hash !== next) window.location.hash = next
}

export function replace(route: Route): void {
  const next = buildHash(route)
  const url = `${window.location.pathname}${window.location.search}${next}`
  window.history.replaceState(null, '', url)
}

export function onRouteChange(handler: (route: Route) => void): () => void {
  const listener = (): void => handler(parseRoute(window.location.hash))
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}