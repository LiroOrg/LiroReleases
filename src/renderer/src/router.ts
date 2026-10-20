import { buildHash, parseRoute } from '@shared/route'
import type { Route } from '@shared/route'

export type { Route }
export { buildHash, parseRoute }

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