// 用料统计：所有数字与每条挤花路径的解析体积累加同源
import type {
  AppSettings,
  CakeDesign,
  CakeLayer,
  Decoration,
  MaterialKind,
  PipingPath
} from '../model/types.ts'
import { footprintArea, footprintPerimeter, layerVolume } from './geometry.ts'
import { pathVolume, profileAreaCoeff } from './piping.ts'
import { MATERIAL_PARAMS } from './materials.ts'

export interface MaterialUsage {
  material: MaterialKind
  // 体积 cm³
  volume: number
  // 质量 g
  mass: number
}

export interface LayerStat {
  layerId: string
  cakeVolume: number
  // 表层包覆体积（淋面/翻糖按包覆面积 × 厚度估算）
  coatingVolume: number
  pipingVolume: number
  pipingCount: number
}

export interface DesignStats {
  layers: LayerStat[]
  materials: MaterialUsage[]
  piping: {
    pathCount: number
    segmentCount: number
    totalVolume: number
    byNozzle: { nozzle: string; count: number; volume: number }[]
  }
  decorationCount: number
  totalMass: number
}

// 表层包覆厚度 cm：淋面 0.25，翻糖 0.35，奶油抹面 0.4
const COATING_THICKNESS: Record<MaterialKind, number> = {
  cream: 0.4,
  fondant: 0.35,
  glaze: 0.25
}

function coatingArea(layer: CakeLayer): number {
  const top = footprintArea(layer.shape, layer.diameter)
  const side = footprintPerimeter(layer.shape, layer.diameter) * layer.height
  return top + side
}

const densityOf = (settings: AppSettings, kind: MaterialKind): number =>
  settings[MATERIAL_PARAMS[kind].densityKey]

export function computeStats(design: CakeDesign, settings: AppSettings): DesignStats {
  const materialBuckets = new Map<MaterialKind, number>()
  const addMaterial = (kind: MaterialKind, volume: number): void => {
    materialBuckets.set(kind, (materialBuckets.get(kind) ?? 0) + volume)
  }

  const layerStats: LayerStat[] = design.layers.map((layer) => {
    const cakeVol = layerVolume(layer)
    const coatVol = coatingArea(layer) * COATING_THICKNESS[layer.material]
    const layerPaths = design.paths.filter((path) => path.layerId === layer.id)
    const pipeVol = layerPaths.reduce((sum, path) => sum + pathVolume(path), 0)
    addMaterial(layer.material, coatVol)
    addMaterial('cream', pipeVol)
    return {
      layerId: layer.id,
      cakeVolume: cakeVol,
      coatingVolume: coatVol,
      pipingVolume: pipeVol,
      pipingCount: layerPaths.length
    }
  })

  const nozzleMap = new Map<string, { count: number; volume: number }>()
  let segmentCount = 0
  for (const path of design.paths) {
    const entry = nozzleMap.get(path.nozzleCode) ?? { count: 0, volume: 0 }
    entry.count += 1
    entry.volume += pathVolume(path)
    segmentCount += Math.max(0, path.points.length - 1)
    nozzleMap.set(path.nozzleCode, entry)
  }

  const materials: MaterialUsage[] = [...materialBuckets.entries()]
    .filter(([, volume]) => volume > 0)
    .map(([material, volume]) => ({
      material,
      volume,
      mass: volume * densityOf(settings, material)
    }))

  const totalPipingVolume = design.paths.reduce((sum, path) => sum + pathVolume(path), 0)

  return {
    layers: layerStats,
    materials,
    piping: {
      pathCount: design.paths.length,
      segmentCount,
      totalVolume: totalPipingVolume,
      byNozzle: [...nozzleMap.entries()].map(([nozzle, value]) => ({ nozzle, ...value }))
    },
    decorationCount: design.decorations.length,
    totalMass: materials.reduce((sum, item) => sum + item.mass, 0)
  }
}

// 单条路径的独立体积（制作单逐行展示）
export const pathStat = (path: PipingPath): number => pathVolume(path)

// 花嘴截面面积（制作单展示）
export const nozzleArea = (path: PipingPath): number =>
  profileAreaCoeff(path.nozzle) * (path.points[0]?.radius ?? 0) ** 2

// 装饰件清单
export function decorationList(design: CakeDesign): { kind: Decoration['kind']; count: number }[] {
  const map = new Map<Decoration['kind'], number>()
  for (const item of design.decorations) map.set(item.kind, (map.get(item.kind) ?? 0) + 1)
  return [...map.entries()].map(([kind, count]) => ({ kind, count }))
}
