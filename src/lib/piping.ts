// 裱花核心：花嘴截面、路径管段化、体积计算、常用花型生成
import type {
  CakeLayer,
  NozzleProfile,
  PathPoint,
  PipingPath,
  RGB
} from '../model/types.ts'
import { uid, clamp, lerp } from './math3d.ts'
import { boundaryRadius, clampToFootprint, stackLayers } from './geometry.ts'

export const NOZZLE_CODES: Record<NozzleProfile, string> = {
  round: '12号圆口',
  star: '1M 星形',
  shell: '22号贝壳',
  leaf: '352号叶齿',
  petal: '104号花瓣',
  rope: '233号绳编'
}

export const PROFILE_IDS: Record<NozzleProfile, number> = {
  round: 0,
  star: 1,
  shell: 2,
  leaf: 3,
  petal: 4,
  rope: 5
}

// 截面面积 = 系数 × r²。圆系解析值，星形数值采样（与着色器同一 SDF，误差可忽略）
function starAreaCoeff(): number {
  const n = 1000
  const half = 1.05
  const step = (2 * half) / n
  let area = 0
  for (let j = 0; j < n; j++) {
    const py = -half + (j + 0.5) * step
    for (let i = 0; i < n; i++) {
      const px = -half + (i + 0.5) * step
      if (sdStar5(px, py, 1) <= 0) area += step * step
    }
  }
  return area
}

// Inigo Quilez 五角星 SDF，rf=0.5 内凹比
function sdStar5(px: number, py: number, r: number): number {
  const k1x = 0.8090
  const k1y = -0.5878
  const k2x = -0.3090
  const k2y = -0.9511
  let ax = Math.abs(px) / r
  let ay = py / r
  const d1x = ax - k1x
  const d1y = ay - k1y
  const d2x = ax - k2x
  const d2y = ay - k2y
  const m1 = d1x * (0 - k1y) + d1y * k1x
  if (m1 < 0) {
    ax = -d1x + k1x
    ay = -d1y + k1y
  }
  const m2 = d2x * (0 - k2y) + d2y * k2x
  if (m2 < 0) {
    ax = -d2x + k2x
    ay = -d2y + k2y
  }
  ax -= k1x
  ay -= k1y
  const ba = k2x - k1x
  const bb = k2y - k1y
  const denom = ba * ba + bb * bb
  const t = clamp((ax * ba + ay * bb) / denom, 0, 1)
  const dx = ax - ba * t
  const dy = ay - bb * t
  return Math.hypot(dx, dy) * r * (Math.sign(dy) || 1)
}

const STAR_COEFF = starAreaCoeff()

// 椭圆类花嘴的轴比（相对圆口半径）
const ELLIPSE_RATIO: Partial<Record<NozzleProfile, number>> = {
  shell: 1.25,
  leaf: 0.45,
  petal: 0.7
}

export function profileAreaCoeff(profile: NozzleProfile): number {
  if (profile === 'star') return STAR_COEFF
  const ratio = ELLIPSE_RATIO[profile]
  return ratio ? Math.PI * ratio : Math.PI
}

// 管段：路径离散后的最小渲染/统计单元
export interface Segment {
  ax: number
  ay: number
  az: number
  bx: number
  by: number
  bz: number
  rA: number
  rB: number
  profile: number
  color: RGB
  whip: number
}

// 单段体积：半径线性变化的积分 ∫coeff·r(t)² dt，恒定半径时退化为 coeff·len·r²
export function segmentVolume(seg: Segment): number {
  const len = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay, seg.bz - seg.az)
  const coeff = profileAreaCoeff(
    (Object.keys(PROFILE_IDS) as NozzleProfile[]).find(
      (key) => PROFILE_IDS[key] === seg.profile
    ) as NozzleProfile
  )
  const integral = (seg.rA ** 2 + seg.rA * seg.rB + seg.rB ** 2) / 3
  return coeff * len * integral
}

export function buildSegments(path: PipingPath): Segment[] {
  const profile = PROFILE_IDS[path.nozzle]
  const segs: Segment[] = []
  for (let i = 0; i < path.points.length - 1; i++) {
    const a = path.points[i]
    const b = path.points[i + 1]
    segs.push({
      ax: a.x,
      ay: a.y,
      az: a.z,
      bx: b.x,
      by: b.y,
      bz: b.z,
      rA: a.radius,
      rB: b.radius,
      profile,
      color: path.color,
      whip: path.whip
    })
  }
  return segs
}

// 一条挤花路径的解析体积，cm³
export function pathVolume(path: PipingPath): number {
  if (path.points.length < 2) return 0
  return buildSegments(path).reduce((sum, seg) => sum + segmentVolume(seg), 0)
}

// 交互输入 → 实时半径：压力越大越粗，速度越快越细（裱花物理直觉）
export function radiusFromInput(
  baseRadius: number,
  pressure: number,
  speed: number,
  refSpeed: number
): number {
  const pressureFactor = 0.55 + 0.45 * clamp(pressure, 0, 1)
  const speedFactor = clamp(refSpeed / Math.max(speed, 1e-6), 0.7, 1.3)
  return baseRadius * pressureFactor * speedFactor
}

// ---- 花型生成器：输出世界坐标采样点 ----

const SEGMENT_SPACING = 0.32

