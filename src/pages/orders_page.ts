// 订单列表页：订单录入 / 方案管理入口
import type { Order } from '../model/types.ts'
import { store } from '../state/store.ts'
import { el, textField, numberField } from '../ui/dom.ts'
import { navigate } from '../ui/router.ts'
import { uid } from '../lib/math3d.ts'
import { buildSeedOrder } from '../lib/seed_scenarios.ts'

const emptyIcon =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/></svg>'

export function renderOrdersPage(): HTMLElement {
  const state = store.getState()

  const formCard = el('div', { class: 'card col' })
  const draft = {
    customer: '',
    phone: '',
    dueDate: '',
    servings: 20,
    budget: 500,
    note: ''
  }

  const customerField = textField('客户称呼', '', (v) => (draft.customer = v), {
    placeholder: '如：王女士'
  })
  const phoneField = textField('联系电话', '', (v) => (draft.phone = v))
  const dateField = textField('交付日期', '', (v) => (draft.dueDate = v), { type: 'date' })
  const servingsField = numberField('用餐人数', 20, (v) => (draft.servings = v), {
    min: 1,
    step: 1
  })
  const budgetField = numberField('预算', 500, (v) => (draft.budget = v), {
    min: 0,
    step: 50,
    unit: '元'
  })
  const noteField = textField('备注', '', (v) => (draft.note = v), {
    placeholder: '口味、忌口、配送要求'
  })

  const submit = el('button', {
    class: 'primary',
    textContent: '新建订单',
    onclick: async () => {
      if (!draft.customer.trim()) {
        customerField.querySelector('input')?.focus()
        return
      }
      const order: Order = {
        id: uid(),
        customer: draft.customer.trim(),
        phone: draft.phone.trim(),
        dueDate: draft.dueDate,
        servings: draft.servings,
        budget: draft.budget,
        note: draft.note,
        designIds: [],
        createdAt: Date.now()
      }
      await store.saveOrder(order)
      listContainer.replaceChildren(buildOrderList())
    }
  })

  formCard.append(
    el('h3', {}, ['录入新订单']),
    el('div', { class: 'form-grid' }, [
      customerField,
      phoneField,
      dateField,
      servingsField,
      budgetField,
      noteField
    ]),
    el('div', {}, [submit])
  )

  const listContainer = el('div', { class: 'col' })
  listContainer.append(buildOrderList())

  const seedButton = el('button', {
    textContent: '载入三个测试方案',
    onclick: async () => {
      const seed = buildSeedOrder()
      for (const design of seed.designs) await store.saveDesign(design)
      await store.saveOrder(seed.order)
      listContainer.replaceChildren(buildOrderList())
    }
  })

  return el('div', { class: 'page' }, [
    el('div', { class: 'page-header' }, [
      el('h1', {}, ['订单列表']),
      el('div', { class: 'row' }, [
        seedButton,
        el('span', { class: 'muted' }, [`共 ${state.orders.length} 个订单`])
      ])
    ]),
    formCard,
    listContainer
  ])
}

function buildOrderList(): HTMLElement {
  const state = store.getState()
  if (state.orders.length === 0) {
    return el('div', { class: 'empty-state', innerHTML: emptyIcon }, [
      el('h3', {}, ['还没有订单']),
      el('p', {}, ['录入第一张订单，开始为客户设计蛋糕'])
    ])
  }
  const rows = state.orders.map((order) => {
    const designs = state.designs.filter((design) => order.designIds.includes(design.id))
    const designChips = designs.length
      ? el(
          'div',
          { class: 'chip-row' },
          designs.map((design) =>
            el('button', {
              class: 'chip',
              textContent: design.name,
              onclick: () => navigate(`/layers/${design.id}`)
            })
          )
        )
      : el('span', { class: 'muted' }, ['暂无方案'])

    const addDesign = el('button', {
      textContent: '新增方案',
      onclick: async () => {
        const name = `方案 ${order.designIds.length + 1}`
        const design = await store.createDesign(order.id, name)
        navigate(`/layers/${design.id}`)
      }
    })

    const remove = el('button', {
      class: 'danger ghost',
      textContent: '删除',
      onclick: async () => {
        if (window.confirm(`确认删除 ${order.customer} 的订单及其全部方案？`)) {
          await store.removeOrder(order.id)
          navigate('/orders')
        }
      }
    })

    return el('div', { class: 'card order-card' }, [
      el('div', { class: 'order-head' }, [
        el('h3', {}, [order.customer]),
        el('div', { class: 'row' }, [
          el('span', { class: 'muted' }, [
            `${order.dueDate || '日期待定'} · ${order.servings}人 · 预算 ¥${order.budget}`
          ]),
          remove
        ])
      ]),
      order.phone ? el('p', { class: 'muted' }, [`电话：${order.phone}`]) : el('span'),
      order.note ? el('p', { class: 'muted' }, [`备注：${order.note}`]) : el('span'),
      el('div', { class: 'order-actions' }, [designChips, addDesign])
    ])
  })

  return el('div', { class: 'col' }, rows)
}
