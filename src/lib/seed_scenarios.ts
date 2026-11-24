// 三个标准测试方案工厂：三层婚礼 / 镜面淋面慕斯 / 数字生日
import type { CakeDesign, CakeLayer, Decoration, Order, PipingPath, RGB } from '../model/types.ts'
import { uid } from './math3d.ts'
import { stackLayers } from './geometry.ts'
import {
  generateBorderForLayers,
  generateRose,
  generateSideBand,
  pathVolume
} from './piping.ts'

const WHITE: RGB = { r: 250, g: 244, b: 234 }
const PINK: RGB = { r: 244, g: 178, b: 196 }
const GOLD: RGB = { r: 214, g: 181, b: 111 }
const DARK: RGB = { r: 28, g: 26, b: 30 }
const RED: RGB = { r: 206, g: 74, b: 96 }
const BLUE: RGB = { r: 93, g: 128, b: 166 }

function layer(
  shape: CakeLayer['shape'],
  diameter: number,
  height: number,
  material: CakeLayer['material'],
  color: RGB,
  drip = 0
): CakeLayer {
  return { id: uid(), shape, diameter, height, material, color, dripRatio: drip }
}

function finalize(paths: PipingPath[]): PipingPath[] {
  return paths.map((path) => ({ ...path, volume: pathVolume(path) }))
}

// 方案一：三层婚礼蛋糕，白奶油 + 玫瑰粉花 + 珍珠边 + 侧面绳编环带
export function buildWeddingCake(): CakeDesign {
  const layers = [
    layer('round', 30, 11, 'cream', WHITE),
    layer('round', 24, 10, 'cream', WHITE),
    layer('round', 18, 10, 'fondant', WHITE)
  ]
  const paths: PipingPath[] = []
  layers.forEach((item) => {
    paths.push(generateBorderForLayers(layers, item, 'pearl', WHITE, 0.85))
  })
  const layout = stackLayers(layers)
  // 顶层 7 朵玫瑰：中心 1 朵 + 周围 6 朵
  const topY = layout[2].yTop
  const roseRadius = 2.4
  paths.push(generateRose({
    layerId: layers[2].id, cx: 0, cz: 0, radius: 2.8,
    nozzle: 'petal', color: PINK, whip: 0.8, yTop: topY
  }))
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2
    paths.push(generateRose({
      layerId: layers[2].id,
      cx: Math.cos(angle) * 5,
      cz: Math.sin(angle) * 5,
      radius: roseRadius,
      nozzle: 'petal',
      color: PINK,
      whip: 0.8,
      yTop: topY
    }))
  }
  // 中层贝壳边 + 底层侧面环带
  paths.push(generateBorderForLayers(layers, layers[1], 'shell', PINK, 0.8))
  paths.push(generateSideBand(
    layers, layers[0], -Math.PI, Math.PI,
    [3, 8], 'rope', GOLD, 0.7, 0.5
  ))
  paths.push(generateSideBand(
    layers, layers[0], -Math.PI, Math.PI,
    [3.8, 7.2], 'rope', PINK, 0.8, 0.4
  ))

  const decorations: Decoration[] = []
  // 中层顶面 8 颗糖珠
  const midTop = layout[1].yTop
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2
    decorations.push({
      id: uid(),
      kind: 'sugar_pearl',
      x: Math.cos(angle) * 9,
      y: midTop + 0.6,
      z: Math.sin(angle) * 9,
      rotationY: 0,
      scale: 0.7,
      color: GOLD,
      digit: 0
    })
  }

  const now = Date.now()
  return {
    id: uid(),
    name: '三层婚礼蛋糕',
    layers,
    paths: finalize(paths),
    decorations,
    lighting: 'wedding',
    createdAt: now,
    updatedAt: now
  }
}