function resample(points: PathPoint[], spacing = SEGMENT_SPACING): PathPoint[] {
  if (points.length < 2) return points
  const out: PathPoint[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const steps = Math.max(1, Math.ceil(dist / spacing))
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      out.push({
        x: lerp(a.x, b.x, t),
        y: lerp(a.y, b.y, t),
        z: lerp(a.z, b.z, t),
        radius: lerp(a.radius, b.radius, t),
        pressure: lerp(a.pressure, b.pressure, t)
      })
    }
  }
  return out
}

export interface RoseOptions {
  layerId: string
  cx: number
  cz: number
  radius: number
  nozzle: NozzleProfile
  color: RGB
  whip: number
  yTop: number
  turns?: number
}

// 玫瑰花：阿基米德螺旋 + 压力脉动模拟花瓣起伏
export function generateRose(opts: RoseOptions): PipingPath {
  const turns = opts.turns ?? 2.6
  const samples = Math.ceil((turns * 2 * Math.PI * opts.radius) / SEGMENT_SPACING)
  const points: PathPoint[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const angle = t * turns * 2 * Math.PI
    const r = opts.radius * (1 - t)
    const pulse = 0.82 + 0.18 * Math.sin(angle * 2)
    points.push({
      x: opts.cx + Math.cos(angle) * r,
      y: opts.yTop + opts.radius * 0.55,
      z: opts.cz + Math.sin(angle) * r,
      radius: opts.radius * 0.34 * pulse,
      pressure: pulse
    })
  }
  return makePath(opts.layerId, 'top', opts.nozzle, opts.color, opts.whip, points)
}

export type BorderKind = 'shell' | 'pearl' | 'star'

// 顶面花边：沿 footprint 边界走一圈，贝壳/糖珠靠压力脉动成型
export function generateBorderForLayers(
  layers: CakeLayer[],
  layer: CakeLayer,
  kind: BorderKind,
  color: RGB,
  whip: number
): PipingPath {
  const layout = stackLayers(layers)
  const top = layout.find((item) => item.id === layer.id)?.yTop ?? layer.height
  const tubeRadius = Math.max(0.25, layer.diameter * 0.018)
  const perimeter: PathPoint[] = []
  const approxLen =
    layer.shape === 'round'
      ? Math.PI * layer.diameter
      : layer.shape === 'square'
        ? 4 * layer.diameter
        : 5.5 * layer.diameter
  const samples = Math.ceil(approxLen / SEGMENT_SPACING)
  // 心形边界半径是相对内部极点 (0, 0.15 单位) 的星形距离
  const poleZ = layer.shape === 'heart' ? -layer.diameter * 0.075 : 0
  for (let i = 0; i <= samples; i++) {
    const angle = (i / samples) * 2 * Math.PI
    const br = boundaryRadius(layer.shape, layer.diameter, angle)
    let pressure = 1
    if (kind === 'shell') pressure = 0.55 + 0.45 * Math.sin(angle * 18) ** 2
    if (kind === 'pearl') pressure = 0.32 + 0.68 * Math.sin(angle * 26) ** 2
    // 预留整根半径的余量，保证管段任何角度都不穿出边界
    const safeRadius = tubeRadius * 1.15
    const radial = Math.max(0.5, br - safeRadius)
    const radius = tubeRadius * (kind === 'pearl' ? 1.05 : 1) * (0.7 + 0.3 * pressure)
    let x = Math.cos(angle) * radial
    let z = poleZ + Math.sin(angle) * radial
    if (layer.shape === 'heart') {
      const clamped = clampToFootprint(layer.shape, layer.diameter, x, z)
      x = clamped[0]
      z = clamped[1]
    }
    perimeter.push({
      x,
      y: top + tubeRadius * 0.6,
      z,
      radius,
      pressure
    })
  }
  const nozzle: NozzleProfile = kind === 'shell' ? 'shell' : kind === 'star' ? 'star' : 'round'
  return makePath(layer.id, 'top', nozzle, color, whip, resample(perimeter))
}

// 侧面环带：起止角度 + 起止高度（侧绘交互的程序化版本）
export function generateSideBand(
  layers: CakeLayer[],
  layer: CakeLayer,
  startAngle: number,
  endAngle: number,
  yFromBottom: [number, number],
  nozzle: NozzleProfile,
  color: RGB,
  whip: number,
  tubeRadius: number
): PipingPath {
  const layout = stackLayers(layers)
  const info = layout.find((item) => item.id === layer.id)
  if (!info) throw new Error('layer missing in stack')
  const span = endAngle - startAngle
  const samples = Math.ceil((Math.abs(span) * layer.diameter) / SEGMENT_SPACING)
  const points: PathPoint[] = []
  for (let i = 0; i <= samples; i++) {
    const t = i / Math.max(samples, 1)
    const angle = lerp(startAngle, endAngle, t)
    const br = boundaryRadius(layer.shape, layer.diameter, angle)
    const y = info.yBottom + lerp(yFromBottom[0], yFromBottom[1], t)
    points.push({
      x: Math.cos(angle) * (br + tubeRadius * 0.4),
      y,
      z: Math.sin(angle) * (br + tubeRadius * 0.4),
      radius: tubeRadius,
      pressure: 1
    })
  }
  return makePath(layer.id, 'side', nozzle, color, whip, points)
}

function makePath(
  layerId: string,
  surface: 'top' | 'side',
  nozzle: NozzleProfile,
  color: RGB,
  whip: number,
  points: PathPoint[]
): PipingPath {
  const path: PipingPath = {
    id: uid(),
    layerId,
    surface,
    nozzle,
    nozzleCode: NOZZLE_CODES[nozzle],
    color,
    whip,
    points,
    volume: 0
  }
  path.volume = pathVolume(path)
  return path
}
