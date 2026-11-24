// 蛋糕胚页：形状选择 / 多层堆叠 / 尺寸调节 / 按人数推荐
import type { CakeDesign, CakeLayer, LayerShape, MaterialKind } from '../model/types.ts'
import { store } from '../state/store.ts'
import { el, numberField } from '../ui/dom.ts'
import { createViewport } from '../ui/viewport.ts'
import { uid } from '../lib/math3d.ts'
import {
  DEFAULT_LAYER_HEIGHT,
  footprintArea,
  recommendSingleLayer,
  recommendTiers,
  stackLayers
} from '../lib/geometry.ts'
import { COLOR_CARD, rgbToCss } from '../lib/materials.ts'
import { navigate } from '../ui/router.ts'

const SHAPE_LABELS: { value: LayerShape; label: string }[] = [
  { value: 'round', label: '圆形' },
  { value: 'square', label: '方形' },
  { value: 'heart', label: '心形' }
]

const MATERIAL_LABELS: { value: MaterialKind; label: string }[] = [
  { value: 'cream', label: '奶油' },
  { value: 'fondant', label: '翻糖' },
  { value: 'glaze', label: '镜面淋面' }
]

export function renderLayersPage(designId: string): HTMLElement {
  const design = store.getState().designs.find((item) => item.id === designId)
  if (!design) return missingDesign()

  const viewport = createViewport()
  viewport.setDesign(design)

  const working: CakeDesign = structuredClone(design)
  let selectedId: string | null = working.layers[0]?.id ?? null

  const layerList = el('div', { class: 'col' })
  const editor = el('div', { class: 'card panel' })

  const persist = async (): Promise<void> => {
    await store.saveDesign(working)
    viewport.setDesign(working)
  }

  const refreshList = (): void => {
    layerList.replaceChildren(
      ...working.layers.map((layer, index) => {
        const row = el('div', {
          class: `list-row${layer.id === selectedId ? ' selected' : ''}`,
          onclick: () => {
            selectedId = layer.id
            refreshList()
            refreshEditor()
          }
        }, [
          el('div', {}, [
            el('h4', {}, [`第 ${index + 1} 层 · ${shapeLabel(layer.shape)}`]),
            el('span', { class: 'muted' }, [
              `直径 ${layer.diameter}cm × 高 ${layer.height}cm · ${materialLabel(layer.material)}`
            ])
          ]),
          el('button', {
            class: 'danger ghost',
            textContent: '移除',
            onclick: async (event) => {
              event.stopPropagation()
              working.layers = working.layers.filter((item) => item.id !== layer.id)
              if (selectedId === layer.id) selectedId = working.layers[0]?.id ?? null
              await persist()
              refreshList()
              refreshEditor()
            }
          })
        ])
        return row
      })
    )
  }

  const refreshEditor = (): void => {
    editor.replaceChildren()
    const layer = working.layers.find((item) => item.id === selectedId)
    if (!layer) {
      editor.append(el('p', { class: 'muted' }, ['选择或添加一层后编辑参数']))
      return
    }

    const shapeSelect = segmented(
      SHAPE_LABELS.map((item) => item.label),
      SHAPE_LABELS.findIndex((item) => item.value === layer.shape),
      (index) => {
        layer.shape = SHAPE_LABELS[index].value
        void persist()
        refreshList()
        refreshEditor()
      }
    )

    const materialSelect = segmented(
      MATERIAL_LABELS.map((item) => item.label),
      MATERIAL_LABELS.findIndex((item) => item.value === layer.material),
      (index) => {
        layer.material = MATERIAL_LABELS[index].value
        if (layer.material !== 'glaze') layer.dripRatio = 0
        void persist()
        refreshList()
        refreshEditor()
      }
    )

    const diameterField = numberField('直径 / 边长', layer.diameter, (v) => {
      layer.diameter = v
      void persist()
      refreshList()
    }, { min: 8, max: 60, step: 1, unit: 'cm' })

    const heightField = numberField('层高度', layer.height, (v) => {
      layer.height = v
      void persist()
      refreshList()
    }, { min: 4, max: 24, step: 1, unit: 'cm' })

    const colorPicker = el('div', { class: 'color-grid' },
      COLOR_CARD.map((card) =>
        el('div', {
          class: `swatch${card.value.r === layer.color.r && card.value.g === layer.color.g && card.value.b === layer.color.b ? ' selected' : ''}`,
          style: `background:${rgbToCss(card.value)}`,
          title: card.name,
          onclick: () => {
            layer.color = { ...card.value }
            void persist()
            refreshEditor()
          }
        })
      )
    )

    editor.append(
      el('h3', {}, ['层参数']),
      fieldBlock('形状', shapeSelect),
      fieldBlock('表面材质', materialSelect),
      diameterField,
      heightField,
      fieldBlock('色卡配色', colorPicker)
    )

    if (layer.material === 'glaze') {
      const dripField = numberField('滴落长度比例', layer.dripRatio, (v) => {
        layer.dripRatio = Math.min(1, Math.max(0, v))
        void persist()
      }, { min: 0, max: 1, step: 0.05 })
      editor.append(dripField)
    }
  }

  const addLayer = (shape: LayerShape): void => {
    const order = store.getState().orders.find((item) => item.designIds.includes(design.id))
    const recommended = recommendSingleLayer(order?.servings ?? 20, shape)
    const layer: CakeLayer = {
      id: uid(),
      shape,
      diameter: Math.max(12, recommended - working.layers.length * 5),
      height: DEFAULT_LAYER_HEIGHT,
      material: 'cream',
      color: { ...COLOR_CARD[0].value },
      dripRatio: 0
    }
    working.layers.push(layer)
    selectedId = layer.id
    void persist()
    refreshList()
    refreshEditor()
  }

  const suggestion = recommendTiers(store.getState().orders.find((o) => o.designIds.includes(design.id))?.servings ?? 20)
  const layout = stackLayers(working.layers)

  const sidePanel = el('div', { class: 'panel' }, [
    el('div', { class: 'card panel' }, [
      el('h3', {}, ['添加层']),
      el('div', { class: 'toolbar' },
        SHAPE_LABELS.map((item) =>
          el('button', {
            textContent: item.label,
            onclick: () => addLayer(item.value)
          })
        )
      ),
      el('p', { class: 'muted' }, [
        `按人数推荐：${suggestion.tiers.join(' / ')}cm，约 ${suggestion.totalServings} 份`
      ])
    ]),
    el('div', { class: 'card panel' }, [el('h3', {}, ['层列表']), layerList]),
    editor,
    el('div', { class: 'card panel' }, [
      el('h3', {}, ['胚体概况']),
      el('div', { class: 'stat-grid' }, [
        stat('层数', String(working.layers.length)),
        stat('总高', `${layout.at(-1)?.yTop ?? 0}cm`),
        stat('占地面积', `${Math.round(footprintArea(working.layers.at(-1)?.shape ?? 'round', working.layers.at(-1)?.diameter ?? 0))}cm²`)
      ]),
      el('button', {
        class: 'primary',
        textContent: '去裱花编辑',
        onclick: () => navigate(`/piping/${design.id}`)
      })
    ])
  ])

  refreshList()
  refreshEditor()

  return el('div', { class: 'page' }, [
    el('div', { class: 'page-header' }, [el('h1', {}, [`蛋糕胚 · ${design.name}`])]),
    el('div', { class: 'split' }, [viewport.root, sidePanel])
  ])
}

function segmented(labels: string[], activeIndex: number, onPick: (index: number) => void): HTMLElement {
  return el('div', { class: 'segmented' },
    labels.map((label, index) =>
      el('button', {
        class: index === activeIndex ? 'active' : '',
        textContent: label,
        onclick: () => onPick(index)
      })
    )
  )
}

const fieldBlock = (label: string, node: HTMLElement): HTMLElement =>
  el('div', {}, [el('label', {}, [label]), node])

const stat = (label: string, value: string): HTMLElement =>
  el('div', { class: 'stat-item' }, [
    el('div', { class: 'value' }, [value]),
    el('div', { class: 'label' }, [label])
  ])

const shapeLabel = (shape: LayerShape): string =>
  SHAPE_LABELS.find((item) => item.value === shape)?.label ?? shape

const materialLabel = (material: MaterialKind): string =>
  MATERIAL_LABELS.find((item) => item.value === material)?.label ?? material

const missingDesign = (): HTMLElement =>
  el('div', { class: 'page' }, [
    el('div', { class: 'empty-state' }, [
      el('h3', {}, ['方案不存在']),
      el('button', { class: 'primary', textContent: '返回订单列表', onclick: () => navigate('/orders') })
    ])
  ])
