// 蛋糕胚几何：纯函数模块，可直接在 Node 测试中运行
import type { CakeLayer, LayerShape } from '../model/types.ts'
import { clamp } from './math3d.ts'

// 标准单层参考高度 cm
export const DEFAULT_LAYER_HEIGHT = 10

// Inigo Quilez 心形 SDF，定义域约 x∈[-1,1] y∈[-0.6,1.2]，等比缩放
export function sdHeartUnit(px: number, py: number): number {
  const ax = Math.abs(px)
  const d21 = (ax - 0.25) ** 2 + (py - 0.75) ** 2
  const d22 = (ax - 0.75) ** 2 + (py - 0.75) ** 2
  const r = Math.SQRT2 / 4
  if (py + ax > 1) return Math.sqrt(Math.min(d21, d22)) - r
  const bx = 0.5 * Math.max(ax + py, 0)
  const d23 = (ax - bx) ** 2 + (py - bx) ** 2
  return Math.sqrt(Math.min(d21, d23)) - r
}

// 蛋糕平面坐标 (x,z) 转心形单位坐标
const toHeart = (x: number, z: number, diameter: number): [number, number] => [
  (2 * x) / diameter,
  (2 * z) / diameter
]

export function pointInFootprint(
  shape: LayerShape,
  diameter: number,
  x: number,
  z: number
): boolean {
  const r = diameter / 2
  if (shape === 'round') return x * x + z * z <= r * r
  if (shape === 'square') return Math.abs(x) <= r && Math.abs(z) <= r
  const [px, py] = toHeart(x, z, diameter)
  return sdHeartUnit(px, py) <= 0
}

// 扫描线求占地面积，cm²（圆/方走解析公式，心形数值积分）
export function footprintArea(shape: LayerShape, diameter: number): number {
  if (shape === 'round') return Math.PI * (diameter / 2) ** 2
  if (shape === 'square') return diameter * diameter
  const n = 600
  const half = 1.02
  const step = (2 * half) / n
  let areaUnit = 0
  for (let i = 0; i < n; i++) {
    const py = -half + (i + 0.5) * step
    let width = 0
    for (let j = 0; j < n; j++) {
      const px = -half + (j + 0.5) * step
      if (sdHeartUnit(px, py) <= 0) width += step
    }
    areaUnit += width * step
  }
  const scale = diameter / 2
  return areaUnit * scale * scale
}

// marching squares 估算周长，cm
export function footprintPerimeter(shape: LayerShape, diameter: number): number {
  if (shape === 'round') return Math.PI * diameter
  if (shape === 'square') return 4 * diameter
  const n = 400
  const half = 1.05
  const step = (2 * half) / n
  const inside = (i: number, j: number): boolean => {
    const px = -half + i * step
    const py = -half + j * step
    return sdHeartUnit(px, py) <= 0
  }
  let unitLen = 0
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const corners = [inside(i, j), inside(i + 1, j), inside(i + 1, j + 1), inside(i, j + 1)]
      const crossings = corners.filter(Boolean).length
      // 跨过边界的格子：1 或 3 个内点贡献约 1 条边，2 个内点（相邻）同样 1 条
      if (crossings > 0 && crossings < 4) unitLen += step
    }
  }
  return unitLen * (diameter / 2)
}

export const layerVolume = (layer: CakeLayer): number =>
  footprintArea(layer.shape, layer.diameter) * layer.height

// 从中心沿水平角方向求边界半径（心形相对内部极点呈星形，二分法可靠）
export function boundaryRadius(
  shape: LayerShape,
  diameter: number,
  angle: number
): number {
  const r = diameter / 2
  if (shape === 'round') return r
  if (shape === 'square') {
    const c = Math.abs(Math.cos(angle))
    const s = Math.abs(Math.sin(angle))
    return r / Math.max(c, s)
  }
  // 心形：从内部极点 (0, 0.15 单位) 二分，最后夹到半宽内防止数值越界
  const cx = 0
  const cy = 0.15
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let lo = 0
  let hi = 3
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2
    if (sdHeartUnit(cx + dx * mid, cy + dy * mid) <= 0) lo = mid
    else hi = mid
  }
  return Math.min(lo, 2.02) * (diameter / 2)
}

// 层堆叠布局：返回每层底面/顶面世界坐标 Y（cm），底层落在 y=0
export interface LayerLayout {
  id: string
  yBottom: number
  yTop: number
}

