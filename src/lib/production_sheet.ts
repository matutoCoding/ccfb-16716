// 裱花师制作单：逐层用料、花嘴型号、裱花顺序，支持打印
import type { AppSettings, CakeDesign, Order } from '../model/types.ts'
import { computeStats } from './stats.ts'
import { stackLayers } from './geometry.ts'
import { pathVolume } from './piping.ts'
import { el } from '../ui/dom.ts'

const MATERIAL_NAME = {
  cream: '奶油',
  fondant: '翻糖',
  glaze: '镜面淋面'
}

const SHAPE_NAME = {
  round: '圆形',
  square: '方形',
  heart: '心形'
}

export function renderProductionSheet(
  design: CakeDesign,
  order: Order | undefined,
  settings: AppSettings
): HTMLElement {
  const stats = computeStats(design, settings)
  const layout = stackLayers(design.layers)

  const header = el('div', { class: 'sheet-head' }, [
    el('h2', {}, ['蛋糕制作单']),
    el('p', { class: 'muted' }, [
      `${order ? `客户：${order.customer} · ${order.dueDate || '日期待定'} · ${order.servings}人` : '未关联订单'} · 方案：${design.name}`
    ])
  ])

  const layerTables = design.layers.map((layer, index) => {
    const layerStat = stats.layers.find((item) => item.layerId === layer.id)
    const paths = design.paths.filter((path) => path.layerId === layer.id)
    const rows = paths.map((path, orderIndex) =>
      el('tr', {}, [
        el('td', {}, [String(orderIndex + 1)]),
        el('td', {}, [path.surface === 'top' ? '顶面' : '侧面']),
        el('td', {}, [path.nozzleCode]),
        el('td', {}, [`${path.points.length} 个采样点`]),
        el('td', {}, [`${pathVolume(path).toFixed(2)} cm³`]),
        el('td', {}, [colorCell(path.color.r, path.color.g, path.color.b)])
      ])
    )

    return el('div', { class: 'card sheet-layer' }, [
      el('h3', {}, [
        `第 ${index + 1} 层 · ${SHAPE_NAME[layer.shape]} · 直径 ${layer.diameter}cm × 高 ${layer.height}cm`
      ]),
      el('p', { class: 'muted' }, [
        `底面高度 ${layout[index].yBottom}cm · 表层：${MATERIAL_NAME[layer.material]} · 胚体 ${layerStat?.cakeVolume.toFixed(0)}cm³ · 包覆用料 ${layerStat?.coatingVolume.toFixed(1)}cm³`
      ]),
      paths.length
        ? el('table', {}, [
            el('thead', {}, [
              el('tr', {}, [
                el('th', {}, ['顺序']),
                el('th', {}, ['位置']),
                el('th', {}, ['花嘴型号']),
                el('th', {}, ['规模']),
                el('th', {}, ['奶油体积']),
                el('th', {}, ['颜色'])
              ])
            ]),
            el('tbody', {}, rows)
          ])
        : el('p', { class: 'muted' }, ['本层暂无挤花'])
    ])
  })

  const materialRows = stats.materials.map((item) =>
    el('tr', {}, [
      el('td', {}, [MATERIAL_NAME[item.material]]),
      el('td', {}, [`${item.volume.toFixed(1)} cm³`]),
      el('td', {}, [`${item.mass.toFixed(1)} g`])
    ])
  )

  const nozzleRows = stats.piping.byNozzle.map((item) =>
    el('tr', {}, [
      el('td', {}, [item.nozzle]),
      el('td', {}, [String(item.count)]),
      el('td', {}, [`${item.volume.toFixed(1)} cm³`])
    ])
  )

  return el('div', { class: 'sheet' }, [
    header,
    el('div', { class: 'stat-grid' }, [
      el('div', { class: 'stat-item' }, [
        el('div', { class: 'value' }, [String(stats.piping.pathCount)]),
        el('div', { class: 'label' }, ['挤花路径'])
      ]),
      el('div', { class: 'stat-item' }, [
        el('div', { class: 'value' }, [String(stats.piping.segmentCount)]),
        el('div', { class: 'label' }, ['管段总数'])
      ]),
      el('div', { class: 'stat-item' }, [
        el('div', { class: 'value' }, [`${stats.piping.totalVolume.toFixed(1)}cm³`]),
        el('div', { class: 'label' }, ['奶油累加体积'])
      ]),
      el('div', { class: 'stat-item' }, [
        el('div', { class: 'value' }, [`${stats.totalMass.toFixed(0)}g`]),
        el('div', { class: 'label' }, ['总用料质量'])
      ])
    ]),
    ...layerTables,
    el('div', { class: 'card' }, [
      el('h3', {}, ['材质汇总']),
      el('table', {}, [
        el('thead', {}, [el('tr', {}, [el('th', {}, ['材质']), el('th', {}, ['体积']), el('th', {}, ['质量'])])]),
        el('tbody', {}, materialRows)
      ])
    ]),
    el('div', { class: 'card' }, [
      el('h3', {}, ['花嘴用量']),
      nozzleRows.length
        ? el('table', {}, [
            el('thead', {}, [el('tr', {}, [el('th', {}, ['花嘴']), el('th', {}, ['路径数']), el('th', {}, ['体积'])])]),
            el('tbody', {}, nozzleRows)
          ])
        : el('p', { class: 'muted' }, ['暂无挤花'])
    ])
  ])
}

const colorCell = (r: number, g: number, b: number): HTMLElement =>
  el('div', { class: 'row' }, [
    el('span', {
      class: 'status-dot',
      style: `background:rgb(${r},${g},${b}); width:14px; height:14px;`
    }),
    el('span', { class: 'muted' }, [`${r}/${g}/${b}`])
  ])
