// 应用外壳：侧边导航 + 顶部上下文 + 页面容器
import type { Route } from './router.ts'
import { navigate, routeHash } from './router.ts'
import { store } from '../state/store.ts'
import { el, clear } from './dom.ts'

interface NavItem {
  label: string
  route: Route
  icon: string
}

const iconSvg = (path: string): string =>
  `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`

const ICONS = {
  orders: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/>',
  layers: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  piping: '<path d="M4 20c4-1 7-4 8-8l5-5-3-3-5 5c-4 1-7 4-8 8l3 3z"/><path d="M14 7l3 3"/>',
  decorations: '<circle cx="7" cy="8" r="3"/><circle cx="17" cy="16" r="3"/><path d="M10 8h7a3 3 0 013 3"/>',
  preview: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 00-2-1.2L14 3h-4l-.5 2.6a7 7 0 00-2 1.2l-2.4-1-2 3.4 2 1.6A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1a7 7 0 002 1.2L10 21h4l.5-2.6a7 7 0 002-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z"/>'
}

export function renderShell(route: Route, pageNode: HTMLElement): HTMLElement {
  const state = store.getState()
  const design = state.designs.find((item) =>
    'designId' in route ? item.id === route.designId : false
  )
  const order = state.orders.find((item) =>
    design ? item.designIds.includes(design.id) : false
  )

  const designScoped: NavItem[] = design
    ? [
        { label: '蛋糕胚', route: { page: 'layers', designId: design.id }, icon: ICONS.layers },
        { label: '裱花编辑', route: { page: 'piping', designId: design.id }, icon: ICONS.piping },
        { label: '装饰件', route: { page: 'decorations', designId: design.id }, icon: ICONS.decorations },
        { label: '效果预览', route: { page: 'preview', designId: design.id }, icon: ICONS.preview }
      ]
    : []

  const nav: NavItem[] = [
    { label: '订单列表', route: { page: 'orders' }, icon: ICONS.orders },
    ...designScoped,
    { label: '设置', route: { page: 'settings' }, icon: ICONS.settings }
  ]

  const navButtons = nav.map((item) => {
    const active = item.route.page === route.page
    const button = el('button', {
      class: `nav-item${active ? ' active' : ''}`,
      innerHTML: `${iconSvg(item.icon)}<span>${item.label}</span>`,
      onclick: () => navigate(routeHash(item.route).slice(1))
    })
    return button
  })

  const sidebar = el('aside', {}, [
    el('div', { class: 'brand' }, [
      el('h3', {}, ['裱花设计工作台'])
    ]),
    el('nav', {}, navButtons)
  ])

  const contextLine = order
    ? `${order.customer} · ${order.dueDate || '未定日期'} · ${order.servings}人${design ? ` · ${design.name}` : ''}`
    : '未选择订单'

  const topbar = el('header', { class: 'topbar no-print' }, [
    el('div', { class: 'context' }, [el('span', { class: 'muted' }, [contextLine])])
  ])

  const main = el('main', { class: 'content' }, [topbar, pageNode])
  return el('div', { class: 'shell' }, [sidebar, main])
}

export function shellStyles(): string {
  return `
  .shell { display: flex; height: 100vh; overflow: hidden; }
  aside {
    width: var(--sidebar-width);
    background: var(--c-surface);
    border-right: 1px solid var(--c-border);
    display: flex;
    flex-direction: column;
    padding: var(--sp-5) var(--sp-3);
    gap: var(--sp-4);
    flex-shrink: 0;
  }
  .brand { padding: 0 var(--sp-3) var(--sp-3); border-bottom: 1px solid var(--c-border); }
  nav { display: flex; flex-direction: column; gap: var(--sp-1); }
  .nav-item {
    display: flex; align-items: center; gap: var(--sp-3);
    border: none; background: transparent; text-align: left;
    padding: var(--sp-3); border-radius: var(--radius-sm);
    color: var(--c-text-2); font-size: var(--fs-sm);
  }
  .nav-item:hover { background: var(--c-surface-2); color: var(--c-text); }
  .nav-item.active { background: var(--c-primary-soft); color: var(--c-primary); font-weight: var(--fw-medium); }
  .content { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar {
    height: 56px; border-bottom: 1px solid var(--c-border);
    display: flex; align-items: center; padding: 0 var(--sp-5);
    background: var(--c-surface); flex-shrink: 0;
  }
  `
}

export function rerenderShell(buildPage: () => HTMLElement): void {
  const app = document.querySelector('#app')
  if (!app) return
  clear(app as HTMLElement)
  app.append(buildPage())
}
