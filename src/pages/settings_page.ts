// 设置页：材质密度、渲染参数、数据管理
import type { AppSettings } from '../model/types.ts'
import { store } from '../state/store.ts'
import { el, numberField } from '../ui/dom.ts'

export function renderSettingsPage(): HTMLElement {
  const settings: AppSettings = structuredClone(store.getState().settings)

  const save = async (): Promise<void> => {
    await store.saveSettings(settings)
    tip.textContent = '已保存'
    window.setTimeout(() => (tip.textContent = ''), 1600)
  }

  const tip = el('span', { class: 'muted' }, [])

  const card = el('div', { class: 'card panel', style: 'max-width:560px' }, [
    el('h3', {}, ['用料密度']),
    numberField('奶油密度', settings.creamDensity, (v) => {
      settings.creamDensity = v
      void save()
    }, { min: 0.1, max: 2, step: 0.01, unit: 'g/cm³' }),
    numberField('翻糖密度', settings.fondantDensity, (v) => {
      settings.fondantDensity = v
      void save()
    }, { min: 0.1, max: 3, step: 0.01, unit: 'g/cm³' }),
    numberField('淋面密度', settings.glazeDensity, (v) => {
      settings.glazeDensity = v
      void save()
    }, { min: 0.1, max: 3, step: 0.01, unit: 'g/cm³' }),
    el('h3', {}, ['渲染性能']),
    numberField('目标帧率', settings.targetFps, (v) => {
      settings.targetFps = Math.max(15, Math.round(v))
      void save()
    }, { min: 15, max: 60, step: 5, unit: 'fps' }),
    numberField('渲染缩放', settings.renderScale, (v) => {
      settings.renderScale = Math.min(1, Math.max(0.5, v))
      void save()
    }, { min: 0.5, max: 1, step: 0.05 }),
    el('p', { class: 'muted' }, [
      '帧率低于目标时系统会自动降低渲染分辨率保流畅，缩放下限 50%'
    ]),
    el('div', { class: 'row' }, [el('button', { class: 'primary', textContent: '保存设置', onclick: () => void save() }), tip])
  ])

  const dataCard = el('div', { class: 'card panel', style: 'max-width:560px' }, [
    el('h3', {}, ['本地数据']),
    el('p', { class: 'muted' }, [
      `当前 IndexedDB 中存有 ${store.getState().orders.length} 个订单、${store.getState().designs.length} 个方案`
    ]),
    el('div', { class: 'toolbar' }, [
      el('button', {
        textContent: '导出全部数据 (JSON)',
        onclick: () => {
          const blob = new Blob([JSON.stringify(store.getState(), null, 2)], {
            type: 'application/json'
          })
          const url = URL.createObjectURL(blob)
          const link = document.createElement('a')
          link.href = url
          link.download = 'cake-studio-backup.json'
          link.click()
          URL.revokeObjectURL(url)
        }
      }),
      el('button', {
        class: 'danger',
        textContent: '清空全部数据',
        onclick: async () => {
          if (!window.confirm('确认清空所有订单和方案？此操作不可恢复')) return
          const state = store.getState()
          for (const order of state.orders) await store.removeOrder(order.id)
          for (const design of state.designs) await store.removeDesign(design.id)
          window.location.hash = '#/orders'
        }
      })
    ])
  ])

  return el('div', { class: 'page' }, [
    el('div', { class: 'page-header' }, [el('h1', {}, ['设置'])]),
    card,
    dataCard
  ])
}
