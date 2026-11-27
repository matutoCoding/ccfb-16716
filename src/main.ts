import './styles.css';
import { store } from './state/store';
import { h, clear } from './ui/dom';
import { mountOrders } from './pages/orders';
import { mountCake } from './pages/cake';
import { mountPiping } from './pages/piping';
import { mountDecorations } from './pages/decorations';
import { mountPreview } from './pages/preview';
import { mountSettings } from './pages/settings';
import type { PageId } from './types';

const NAV: Array<{ id: PageId; label: string; icon: string; desc: string }> = [
  { id: 'orders', label: '订单列表', icon: '📋', desc: '客户与方案' },
  { id: 'cake', label: '蛋糕胚', icon: '🎂', desc: '层数/材质' },
  { id: 'piping', label: '裱花编辑', icon: '✶', desc: '路径/花嘴' },
  { id: 'decorate', label: '装饰件', icon: '🍓', desc: '水果/蜡烛' },
  { id: 'preview', label: '效果预览', icon: '👁', desc: '灯光/出图' },
  { id: 'settings', label: '设置', icon: '⚙', desc: '性能/自检' }
];

const app = document.querySelector<HTMLDivElement>('#app')!;
const main = h('main', { class: 'main-content' });
const contextBar = h('div', { class: 'context-controls' });
const savePill = h('span', { class: 'save-pill', text: '未加载' });
const toast = h('div', { class: 'toast' });

const sidebar = h('aside', { class: 'sidebar' },
  h('div', { class: 'brand' }, h('div', { class: 'brand-mark', text: 'G' }), h('div', {}, h('strong', { text: 'Gateau Studio' }), h('small', { text: '裱花蛋糕效果预览系统' }))),
  h('nav', { class: 'nav' }, ...NAV.map((item) => h('button', {
    type: 'button',
    class: `nav-item ${store.state.route === item.id ? 'active' : ''}`,
    dataset: { route: item.id },
    on: { click: () => store.setRoute(item.id) }
  }, h('span', { class: 'nav-icon', text: item.icon }), h('span', { class: 'nav-text' }, h('strong', { text: item.label }), h('small', { text: item.desc }))))),
  h('div', { class: 'sidebar-foot' }, savePill, h('small', { text: 'TypeScript · WebGL2 SDF · IndexedDB' }))
);

const topbar = h('header', { class: 'topbar' },
  h('div', { class: 'breadcrumbs' }, h('span', { class: 'dot' }), h('strong', { id: 'page-title', text: '订单列表' })),
  contextBar
);

app.append(h('div', { class: 'app-shell' }, sidebar, h('div', { class: 'main-column' }, topbar, main)), toast);

let pageCleanup: (() => void) | null = null;
let renderedRoute: PageId | null = null;
let renderedDesignId: string | null = null;

function renderContext(): void {
  clear(contextBar);
  const order = store.currentOrder;
  const design = store.currentDesign;

  const orderSelect = h('select', {
    class: 'context-select',
    attrs: { 'aria-label': '当前订单' },
    on: { change: (e) => store.selectOrder((e.target as HTMLSelectElement).value) }
  }) as HTMLSelectElement;
  for (const o of store.state.orders) {
    const opt = h('option', { value: o.id, text: `${o.code} · ${o.customer.name}` }) as HTMLOptionElement;
    opt.value = o.id;
    if (o.id === order?.id) opt.selected = true;
    orderSelect.append(opt);
  }

  const proposalSelect = h('select', {
    class: 'context-select proposal',
    attrs: { 'aria-label': '当前方案' },
    on: { change: (e) => store.selectDesign((e.target as HTMLSelectElement).value) }
  }) as HTMLSelectElement;
  for (const p of store.designsForOrder(order?.id)) {
    const opt = h('option', { value: p.id, text: `${p.proposalLabel} · ${p.name}` }) as HTMLOptionElement;
    if (p.id === design?.id) opt.selected = true;
    proposalSelect.append(opt);
  }

  contextBar.append(
    h('span', { class: 'context-label', text: '订单' }), orderSelect,
    h('span', { class: 'context-label', text: '方案' }), proposalSelect,
    h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '＋方案', on: { click: () => { store.createProposal(); store.toast('已创建新的客户对比方案'); } } })
  );
}

function renderRoute(): void {
  const route = store.state.route;
  const designId = store.state.currentDesignId;
  if (renderedRoute === route && renderedDesignId === designId) return;
  pageCleanup?.();
  clear(main);
  renderedRoute = route;
  renderedDesignId = designId;
  document.querySelector('#page-title')!.textContent = NAV.find((n) => n.id === route)?.label ?? '';

  switch (route) {
    case 'orders': pageCleanup = mountOrders(main); break;
    case 'cake': pageCleanup = mountCake(main); break;
    case 'piping': pageCleanup = mountPiping(main); break;
    case 'decorate': pageCleanup = mountDecorations(main); break;
    case 'preview': pageCleanup = mountPreview(main); break;
    case 'settings': pageCleanup = mountSettings(main); break;
  }
}

function updateSavePill(): void {
  const map = {
    idle: ['', ''],
    dirty: ['saving', '未保存…'],
    saving: ['saving', '保存中…'],
    saved: ['saved', '已存 IndexedDB'],
    error: ['error', '保存失败']
  } as const;
  const [cls, text] = map[store.state.saveState];
  savePill.className = `save-pill ${cls}`;
  savePill.textContent = text || (store.state.lastSavedAt ? '已存 IndexedDB' : 'IndexedDB 就绪');
  toast.classList.toggle('show', Boolean(store.state.toast));
  toast.textContent = store.state.toast ?? '';
}

store.subscribe(() => {
  document.querySelectorAll('.nav-item').forEach((el) => el.classList.toggle('active', (el as HTMLElement).dataset.route === store.state.route));
  renderContext();
  updateSavePill();
  renderRoute();
});

(async function boot() {
  try {
    await store.init();
    renderContext();
    updateSavePill();
    renderRoute();
  } catch (err) {
    console.error(err);
    main.append(h('div', { class: 'empty-state page' }, h('h1', { text: '初始化失败' }), h('p', { text: (err as Error).message })));
  }
})();
