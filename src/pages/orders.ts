import { store } from '../state/store';
import { h, button, field, clear } from '../ui/dom';
import type { EventType, Order } from '../types';

export function mountOrders(root: HTMLElement): () => void {
  const page = h('section', { class: 'page orders-page' });
  root.append(page);

  const render = () => {
    clear(page);
    const orders = [...store.state.orders].sort((a, b) => b.updatedAt - a.updatedAt);
    const current = store.currentOrder;
    const proposals = store.designsForOrder(current?.id);

    const newBtn = button('＋ 新建订单', async () => {
      const { order } = await store.createOrderWithDesign({ customer: { name: '新客户' } });
      store.selectOrder(order.id);
      store.setRoute('cake');
    }, 'btn-primary');

    const seedBtn = button('载入/重置三套测试方案', async () => {
      if (window.confirm('将清空当前 IndexedDB 数据并恢复三个测试方案，确定？')) {
        await store.resetAndSeed();
        store.toast('已恢复：三层婚礼、镜面慕斯、数字生日');
      }
    }, 'btn-ghost');

    const header = h('div', { class: 'page-header' },
      h('div', {}, h('h1', { text: '订单列表' }), h('p', { class: 'muted', text: '客户、日期、人数与预算；同一订单可保存多个提案供客户对比。' })),
      h('div', { class: 'header-actions' }, seedBtn, newBtn)
    );

    const list = h('div', { class: 'order-list' },
      ...orders.map((o) => h('button', {
        class: `order-card ${current?.id === o.id ? 'active' : ''}`,
        type: 'button',
        on: { click: () => store.selectOrder(o.id) }
      },
        h('div', { class: 'order-card-top' }, h('strong', { text: o.customer.name }), h('span', { class: `status status-${o.status}`, text: statusLabel(o.status) })),
        h('div', { class: 'order-code', text: `${o.code} · ${eventLabel(o.eventType)}` }),
        h('div', { class: 'order-meta', text: `${o.eventDate} · ${o.people} 人 · 预算 ¥${o.budget}` }),
        h('div', { class: 'order-proposal-count', text: `${store.designsForOrder(o.id).length} 个方案` })
      ))
    );

    const detail = current ? renderDetail(current, proposals) : h('div', { class: 'empty-state', text: '请选择或新建一个订单' });
    page.append(header, h('div', { class: 'orders-layout' }, h('aside', { class: 'panel order-list-panel' }, list), h('div', { class: 'order-detail-wrap' }, detail)));
  };

  const unsub = store.subscribe(render);
  render();
  return () => unsub();
}

function statusLabel(s: Order['status']): string {
  return { consulting: '咨询中', confirmed: '已确认', making: '制作中', delivered: '已交付' }[s];
}
function eventLabel(t: EventType): string {
  return { wedding: '婚礼', birthday: '生日', party: '聚会/甜品' }[t];
}

