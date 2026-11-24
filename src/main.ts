// 应用入口
import './styles.css'
import { store } from './state/store.ts'
import { parseRoute, type Route } from './ui/router.ts'
import { renderShell, rerenderShell, shellStyles } from './ui/shell.ts'
import { mount } from './ui/dom.ts'
import { renderOrdersPage } from './pages/orders_page.ts'
import { renderLayersPage } from './pages/layers_page.ts'
import { renderPipingPage } from './pages/piping_page.ts'
import { renderDecorationsPage } from './pages/decorations_page.ts'
import { renderPreviewPage } from './pages/preview_page.ts'
import { renderSettingsPage } from './pages/settings_page.ts'

function buildPage(route: Route): HTMLElement {
  switch (route.page) {
    case 'orders':
      return renderOrdersPage()
    case 'layers':
      return renderLayersPage(route.designId)
    case 'piping':
      return renderPipingPage(route.designId)
    case 'decorations':
      return renderDecorationsPage(route.designId)
    case 'preview':
      return renderPreviewPage(route.designId)
    case 'settings':
      return renderSettingsPage()
  }
}

function renderRoute(): void {
  const route = parseRoute(window.location.hash)
  rerenderShell(() => renderShell(route, buildPage(route)))
}

function injectShellStyles(): void {
  const style = document.createElement('style')
  style.textContent = shellStyles()
  document.head.append(style)
}

async function bootstrap(): Promise<void> {
  injectShellStyles()
  mount(document.createElement('div'))
  try {
    await store.hydrate()
  } catch (error) {
    console.error('IndexedDB 初始化失败', error)
  }
  if (!window.location.hash) window.location.hash = '#/orders'
  renderRoute()
  window.addEventListener('hashchange', renderRoute)
}

void bootstrap()
