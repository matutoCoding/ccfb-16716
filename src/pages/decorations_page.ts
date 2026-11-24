// 装饰件页：水果 / 巧克力片 / 糖珠 / 数字蜡烛的摆放、旋转与缩放
import type { CakeDesign, Decoration, DecorationKind, RGB } from '../model/types.ts'
import { store } from '../state/store.ts'
import { el, numberField } from '../ui/dom.ts'
import { createViewport } from '../ui/viewport.ts'
import { navigate } from '../ui/router.ts'
import { uid } from '../lib/math3d.ts'
import { layerTopY } from '../lib/geometry.ts'
import { COLOR_CARD, rgbToCss } from '../lib/materials.ts'
import { pickDecoration, pickScene } from '../render/picking.ts'

const KIND_LABELS: { value: DecorationKind; label: string; defaultColor: RGB }[] = [
  { value: 'fruit_strawberry', label: '草莓', defaultColor: { r: 214, 64, 72 } },
  { value: 'fruit_blueberry', label: '蓝莓', defaultColor: { r: 74, 78, 148 } },
  { value: 'chocolate_shard', label: '巧克力片', defaultColor: { r: 79, 47, 35 } },
  { value: 'sugar_pearl', label: '糖珠', defaultColor: { r: 240, 236, 226 } },
  { value: 'number_candle', label: '数字蜡烛', defaultColor: { r: 244, 178, 196 } }
]

export function renderDecorationsPage(designId: string): HTMLElement {
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
  let selectedId: string | null = null

  const list = el('div', { class: 'col' })
  const editor = el('div', { class: 'card panel' })

  const persist = async (): Promise<void> => {
    await store.saveDesign(design)
    viewport.setDesign(design)
  }

  const topY = (): number =>
    design.layers.length ? layerTopY(design.layers, design.layers[design.layers.length - 1].id) : 4

  const addDecoration = (kind: DecorationKind): void => {
    const preset = KIND_LABELS.find((item) => item.value === kind)
    const decoration: Decoration = {
      id: uid(),
      kind,
      x: 0,
      y: topY() + 1,
      z: 0,
      rotationY: 0,
      scale: kind === 'sugar_pearl' ? 0.8 : 1.6,
      color: { ...preset?.defaultColor ?? COLOR_CARD[0].value },
      digit: 1
    }
    design.decorations.push(decoration)
    selectedId = decoration.id
    void persist()
    refresh()
  }

  const canvas = viewport.root.querySelector('canvas') as HTMLCanvasElement
  let dragging = false

  const ndc = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    return [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    ]
  }

  canvas?.addEventListener('pointerdown', (event) => {
    const renderer = viewport.renderer()
    if (!renderer) return
    const [nx, ny] = ndc(event)
    const hitId = pickDecoration(design, renderer.getCamera(), nx, ny)
    if (hitId) {
      selectedId = hitId
      dragging = true
      canvas.setPointerCapture(event.pointerId)
      refresh()
    }
  })

  canvas?.addEventListener('pointermove', (event) => {
    if (!dragging || !selectedId) return
    const renderer = viewport.renderer()
    const target = design.decorations.find((item) => item.id === selectedId)
    if (!renderer) return
    const [nx, ny] = ndc(event)
    const hit = pickScene(design, renderer.getCamera(), nx, ny)
    if (hit) {
      target.x = hit.point[0]
      target.z = hit.point[2]
      target.y = topY() + target.scale * 0.5
      void persist()
      refresh()
    }
  })

  canvas?.addEventListener('pointerup', () => {
    dragging = false
  })

  function refresh(): void {
    list.replaceChildren(
      ...design.decorations.map((decoration) => {
        const preset = KIND_LABELS.find((item) => item.value === decoration.kind)
        return el('div', {
          class: `list-row${decoration.id === selectedId ? ' selected' : ''}`,
          onclick: () => {
            selectedId = decoration.id
            refresh()
          }
        }, [
          el('div', {}, [
            el('h4', {}, [preset?.label ?? decoration.kind]),
            el('span', { class: 'muted' }, [
              `位置 (${decoration.x.toFixed(1)}, ${decoration.z.toFixed(1)}) · 缩放 ${decoration.scale.toFixed(1)}`
            ])
          ]),
          el('button', {
            class: 'danger ghost',
            textContent: '删除',
            onclick: async (event) => {
              event.stopPropagation()
              design.decorations = design.decorations.filter((item) => item.id !== decoration.id)
              if (selectedId === decoration.id) selectedId = null
              await persist()
              refresh()
            }
          })
        ])
      })
    )

    editor.replaceChildren()
    const target = design.decorations.find((item) => item.id === selectedId)
    if (!target) {
      editor.append(el('p', { class: 'muted' }, ['点击场景中的装饰件进行摆放，或从上方添加']))
      return
    }

    editor.append(
      el('h3', {}, ['装饰件参数']),
      numberField('X 位置', target.x, (v) => {
        target.x = v
        void persist()
        refresh()
      }, { step: 0.5, unit: 'cm' }),
      numberField('Z 位置', target.z, (v) => {
        target.z = v
        void persist()
        refresh()
      }, { step: 0.5, unit: 'cm' }),
      numberField('高度', target.y, (v) => {
        target.y = v
        void persist()
      }, { step: 0.5, unit: 'cm' }),
      numberField('旋转角度', (target.rotationY * 180) / Math.PI, (v) => {
        target.rotationY = (v * Math.PI) / 180
        void persist()
        refresh()
      }, { min: -180, max: 180, step: 5, unit: '度' }),
      numberField('缩放', target.scale, (v) => {
        target.scale = Math.max(0.3, v)
        void persist()
        refresh()
      }, { min: 0.3, max: 5, step: 0.1 })
    )

    if (target.kind === 'number_candle') {
      editor.append(
        numberField('蜡烛数字', target.digit, (v) => {
          target.digit = Math.min(9, Math.max(0, Math.round(v)))
          void persist()
          refresh()
        }, { min: 0, max: 9, step: 1 })
      )
    }

    const colorGrid = el('div', { class: 'color-grid' },
      COLOR_CARD.map((card) =>
        el('div', {
          class: `swatch${rgbToCss(card.value) === rgbToCss(target.color) ? ' selected' : ''}`,
          style: `background:${rgbToCss(card.value)}`,
          title: card.name,
          onclick: () => {
            target.color = { ...card.value }
            void persist()
            refresh()
          }
        })
      )
    )
    editor.append(el('div', {}, [el('label', {}, ['颜色']), colorGrid]))
  }

  const sidePanel = el('div', { class: 'panel' }, [
    el('div', { class: 'card panel' }, [
      el('h3', {}, ['添加装饰件']),
      el('div', { class: 'toolbar' },
        KIND_LABELS.map((item) =>
          el('button', { textContent: item.label, onclick: () => addDecoration(item.value) })
        )
      ),
      el('p', { class: 'muted' }, ['添加后在场景中直接拖拽即可摆放到蛋糕表面'])
    ]),
    el('div', { class: 'card panel' }, [el('h3', {}, [`已放置（${design.decorations.length}）`]), list]),
    editor,
    el('div', { class: 'card panel' }, [
      el('button', { class: 'primary', textContent: '去效果预览', onclick: () => navigate(`/preview/${design.id}`) })
    ])
  ])

  refresh()

  return el('div', { class: 'page' }, [
    el('div', { class: 'page-header' }, [el('h1', {}, [`装饰件 · ${design.name}`])]),
    el('div', { class: 'split' }, [viewport.root, sidePanel])
  ])
}