export function stackLayers(layers: CakeLayer[]): LayerLayout[] {
  let acc = 0
  return layers.map((layer) => {
    const yBottom = acc
    acc += layer.height
    return { id: layer.id, yBottom, yTop: acc }
  })
}

export const layerTopY = (layers: CakeLayer[], layerId: string): number => {
  const layout = stackLayers(layers)
  const found = layout.find((item) => item.id === layerId)
  if (!found) throw new Error(`layer not found: ${layerId}`)
  return found.yTop
}

// 圆形尺寸 → 可供应份数（每份约 150cm³，标准层高 10cm）
const ROUND_CAPACITY_TABLE: { diameter: number; servings: number }[] = [
  { diameter: 15, servings: 10 },
  { diameter: 18, servings: 16 },
  { diameter: 20, servings: 22 },
  { diameter: 23, servings: 30 },
  { diameter: 25, servings: 38 },
  { diameter: 28, servings: 48 },
  { diameter: 30, servings: 56 },
  { diameter: 33, servings: 68 },
  { diameter: 35, servings: 78 }
]

const roundServings = (diameter: number): number => {
  const nearest = ROUND_CAPACITY_TABLE.reduce((best, item) =>
    Math.abs(item.diameter - diameter) < Math.abs(best.diameter - diameter) ? item : best
  )
  return nearest.servings
}

// 按人数推荐单层尺寸
export function recommendSingleLayer(servings: number, shape: LayerShape): number {
  const target = ROUND_CAPACITY_TABLE.find((item) => item.servings >= servings)
  const roundD = target ? target.diameter : 35
  if (shape === 'round') return roundD
  if (shape === 'square') {
    // 向上取整保证方形面积不小于目标圆面积
    return Math.ceil(Math.sqrt(Math.PI * (roundD / 2) ** 2))
  }
  // 心形面积约为同宽圆形的 0.86，直径放大约 1.08
  return Math.round(roundD * 1.08)
}

export interface TierSuggestion {
  tiers: number[]
  totalServings: number
}

// 按人数推荐多层套尺寸（返回底层 → 顶层，直径递减），相邻层直径差 4cm 起步
export function recommendTiers(servings: number): TierSuggestion {
  const tierCount = servings <= 12 ? 1 : servings <= 30 ? 2 : servings <= 60 ? 3 : 4
  const perTier = Math.ceil(servings / tierCount)
  const wanted = ROUND_CAPACITY_TABLE.find((item) => item.servings >= perTier)?.diameter
    ?? ROUND_CAPACITY_TABLE[ROUND_CAPACITY_TABLE.length - 1].diameter

  // 第一遍：从顶层（最小层）起放目标档，向下每层至少大 4cm，得到升序骨架
  const ascending: number[] = []
  for (let tier = 0; tier < tierCount; tier++) {
    if (tier === 0) {
      ascending.push(wanted)
    } else {
      const minAllowed = ascending[tier - 1] + 4
      const fit = ROUND_CAPACITY_TABLE.find((item) => item.diameter >= minAllowed)
      ascending.push(fit?.diameter ?? ROUND_CAPACITY_TABLE[ROUND_CAPACITY_TABLE.length - 1].diameter)
    }
  }
  const tiers = ascending.reverse()
  const total = tiers.reduce((sum, d) => sum + roundServings(d), 0)
  // 第二遍：总份数不够时只把底层升到最大档（级差天然保持）
  if (total < servings) {
    tiers[0] = ROUND_CAPACITY_TABLE[ROUND_CAPACITY_TABLE.length - 1].diameter
  }
  return { tiers, totalServings: tiers.reduce((sum, d) => sum + roundServings(d), 0) }
}

// 把世界坐标约束到某层顶面的 footprint 内（绘制时用）
export function clampToFootprint(
  shape: LayerShape,
  diameter: number,
  x: number,
  z: number
): [number, number] {
  if (pointInFootprint(shape, diameter, x, z)) return [x, z]
  const angle = Math.atan2(z, x)
  const br = boundaryRadius(shape, diameter, angle)
  const d = Math.hypot(x, z) || 1
  const k = (br * 0.98) / d
  return [clamp(x * k, -diameter / 2, diameter / 2), clamp(z * k, -diameter / 2, diameter / 2)]
}
