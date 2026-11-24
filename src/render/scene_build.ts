// 场景构建：设计数据 → GPU 友好的扁平数组 + 空间网格加速结构
import type { CakeDesign, CakeLayer, Decoration, RGB } from '../model/types.ts'
import { stackLayers } from '../lib/geometry.ts'
import { buildSegments, type Segment } from '../lib/piping.ts'
import { whippedColor } from '../lib/materials.ts'

export const MAX_SEGMENTS = 12000
export const MAX_DECORATIONS = 128
export const GRID_MAX_PER_CELL = 96
const GRID_CELLS = 48
// 每段 13 个 float：端点 6 + 半径 2 + profile + whip + 颜色 3
const SEG_FLOATS = 13

export interface GpuLayer {
  shape: number // 0 圆 1 方 2 心
  radius: number
  height: number
  yBottom: number
  material: number // 0 奶油 1 翻糖 2 淋面
  r: number
  g: number
  b: number
  drip: number
}

export interface GpuDecoration {
  kind: number
  x: number
  y: number
  z: number
  rotation: number
  scale: number
  r: number
  g: number
  b: number
  digit: number
}

export interface GpuScene {
  layers: GpuLayer[]
  segments: Segment[]
  decorations: GpuDecoration[]
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }
  grid: {
    cellsX: number
    cellsY: number
    cellsZ: number
    cellX: number
    cellY: number
    cellZ: number
    originX: number
    originY: number
    originZ: number
    buckets: number[][]
  }
  segBuffer: Float32Array
  gridMeta: Float32Array
  gridIndex: Int32Array
  gridCounts: Int32Array
}

const SHAPE_ID = { round: 0, square: 1, heart: 2 }
const MATERIAL_ID = { cream: 0, fondant: 1, glaze: 2 }

const DECORATION_ID: Record<Decoration['kind'], number> = {
  fruit_strawberry: 0,
  fruit_blueberry: 1,
  chocolate_shard: 2,
  sugar_pearl: 3,
  number_candle: 4
}

// sRGB → 线性光
function toLinear01(c: RGB): [number, number, number] {
  const conv = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return [conv(c.r), conv(c.g), conv(c.b)]
}

export function buildScene(design: CakeDesign): GpuScene {
  const layout = stackLayers(design.layers)
  const layers: GpuLayer[] = design.layers.map((layer, index) => {
    const [r, g, b] = toLinear01(layer.color)
    return {
      shape: SHAPE_ID[layer.shape],
      radius: layer.diameter / 2,
      height: layer.height,
      yBottom: layout[index].yBottom,
      material: MATERIAL_ID[layer.material],
      r,
      g,
      b,
      drip: layer.dripRatio
    }
  })

  // 管段：所有路径扁平展开，应用打发后的颜色
  const segments: Segment[] = []
  for (const path of design.paths) {
    const [lr, lg, lb] = toLinear01(whippedColor(path.color, path.whip))
    for (const seg of buildSegments(path).slice(0, MAX_SEGMENTS - segments.length)) {
      segments.push({
        ...seg,
        color: { r: lr * 255, g: lg * 255, b: lb * 255 },
        whip: path.whip
      })
    }
    if (segments.length >= MAX_SEGMENTS) break
  }

  const decorations: GpuDecoration[] = design.decorations.slice(0, MAX_DECORATIONS).map((d) => {
    const [r, g, b] = toLinear01(d.color)
    return {
      kind: DECORATION_ID[d.kind],
      x: d.x,
      y: d.y,
      z: d.z,
      rotation: d.rotationY,
      scale: d.scale,
      r,
      g,
      b,
      digit: d.digit
    }
  })

  const bounds = computeBounds(design.layers, segments, decorations)
  const grid = buildGrid(segments, bounds)

  return {
    layers,
    segments,
    decorations,
    bounds,
    grid,
    segBuffer: flattenSegments(segments),
    gridMeta: new Float32Array([
      grid.cellsX,
      grid.cellsY,
      grid.cellsZ,
      grid.cellX,
      grid.cellY,
      grid.cellZ,
      grid.originX,
      grid.originY,
      grid.originZ
    ]),
    gridIndex: flattenGridIndex(grid.buckets, grid.cellsX * grid.cellsY * grid.cellsZ),
    gridCounts: Int32Array.from(grid.buckets, (bucket) => bucket.length)
  }
}

