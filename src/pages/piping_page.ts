// 裱花编辑页：自由挤花 + 玫瑰/花边一键生成 + 花嘴/压力/速度参数
import type { CakeDesign, DrawSurface, NozzleProfile, PathPoint, PipingPath, RGB } from '../model/types.ts'
import { store } from '../state/store.ts'
import { el, numberField } from '../ui/dom.ts'
import { createViewport } from '../ui/viewport.ts'
import { navigate } from '../ui/router.ts'
import { clamp, uid } from '../lib/math3d.ts'
import {
  generateBorderForLayers,
  generateRose,
  generateSideBand,
  NOZZLE_CODES,
  pathVolume,
  radiusFromInput,
  type BorderKind
} from '../lib/piping.ts'
import { clampToFootprint, layerTopY, stackLayers } from '../lib/geometry.ts'
import { COLOR_CARD, hslToRgb, rgbToCss, whippedColor } from '../lib/materials.ts'
import { pickScene } from '../render/picking.ts'

export function renderPipingPage(designId: string): HTMLElement {
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

  const params = {
    layerId: design.layers[0]?.id ?? '',
    surface: 'top' as DrawSurface,
    nozzle: 'round' as NozzleProfile,
    baseRadius: 0.5,
    pressure: 0.8,
    refSpeed: 6,
    color: { ...COLOR_CARD[2].value } as RGB,
    whip: 0.8
  }

  let drawing = false
  let activePath: PipingPath | null = null
  let lastPointer = { x: 0, y: 0, t: 0 }
  const undoStack: PipingPath[][] = []

  const pathList = el('div', { class: 'col' })
  const volumeBar = el('div', { class: 'stat-grid' })

  const persist = async (): Promise<void> => {
    await store.saveDesign(design)
    viewport.setDesign(design)
    refreshStats()
  }

  const canvas = viewport.root.querySelector('canvas') as HTMLCanvasElement

  const ndc = (event: PointerEvent): [number, number] => {
    const rect = canvas.getBoundingClientRect()
    return [
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1)
    ]
  }

  const pushUndo = (): void => {
    undoStack.push(structuredClone(design.paths))
    if (undoStack.length > 30) undoStack.shift()
  }

  canvas?.addEventListener('pointerdown', (event) => {
    const renderer = viewport.renderer()
    const layer = design.layers.find((item) => item.id === params.layerId)
    if (!renderer || !layer || event.button !== 0) return
    const [nx, ny] = ndc(event)
    const hit = pickScene(design, renderer.getCamera(), nx, ny)
    if (!hit) return
    pushUndo()
    drawing = true
    canvas.setPointerCapture(event.pointerId)
    lastPointer = { x: event.clientX, y: event.clientY, t: performance.now() }
    const point = toPathPoint(hit.point, layer, params.baseRadius, params.pressure)
    activePath = {
      id: uid(),
      layerId: layer.id,
      surface: params.surface,
      nozzle: params.nozzle,
      nozzleCode: NOZZLE_CODES[params.nozzle],
      color: { ...params.color },
      whip: params.whip,
      points: [point],
      volume: 0
    }
    design.paths.push(activePath)
  })

  canvas?.addEventListener('pointermove', (event) => {
    if (!drawing || !activePath) return
    const renderer = viewport.renderer()
    const layer = design.layers.find((item) => item.id === params.layerId)
    if (!renderer || !layer) return
    const [nx, ny] = ndc(event)
    const hit = pickScene(design, renderer.getCamera(), nx, ny)
    if (!hit) return
    const now = performance.now()
    const pixelSpeed = Math.hypot(event.clientX - lastPointer.x, event.clientY - lastPointer.y)
    const dt = Math.max(now - lastPointer.t, 1) / 1000
    const speed = pixelSpeed / dt
    const radius = radiusFromInput(params.baseRadius, params.pressure, speed, params.refSpeed * 40)
    const point = toPathPoint(hit.point, layer, radius, params.pressure)
    const prev = activePath.points[activePath.points.length - 1]
    if (Math.hypot(point.x - prev.x, point.y - prev.y, point.z - prev.z) > 0.25) {
      activePath.points.push(point)
      activePath.volume = pathVolume(activePath)
      lastPointer = { x: event.clientX, y: event.clientY, t: now }
      viewport.setDesign(design)
    }
  })

  const finishDraw = async (): Promise<void> => {
    if (!drawing) return
    drawing = false
    if (activePath && activePath.points.length < 2) {
      design.paths = design.paths.filter((item) => item.id !== activePath?.id)
    } else if (activePath) {
      activePath.volume = pathVolume(activePath)
    }
    activePath = null
    await persist()
    refreshPathList()
  }
  canvas?.addEventListener('pointerup', () => void finishDraw())
  canvas?.addEventListener('pointercancel', () => void finishDraw())

  function toPathPoint(hitPoint: number[], layer: CakeDesign['layers'][number], radius: number, pressure: number): PathPoint {
    const top = layerTopY(design.layers, layer.id)
    if (params.surface === 'top') {
      const [x, z] = clampToFootprint(layer.shape, layer.diameter, hitPoint[0], hitPoint[2])
      return { x, y: top + radius * 0.6, z, radius, pressure }
    }
    const angle = Math.atan2(hitPoint[2], hitPoint[0])
    return {
      x: hitPoint[0],
      y: clamp(hitPoint[1], stackLayers(design.layers).find((l) => l.id === layer.id)!.yBottom + 0.4, top - 0.4),
      z: hitPoint[2],
      radius,
      pressure: clamp(pressure + angle * 0, 0, 1)
    }
  }

  // ---- 一键花型 ----
  const addRose = async (): Promise<void> => {
    const layer = design.layers.find((item) => item.id === params.layerId)
    if (!layer) return
    pushUndo()
    const top = layerTopY(design.layers, layer.id)
    design.paths.push(
      generateRose({
        layerId: layer.id,
        cx: 0,
        cz: 0,
        radius: Math.min(3.2, layer.diameter * 0.12),
        nozzle: params.nozzle === 'round' ? 'star' : params.nozzle,
        color: whippedColor(params.color, params.whip),
        whip: params.whip,
        yTop: top
      })
    )
    await persist()
    refreshPathList()
  }

  const addBorder = async (kind: BorderKind): Promise<void> => {
    const layer = design.layers.find((item) => item.id === params.layerId)
    if (!layer) return
    pushUndo()
    design.paths.push(generateBorderForLayers(design.layers, layer, kind, params.color, params.whip))
    await persist()
    refreshPathList()
  }

  const addSideBand = async (): Promise<void> => {
    const layer = design.layers.find((item) => item.id === params.layerId)
    if (!layer) return
    pushUndo()
    design.paths.push(
      generateSideBand(
        design.layers,
        layer,
        -Math.PI,
        Math.PI,
        [layer.height * 0.2, layer.height * 0.8],
        params.nozzle,
        params.color,
        params.whip,
        params.baseRadius
      )
    )
    await persist()
    refreshPathList()
  }

  // ---- 压力测试：自动铺满 120 朵玫瑰 ----
  const stressTest = async (): Promise<void> => {
    const layer = design.layers.find((item) => item.id === params.layerId)
    if (!layer) return
    pushUndo()
    const top = layerTopY(design.layers, layer.id)
    const spacing = 5.2
    const range = layer.diameter / 2 - 3
    for (let x = -range; x <= range; x += spacing) {
      for (let z = -range; z <= range; z += spacing) {
        design.paths.push(
          generateRose({
            layerId: layer.id,
            cx: x,
            cz: z,
            radius: 2.2,
            nozzle: 'star',
            color: params.color,
            whip: params.whip,
            yTop: top
          })
        )
      }
    }
    await persist()
    refreshPathList()
  }

  const undo = async (): Promise<void> => {
    const prev = undoStack.pop()
    if (!prev) return
    design.paths = prev
    await persist()
    refreshPathList()
  }

  function refreshPathList(): void {
    pathList.replaceChildren(
      ...design.paths.map((path, index) =>
        el('div', { class: 'list-row' }, [
          el('div', {}, [
            el('h4', {}, [`#${index + 1} ${path.nozzleCode}`]),
            el('span', { class: 'muted' }, [
              `${path.surface === 'top' ? '顶面' : '侧面'} · ${path.points.length} 点 · ${path.volume.toFixed(1)}cm³`
            ])
          ]),
          el('button', {
            class: 'danger ghost',
            textContent: '删除',
            onclick: async () => {
              pushUndo()
              design.paths = design.paths.filter((item) => item.id !== path.id)
              await persist()
              refreshPathList()
            }
          })
        ])
      )
    )
  }

  function refreshStats(): void {
    const total = design.paths.reduce((sum, path) => sum + path.volume, 0)
    const segments = design.paths.reduce((sum, path) => sum + Math.max(0, path.points.length - 1), 0)
    volumeBar.replaceChildren(
      stat('路径数', String(design.paths.length)),
      stat('管段数', String(segments)),
      stat('奶油总量', `${total.toFixed(1)}cm³`)
    )
  }

  const layerOptions = (): HTMLElement =>
    el('select', {
      onchange: (event) => {
        params.layerId = (event.target as HTMLSelectElement).value
      }
    }, design.layers.map((layer, index) =>
      el('option', { value: layer.id, selected: layer.id === params.layerId }, [`第 ${index + 1} 层`])
    ))

  const nozzleSelect = el('select', {
    onchange: (event) => {
      params.nozzle = (event.target as HTMLSelectElement).value as NozzleProfile
    }
  }, (Object.keys(NOZZLE_CODES) as NozzleProfile[]).map((key) =>
    el('option', { value: key, selected: key === params.nozzle }, [NOZZLE_CODES[key]])
  ))

  const surfaceSwitch = el('div', { class: 'segmented' }, [
    el('button', { class: 'active', textContent: '顶面绘制', onclick: () => switchSurface('top') }),
    el('button', { textContent: '侧面环带', onclick: () => switchSurface('side') })
  ])

  function switchSurface(surface: DrawSurface): void {
    params.surface = surface
    surfaceSwitch.querySelectorAll('button').forEach((button, index) => {
      button.classList.toggle('active', (surface === 'top' ? 0 : 1) === index)
    })
  }

  const colorGrid = el('div', { class: 'color-grid' },
    COLOR_CARD.map((card) =>
      el('div', {
        class: `swatch${rgbToCss(card.value) === rgbToCss(params.color) ? ' selected' : ''}`,
        style: `background:${rgbToCss(card.value)}`,
        title: card.name,
        onclick: () => {
          params.color = { ...card.value }
          colorGrid.querySelectorAll('.swatch').forEach((node) => node.classList.remove('selected'))
          ;(colorGrid.querySelectorAll('.swatch')[COLOR_CARD.indexOf(card)] as HTMLElement).classList.add('selected')
        }
      })
    )
  )

  // 自定义调色：色相滑杆，饱和度 0.65、亮度 0.72 固定在食品色常用区间
  const customColor = el('input', {
    type: 'range',
    min: '0',
    max: '360',
    value: '340',
    oninput: () => {
      params.color = hslToRgb(Number(customColor.value), 0.65, 0.72)
      colorGrid.querySelectorAll('.swatch').forEach((node) => node.classList.remove('selected'))
    }
  })
  const customBlock = el('div', {}, [el('label', {}, ['自定义色相']), customColor])

  const sidePanel = el('div', { class: 'panel' }, [
    el('div', { class: 'card panel' }, [
      el('h3', {}, ['挤花工具']),
      el('div', {}, [el('label', {}, ['目标层']), layerOptions()]),
      el('div', {}, [el('label', {}, ['绘制面']), surfaceSwitch]),
      el('div', {}, [el('label', {}, ['花嘴型号']), nozzleSelect]),
      numberField('基础粗细', params.baseRadius, (v) => (params.baseRadius = clamp(v, 0.15, 2)), {
        min: 0.15, max: 2, step: 0.05, unit: 'cm'
      }),
      numberField('挤压力度', params.pressure, (v) => (params.pressure = clamp(v, 0.1, 1)), {
        min: 0.1, max: 1, step: 0.05
      }),
      numberField('参考速度', params.refSpeed, (v) => (params.refSpeed = v), { min: 1, max: 20, step: 1 }),
      numberField('打发程度', params.whip, (v) => (params.whip = clamp(v, 0.4, 1)), {
        min: 0.4, max: 1, step: 0.05
      }),
      el('div', {}, [el('label', {}, ['色卡配色']), colorGrid, customBlock])
    ]),
    el('div', { class: 'card panel' }, [
      el('h3', {}, ['一键花型']),
      el('div', { class: 'toolbar' }, [
        el('button', { class: 'primary', textContent: '玫瑰花', onclick: () => void addRose() }),
        el('button', { textContent: '贝壳边', onclick: () => void addBorder('shell') }),
        el('button', { textContent: '糖珠边', onclick: () => void addBorder('pearl') }),
        el('button', { textContent: '星星边', onclick: () => void addBorder('star') }),
        el('button', { textContent: '侧面环带', onclick: () => void addSideBand() })
      ]),
      el('div', { class: 'toolbar' }, [
        el('button', { textContent: '撤销', onclick: () => void undo() }),
        el('button', { textContent: '百朵玫瑰压力测试', onclick: () => void stressTest() })
      ]),
      el('p', { class: 'muted' }, ['在蛋糕上按住拖拽即可沿路径挤花，速度越快线条越细'])
    ]),
    el('div', { class: 'card panel' }, [el('h3', {}, ['实时用料']), volumeBar]),
    el('div', { class: 'card panel' }, [
      el('h3', {}, ['挤花路径']),
      pathList,
      el('button', { class: 'primary', textContent: '去装饰件', onclick: () => navigate(`/decorations/${design.id}`) })
    ])
  ])

  refreshPathList()
  refreshStats()

  return el('div', { class: 'page' }, [
    el('div', { class: 'page-header' }, [el('h1', {}, [`裱花编辑 · ${design.name}`])]),
    el('div', { class: 'split' }, [viewport.root, sidePanel])
  ])
}

const stat = (label: string, value: string): HTMLElement =>
  el('div', { class: 'stat-item' }, [
    el('div', { class: 'value' }, [value]),
    el('div', { class: 'label' }, [label])
  ])