// 方案二：镜面淋面慕斯，心形黑镜面 + 滴落边 + 蓝莓草莓
export function buildGlazeMousse(): CakeDesign {
  const layers = [
    layer('heart', 24, 9, 'glaze', DARK, 0.55),
    layer('heart', 20, 8, 'glaze', RED, 0.4)
  ]
  const paths: PipingPath[] = [
    generateBorderForLayers(layers, layers[1], 'star', GOLD, 0.6)
  ]
  const layout = stackLayers(layers)
  const topY = layout[1].yTop
  const decorations: Decoration[] = []
  const berrySpots: [number, number, Decoration['kind'], RGB][] = [
    [-4, 2, 'fruit_strawberry', { r: 214, g: 64, b: 72 }],
    [-1, 4, 'fruit_blueberry', { r: 74, g: 78, b: 148 }],
    [2.5, 3, 'fruit_blueberry', { r: 74, g: 78, b: 148 }],
    [4, -1, 'fruit_strawberry', { r: 214, g: 64, b: 72 }],
    [-3, -3, 'fruit_blueberry', { r: 74, g: 78, b: 148 }],
    [0, -4.5, 'chocolate_shard', { r: 79, g: 47, b: 35 }],
    [3.5, -4, 'chocolate_shard', { r: 79, g: 47, b: 35 }]
  ]
  berrySpots.forEach(([x, z, kind, color]) => {
    decorations.push({
      id: uid(),
      kind,
      x,
      y: topY + 1.2,
      z,
      rotationY: Math.random() * Math.PI,
      scale: kind === 'chocolate_shard' ? 2 : 1.4,
      color,
      digit: 0
    })
  })
  // 金箔糖珠
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + 0.4
    decorations.push({
      id: uid(),
      kind: 'sugar_pearl',
      x: Math.cos(angle) * 7,
      y: topY + 0.6,
      z: Math.sin(angle) * 7,
      rotationY: 0,
      scale: 0.6,
      color: GOLD,
      digit: 0
    })
  }
  const now = Date.now()
  return {
    id: uid(),
    name: '镜面淋面慕斯',
    layers,
    paths: finalize(paths),
    decorations,
    lighting: 'shop',
    createdAt: now,
    updatedAt: now
  }
}

// 方案三：数字生日蛋糕，方形胚 + 数字蜡烛 + 水果围边
export function buildBirthdayCake(): CakeDesign {
  const layers = [layer('square', 26, 10, 'cream', BLUE)]
  const paths: PipingPath[] = [
    generateBorderForLayers(layers, layers[0], 'shell', WHITE, 0.85),
    generateBorderForLayers(layers, layers[0], 'star', PINK, 0.75)
  ]
  const layout = stackLayers(layers)
  const topY = layout[0].yTop
  const decorations: Decoration[] = []
  // 数字 18 蜡烛
  ;[1, 8].forEach((digit, index) => {
    decorations.push({
      id: uid(),
      kind: 'number_candle',
      x: index === 0 ? -2.2 : 2.2,
      y: topY + 0.4,
      z: 0,
      rotationY: 0,
      scale: 2.2,
      color: digit === 1 ? PINK : WHITE,
      digit
    })
  })
  // 四边草莓围边
  const edge = 9.5
  const fruitCount = 10
  for (let i = 0; i < fruitCount; i++) {
    const t = -edge + (2 * edge * i) / (fruitCount - 1)
    decorations.push({
      id: uid(),
      kind: 'fruit_strawberry',
      x: t,
      y: topY + 1,
      z: edge,
      rotationY: 0,
      scale: 1.3,
      color: { r: 214, g: 64, b: 72 },
      digit: 0
    })
    decorations.push({
      id: uid(),
      kind: 'fruit_strawberry',
      x: t,
      y: topY + 1,
      z: -edge,
      rotationY: 0,
      scale: 1.3,
      color: { r: 214, g: 64, b: 72 },
      digit: 0
    })
  }
  // 顶面糖珠散点
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2
    const radius = 5.5 + (i % 2) * 2
    decorations.push({
      id: uid(),
      kind: 'sugar_pearl',
      x: Math.cos(angle) * radius,
      y: topY + 0.5,
      z: Math.sin(angle) * radius,
      rotationY: 0,
      scale: 0.6,
      color: WHITE,
      digit: 0
    })
  }
  const now = Date.now()
  return {
    id: uid(),
    name: '数字生日蛋糕',
    layers,
    paths: finalize(paths),
    decorations,
    lighting: 'shop',
    createdAt: now,
    updatedAt: now
  }
}

export interface SeedResult {
  order: Order
  designs: CakeDesign[]
}

// 一次性播种：建一个测试订单挂三个方案
export function buildSeedOrder(): SeedResult {
  const designs = [buildWeddingCake(), buildGlazeMousse(), buildBirthdayCake()]
  const order: Order = {
    id: uid(),
    customer: '测试客户',
    phone: '13800000000',
    dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    servings: 60,
    budget: 2800,
    note: '三个标准测试方案：婚礼 / 淋面慕斯 / 生日',
    designIds: designs.map((design) => design.id),
    createdAt: Date.now()
  }
  return { order, designs }
}