function computeBounds(
  layers: CakeLayer[],
  segments: Segment[],
  decorations: GpuDecoration[]
): GpuScene['bounds'] {
  // 从真实内容起步，留 2cm 安全边，避免固定大盒子把网格撑稀
  let minX = Infinity
  let maxX = -Infinity
  let minY = -0.5
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const consider = (x: number, y: number, z: number, pad: number): void => {
    minX = Math.min(minX, x - pad)
    maxX = Math.max(maxX, x + pad)
    minY = Math.min(minY, y - pad)
    maxY = Math.max(maxY, y + pad)
    minZ = Math.min(minZ, z - pad)
    maxZ = Math.max(maxZ, z + pad)
  }
  for (const layer of layers) {
    const r = layer.diameter / 2 + 1
    consider(0, layer.height / 2, 0, Math.max(r, 4))
  }
  for (const seg of segments) {
    consider(seg.ax, seg.ay, seg.az, seg.rA + 0.5)
    consider(seg.bx, seg.by, seg.bz, seg.rB + 0.5)
  }
  for (const d of decorations) consider(d.x, d.y, d.z, d.scale + 0.5)
  // 空场景兜底，保证网格纹理始终有合法范围
  if (!Number.isFinite(minX)) {
    return { minX: -20, maxX: 20, minY: -1, maxY: 30, minZ: -20, maxZ: 20 }
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}

function buildGrid(segments: Segment[], bounds: GpuScene['bounds']): GpuScene['grid'] {
  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY
  const spanZ = bounds.maxZ - bounds.minZ
  // 三轴各自细分，避免竖向高度把水平格子撑稀
  const cellX = spanX / GRID_CELLS
  const cellY = spanY / GRID_CELLS
  const cellZ = spanZ / GRID_CELLS
  const cellsX = Math.max(1, Math.ceil(spanX / cellX))
  const cellsY = Math.max(1, Math.ceil(spanY / cellY))
  const cellsZ = Math.max(1, Math.ceil(spanZ / cellZ))
  const buckets: number[][] = Array.from({ length: cellsX * cellsY * cellsZ }, () => [])

  const toCell = (v: number, min: number, size: number): number => Math.floor((v - min) / size)
  segments.forEach((seg, index) => {
    const padX = Math.max(seg.rA, seg.rB) + cellX * 0.15
    const padY = Math.max(seg.rA, seg.rB) + cellY * 0.15
    const padZ = Math.max(seg.rA, seg.rB) + cellZ * 0.15
    const x0 = Math.max(0, toCell(Math.min(seg.ax, seg.bx) - padX, bounds.minX, cellX))
    const x1 = Math.min(cellsX - 1, toCell(Math.max(seg.ax, seg.bx) + padX, bounds.minX, cellX))
    const y0 = Math.max(0, toCell(Math.min(seg.ay, seg.by) - padY, bounds.minY, cellY))
    const y1 = Math.min(cellsY - 1, toCell(Math.max(seg.ay, seg.by) + padY, bounds.minY, cellY))
    const z0 = Math.max(0, toCell(Math.min(seg.az, seg.bz) - padZ, bounds.minZ, cellZ))
    const z1 = Math.min(cellsZ - 1, toCell(Math.max(seg.az, seg.bz) + padZ, bounds.minZ, cellZ))
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          buckets[x + cellsX * (y + cellsY * z)].push(index)
        }
      }
    }
  })

  return {
    cellsX,
    cellsY,
    cellsZ,
    cellX,
    cellY,
    cellZ,
    originX: bounds.minX,
    originY: bounds.minY,
    originZ: bounds.minZ,
    buckets
  }
}

function flattenSegments(segments: Segment[]): Float32Array {
  const wide = new Float32Array(MAX_SEGMENTS * SEG_FLOATS)
  segments.forEach((seg, i) => {
    const base = i * SEG_FLOATS
    wide[base] = seg.ax
    wide[base + 1] = seg.ay
    wide[base + 2] = seg.az
    wide[base + 3] = seg.bx
    wide[base + 4] = seg.by
    wide[base + 5] = seg.bz
    wide[base + 6] = seg.rA
    wide[base + 7] = seg.rB
    wide[base + 8] = seg.profile
    wide[base + 9] = seg.whip
    wide[base + 10] = seg.color.r / 255
    wide[base + 11] = seg.color.g / 255
    wide[base + 12] = seg.color.b / 255
  })
  return wide
}

function flattenGridIndex(buckets: number[][], cellCount: number): Int32Array {
  const texture = new Int32Array(cellCount * GRID_MAX_PER_CELL).fill(-1)
  let overflow = 0
  buckets.forEach((bucket, cellIndex) => {
    if (bucket.length > GRID_MAX_PER_CELL) overflow++
    bucket.slice(0, GRID_MAX_PER_CELL).forEach((segIndex, slot) => {
      texture[cellIndex * GRID_MAX_PER_CELL + slot] = segIndex
    })
  })
  if (overflow > 0) {
    console.warn(`空间网格有 ${overflow} 个格子超出单格槽位 ${GRID_MAX_PER_CELL}，部分管段未入格`)
  }
  return texture
}
