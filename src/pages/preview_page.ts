// 效果预览页：双灯光场景 / 客户效果图导出 / 制作单打印
import type { CakeDesign, LightingScene } from '../model/types.ts'
import { store } from '../state/store.ts'
import { el } from '../ui/dom.ts'
import { createViewport } from '../ui/viewport.ts'
import { navigate } from '../ui/router.ts'
import { computeStats } from '../lib/stats.ts'
import { renderProductionSheet } from '../lib/production_sheet.ts'

export function renderPreviewPage(designId: string): HTMLElement {
  const initial = store.getState().designs.find((item) => item.id === designId)
  if (!initial) {
    return el('div', { class: 'page' }, [
      el('div', { class: 'empty-state' }, [
        el('h3', {}, ['方案不存在']),
        el('button', { class: 'primary', textContent: '返回订单列表', onclick: () => navigate('/orders') })
      ])
    ])
  }

  const design: CakeDesign = structuredClone(initial)
  const viewport = createViewport()
  viewport.setDesign(design)
  const state = store.getState()
  const order = state.orders.find((item) => item.designIds.includes(design.id))
  const stats = computeStats(design, state.settings)

  const lightingSwitch = el('div', { class: 'segmented no-print' }, [
    el('button', {
      class: design.lighting === 'shop' ? 'active' : '',
      textContent: '店内灯光',
      onclick: () => switchLighting('shop')
    }),
    el('button', {
      class: design.lighting === 'wedding' ? 'active' : '',
      textContent: '婚礼现场',
      onclick: () => switchLighting('wedding')
    })
  ])

  async function switchLighting(scene: LightingScene): Promise<void> {
    design.lighting = scene
    await store.saveDesign(design)
    viewport.setLighting(design)
    lightingSwitch.querySelectorAll('button').forEach((button, index) => {
      button.classList.toggle('active', (scene === 'shop' ? 0 : 1) === index)
    })
  }

  const exportImage = el('button', {
    class: 'primary no-print',
    textContent: '导出客户效果图',
    onclick: () => {
      const renderer = viewport.renderer()
      if (!renderer) return
      const url = renderer.snapshot()
      const link = document.createElement('a')
      link.href = url
      link.download = `${design.name}-效果图.png`
      link.click()
    }
  })

  const printButton = el('button', {
    class: 'no-print',
    textContent: '打印制作单',
    onclick: () => window.print()
  })

  const summary = el('div', { class: 'card no-print panel' }, [
    el('h3', {}, ['方案概况']),
    el('div', { class: 'stat-grid' }, [
      stat('层数', String(design.layers.length)),
      stat('挤花路径', String(stats.piping.pathCount)),
      stat('装饰件', String(stats.decorationCount)),
      stat('总用料', `${stats.totalMass.toFixed(0)}g`)
    ]),
    el('div', { class: 'toolbar' }, [lightingSwitch, exportImage, printButton]),
    el('p', { class: 'muted' }, ['拖拽旋转视角，滚轮缩放；制作单在页面下方，可直接打印交给裱花师'])
  ])

  const sheet = renderProductionSheet(design, order, state.settings)

  return el('div', { class: 'page' }, [
    el('div', { class: 'page-header no-print' }, [el('h1', {}, [`效果预览 · ${design.name}`])]),
    el('div', { class: 'split preview-split' }, [
      el('div', { class: 'panel' }, [viewport.root, summary]),
      el('div', { class: 'panel' }, [sheet])
    ])
  ])
}

const stat = (label: string, value: string): HTMLElement =>
  el('div', { class: 'stat-item' }, [
    el('div', { class: 'value' }, [value]),
    el('div', { class: 'label' }, [label])
  ])