function renderDetail(order: Order, proposals: ReturnType<typeof store.designsForOrder>): HTMLElement {
  const wrap = h('div', { class: 'order-detail' });

  const nameInput = h('input', { attrs: { value: order.customer.name, placeholder: '客户称呼' }, on: { change: (e) => store.updateOrder({ customer: { ...order.customer, name: (e.target as HTMLInputElement).value } }) } }) as HTMLInputElement;
  const phoneInput = h('input', { attrs: { value: order.customer.phone ?? '', placeholder: '电话/微信' }, on: { change: (e) => store.updateOrder({ customer: { ...order.customer, phone: (e.target as HTMLInputElement).value } }) } }) as HTMLInputElement;
  const dateInput = h('input', { attrs: { type: 'date', value: order.eventDate }, on: { change: (e) => store.updateOrder({ eventDate: (e.target as HTMLInputElement).value }) } }) as HTMLInputElement;
  const peopleInput = h('input', { attrs: { type: 'number', min: '1', value: order.people }, on: { change: (e) => store.updateOrder({ people: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) }) } }) as HTMLInputElement;
  const budgetInput = h('input', { attrs: { type: 'number', min: '0', step: '50', value: order.budget }, on: { change: (e) => store.updateOrder({ budget: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) }) } }) as HTMLInputElement;
  const typeSelect = h('select', { on: { change: (e) => store.updateOrder({ eventType: (e.target as HTMLSelectElement).value as EventType }) } }) as HTMLSelectElement;
  for (const [value, label] of [['wedding', '婚礼'], ['birthday', '生日'], ['party', '聚会/甜品台']] as const) {
    const opt = h('option', { attrs: { value }, text: label }) as HTMLOptionElement;
    if (order.eventType === value) opt.selected = true;
    typeSelect.append(opt);
  }
  const statusSelect = h('select', { on: { change: (e) => store.updateOrder({ status: (e.target as HTMLSelectElement).value as Order['status'] }) } }) as HTMLSelectElement;
  for (const [value, label] of [['consulting', '咨询中'], ['confirmed', '已确认'], ['making', '制作中'], ['delivered', '已交付']] as const) {
    const opt = h('option', { attrs: { value }, text: label }) as HTMLOptionElement;
    if (order.status === value) opt.selected = true;
    statusSelect.append(opt);
  }
  const noteInput = h('textarea', { attrs: { rows: '3', placeholder: '口味、忌口、现场环境等' }, props: { value: order.customer.note ?? '' }, on: { change: (e) => store.updateOrder({ customer: { ...order.customer, note: (e.target as HTMLTextAreaElement).value } }) } }) as HTMLTextAreaElement;

  const form = h('div', { class: 'panel form-panel' },
    h('div', { class: 'panel-title-row' }, h('h2', { text: '订单信息' }), h('code', { class: 'order-code-badge', text: order.code })),
    h('div', { class: 'form-grid' },
      field('客户', nameInput), field('联系方式', phoneInput),
      field('场合', typeSelect), field('状态', statusSelect),
      field('日期', dateInput), field('人数', peopleInput, '用于推荐尺寸和制作单份量'),
      field('预算 ¥', budgetInput), h('div', { class: 'field full' }, field('备注', noteInput))
    ),
    h('div', { class: 'danger-row' },
      button('删除订单', async () => {
        if (window.confirm(`确定删除订单 ${order.customer.name} 及其 ${proposals.length} 个方案？此操作会同步删除 IndexedDB 数据。`)) {
          await store.removeOrder(order.id);
          store.toast('订单已删除');
        }
      }, 'btn-danger-ghost')
    )
  );

  const proposalCards = proposals.map((p) => h('div', { class: `proposal-card ${store.state.currentDesignId === p.id ? 'active' : ''}` },
    h('div', { class: 'proposal-head' },
      h('div', {}, h('strong', { text: p.proposalLabel }), h('div', { text: p.name })),
      h('span', { class: 'muted', text: `${p.tiers.length} 层 · ${p.paths.length} 条裱花 · ${p.decorations.length} 装饰` })
    ),
    h('div', { class: 'proposal-actions' },
      button(store.state.currentDesignId === p.id ? '当前方案 · 设计蛋糕胚' : '选择并设计', () => {
        store.selectDesign(p.id);
        store.setRoute('cake');
      }, 'btn-primary btn-sm'),
      button('复制', () => { store.duplicateDesign(p.id); store.toast('已复制方案'); }, 'btn-ghost btn-sm'),
      button('删除', async () => {
        if (window.confirm('删除这个方案？')) await store.removeDesign(p.id);
      }, 'btn-text-danger btn-sm')
    )
  ));

  const proposalPanel = h('div', { class: 'panel proposal-panel' },
    h('div', { class: 'panel-title-row' }, h('h2', { text: '客户方案' }), button('＋ 新方案', () => { store.createProposal(); store.toast('已创建可对比方案'); }, 'btn-secondary btn-sm')),
    h('p', { class: 'muted', text: '一个订单可出多个方案；所有方案独立保存在 IndexedDB。' }),
    h('div', { class: 'proposal-grid' }, ...proposalCards.length ? proposalCards : [h('div', { class: 'empty-state small', text: '还没有方案' })])
  );

  wrap.append(form, proposalPanel);
  return wrap;
}
