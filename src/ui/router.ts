// Hash 路由
export type Route =
  | { page: 'orders' }
  | { page: 'layers'; designId: string }
  | { page: 'piping'; designId: string }
  | { page: 'decorations'; designId: string }
  | { page: 'preview'; designId: string }
  | { page: 'settings' }

export function parseRoute(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [page, designId] = raw.split('/')
  if (page === 'layers' && designId) return { page: 'layers', designId }
  if (page === 'piping' && designId) return { page: 'piping', designId }
  if (page === 'decorations' && designId) return { page: 'decorations', designId }
  if (page === 'preview' && designId) return { page: 'preview', designId }
  if (page === 'settings') return { page: 'settings' }
  return { page: 'orders' }
}

export const navigate = (route: string): void => {
  const hash = route.startsWith('#') ? route : `#${route}`
  if (window.location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = hash
  }
}

export const routeHash = (route: Route): string => {
  if (route.page === 'orders') return '#/orders'
  if (route.page === 'settings') return '#/settings'
  return `#/${route.page}/${route.designId}`
}
