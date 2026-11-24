// CPU 射线拾取：屏幕坐标 → 蛋糕表面世界点（解析求交，与 GPU SDF 保持同一定义）
import type { CakeDesign, CakeLayer, PipingPath } from '../model/types.ts'
import { sdHeartUnit, stackLayers } from '../lib/geometry.ts'
import { buildSegments, type Segment } from '../lib/piping.ts'
import { clamp, type Vec3 } from '../lib/math3d.ts'
import { cameraPosition, viewInverseMatrix, type OrbitCamera } from './camera.ts'

export interface Ray {
  origin: Vec3
  dir: Vec3
}

// 屏幕归一化坐标 (-1~1) → 世界射线
export function screenRay(camera: OrbitCamera, ndcX: number, ndcY: number): Ray {
  const origin = cameraPosition(camera)
  const inv = viewInverseMatrix(camera)
  const tanFov = Math.tan(camera.fovY / 2)
  const sx = ndcX * tanFov * (16 / 9)
  const sy = ndcY * tanFov
  const dir: Vec3 = [
    inv[0] * sx + inv[4] * sy + inv[8] * -1,
    inv[1] * sx + inv[5] * sy + inv[9] * -1,
    inv[2] * sx + inv[6] * sy + inv[10] * -1
  ]
  const len = Math.hypot(dir[0], dir[1], dir[2])
  return { origin, dir: [dir[0] / len, dir[1] / len, dir[2] / len] }
}

function raySphere(ray: Ray, center: Vec3, radius: number): number {
  const ox = ray.origin[0] - center[0]
  const oy = ray.origin[1] - center[1]
  const oz = ray.origin[2] - center[2]
  const b = ox * ray.dir[0] + oy * ray.dir[1] + oz * ray.dir[2]
  const c = ox * ox + oy * oy + oz * oz - radius * radius
  const disc = b * b - c
  if (disc < 0) return Infinity
  return -b - Math.sqrt(disc)
}

// 圆/方/心形蛋糕胚的射线求交（步进包围盒 + 二分）
function layerRayDistance(ray: Ray, layer: CakeLayer, yBottom: number): number {
  const r = layer.diameter / 2
  const y0 = yBottom - 0.2
  const y1 = yBottom + layer.height + 0.5
  const tY0 = (y0 - ray.origin[1]) / ray.dir[1]
  const tY1 = (y1 - ray.origin[1]) / ray.dir[1]
  const tEnter = Math.min(tY0, tY1)
  const tExit = Math.max(tY0, tY1)
  const tStart = Math.max(0, tEnter)
  if (tStart > tExit) return Infinity

  const inside2D = (x: number, z: number): boolean => {
    if (layer.shape === 'round') return x * x + z * z <= r * r
    if (layer.shape === 'square') return Math.abs(x) <= r && Math.abs(z) <= r
    return sdHeartUnit((2 * x) / layer.diameter, (2 * z) / layer.diameter) <= 0
  }
  const insideY = (y: number): boolean => y >= yBottom && y <= yBottom + layer.height
  const inside = (t: number): boolean => {
    const p = pointAt(ray, t)
    return inside2D(p[0], p[2]) && insideY(p[1])
  }
  if (inside(tStart)) return tStart
  // 粗步进找进入点，再二分精确化
  const span = tExit - tStart
  const steps = 48
  let prev = tStart
  let prevInside = false
  for (let i = 1; i <= steps; i++) {
    const t = tStart + (span * i) / steps
    const nowInside = inside(t)
    if (nowInside && !prevInside) {
      let lo = prev
      let hi = t
      for (let k = 0; k < 16; k++) {
        const mid = (lo + hi) / 2
        if (inside(mid)) hi = mid
        else lo = mid
      }
      return hi
    }
    prev = t
    prevInside = nowInside
  }
  return Infinity
}

export const pointAt = (ray: Ray, t: number): Vec3 => [
  ray.origin[0] + ray.dir[0] * t,
  ray.origin[1] + ray.dir[1] * t,
  ray.origin[2] + ray.dir[2] * t
]

// 管段射线求交：胶囊体距离迭代
function segmentRayDistance(ray: Ray, seg: Segment): number {
  let t = 0
  for (let i = 0; i < 24; i++) {
    const p = pointAt(ray, t)
    const d = pointToSegment(p, seg)
    if (d.dist - d.radius < 0.04) return t
    t += Math.max(0.05, d.dist - d.radius)
    if (t > 90) break
  }
  return Infinity
}

function pointToSegment(
  p: Vec3,
  seg: Segment
): { dist: number; radius: number } {
  const bax = seg.bx - seg.ax
  const bay = seg.by - seg.ay
  const baz = seg.bz - seg.az
  const pax = p[0] - seg.ax
  const pay = p[1] - seg.ay
  const paz = p[2] - seg.az
  const len2 = bax * bax + bay * bay + baz * baz || 1e-7
  const h = clamp((pax * bax + pay * bay + paz * baz) / len2, 0, 1)
  const cx = seg.ax + bax * h
  const cy = seg.ay + bay * h
  const cz = seg.az + baz * h
  return {
    dist: Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz),
    radius: seg.rA + (seg.rB - seg.rA) * h
  }
}

export interface PickResult {
  kind: 'layer' | 'path' | 'ground'
  point: Vec3
  layerId?: string
  pathId?: string
}

export function pickScene(design: CakeDesign, camera: OrbitCamera, ndcX: number, ndcY: number): PickResult | null {
  const ray = screenRay(camera, ndcX, ndcY)
  const layout = stackLayers(design.layers)
  let bestT = Infinity
  let result: PickResult | null = null

  design.layers.forEach((layer, index) => {
    const t = layerRayDistance(ray, layer, layout[index].yBottom)
    if (t < bestT) {
      bestT = t
      result = { kind: 'layer', point: pointAt(ray, t), layerId: layer.id }
    }
  })

  for (const path of design.paths) {
    const t = pickPath(ray, path)
    if (t < bestT) {
      bestT = t
      result = { kind: 'path', point: pointAt(ray, t), pathId: path.id }
    }
  }

  // 地面 y=0
  if (ray.dir[1] < -1e-6) {
    const t = -ray.origin[1] / ray.dir[1]
    if (t > 0 && t < bestT) result = { kind: 'ground', point: pointAt(ray, t) }
  }
  return result
}

function pickPath(ray: Ray, path: PipingPath): number {
  let best = Infinity
  for (const seg of buildSegments(path)) {
    const t = segmentRayDistance(ray, seg)
    if (t < best) best = t
  }
  return best
}

// 拾取装饰件：球近似，足够摆放交互用
export function pickDecoration(
  design: CakeDesign,
  camera: OrbitCamera,
  ndcX: number,
  ndcY: number
): string | null {
  const ray = screenRay(camera, ndcX, ndcY)
  let bestT = Infinity
  let bestId: string | null = null
  for (const d of design.decorations) {
    const t = raySphere(ray, [d.x, d.y, d.z], d.scale * 1.1)
    if (t < bestT) {
      bestT = t
      bestId = d.id
    }
  }
  return bestId
}
