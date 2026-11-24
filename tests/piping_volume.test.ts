// 挤花体积对账测试：核心指标——统计体积与逐路径逐段累加之和误差 < 2%
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { CakeDesign, PathPoint, PipingPath } from '../src/model/types.ts'
import {
  buildSegments,
  generateBorderForLayers,
  generateRose,
  pathVolume,
  profileAreaCoeff,
  segmentVolume
} from '../src/lib/piping.ts'
import { computeStats } from '../src/lib/stats.ts'
import { DEFAULT_SETTINGS } from '../src/lib/materials.ts'
import { buildSeedOrder } from '../src/lib/seed_scenarios.ts'
import type { CakeLayer } from '../src/model/types.ts'

const straightPath = (length: number, radius: number, count: number): PipingPath => {
  const points: PathPoint[] = []
  for (let i = 0; i <= count; i++) {
    const t = i / count
    points.push({ x: t * length, y: 10, z: 0, radius, pressure: 1 })
  }
  const path: PipingPath = {
    id: 'p',
    layerId: 'l',
    surface: 'top',
    nozzle: 'round',
    nozzleCode: '12号圆口',
    color: { r: 255, g: 255, b: 255 },
    whip: 0.8,
    points,
    volume: 0
  }
  path.volume = pathVolume(path)
  return path
}

describe('体积解析公式', () => {
  test('等径直圆管体积 = πr²L，误差为 0', () => {
    const path = straightPath(20, 0.8, 40)
    const expected = Math.PI * 0.8 ** 2 * 20
    assert.ok(Math.abs(path.volume - expected) / expected < 1e-12)
  })

  test('逐段累加 = 整条路径体积（同一份数据两种算法）', () => {
    const path = straightPath(18, 0.6, 36)
    const bySegments = buildSegments(path).reduce((sum, seg) => sum + segmentVolume(seg), 0)
    assert.ok(Math.abs(bySegments - pathVolume(path)) < 1e-10)
  })

  test('变半径路径体积 = 截面积 × 半径平方积分，误差 < 0.1%', () => {
    const points: PathPoint[] = []
    const length = 12
    const r0 = 0.4
    const r1 = 0.9
    const count = 60
    for (let i = 0; i <= count; i++) {
      const t = i / count
      const radius = r0 + (r1 - r0) * t
      points.push({ x: t * length, y: 5, z: 0, radius, pressure: 1 })
    }
    const path: PipingPath = {
      ...straightPath(1, 0.5, 2),
      points
    }
    path.volume = pathVolume(path)
    // 解析基准：π ∫r(t)² dt = πL(r0²+r0r1+r1²)/3
    const expected = (Math.PI * length * (r0 ** 2 + r0 * r1 + r1 ** 2)) / 3
    assert.ok(Math.abs(path.volume - expected) / expected < 0.001)
  })

  test('各花嘴截面面积系数均为正值且星形小于外接圆', () => {
    const round = profileAreaCoeff('round')
    const star = profileAreaCoeff('star')
    assert.ok(star > 0 && star < round)
    assert.ok(profileAreaCoeff('leaf') < profileAreaCoeff('round'))
    assert.ok(profileAreaCoeff('shell') > profileAreaCoeff('round'))
  })
})

describe('统计与逐路径累加对账（硬指标 < 2%）', () => {
  test('三个测试方案的统计总量 = 每条路径体积逐条相加', () => {
    const seed = buildSeedOrder()
    for (const design of seed.designs) {
      const stats = computeStats(design, DEFAULT_SETTINGS)
      const manualSum = design.paths.reduce((sum, path) => sum + pathVolume(path), 0)
      const diff = Math.abs(stats.piping.totalVolume - manualSum) / manualSum
      assert.ok(diff < 0.02, `${design.name} 误差 ${(diff * 100).toFixed(3)}% 超过 2%`)
      // 分层累加同样对得上
      const layerSum = stats.layers.reduce((sum, layer) => sum + layer.pipingVolume, 0)
      const layerDiff = Math.abs(layerSum - manualSum) / manualSum
      assert.ok(layerDiff < 0.02, `${design.name} 分层对账误差超限`)
    }
  })

  test('上百朵玫瑰压力场景：管段数过千且体积误差仍 < 2%', () => {
    const layer: CakeLayer = {
      id: 'l',
      shape: 'round',
      diameter: 35,
      height: 10,
      material: 'cream',
      color: { r: 250, g: 244, b: 234 },
      dripRatio: 0
    }
    const paths: PipingPath[] = []
    for (let i = 0; i < 120; i++) {
      const angle = (i % 12) * 0.55
      const ring = Math.floor(i / 12) * 4.2
      paths.push(
        generateRose({
          layerId: 'l',
          cx: Math.cos(angle) * ring,
          cz: Math.sin(angle) * ring,
          radius: 2,
          nozzle: 'star',
          color: { r: 244, g: 178, b: 196 },
          whip: 0.8,
          yTop: 10
        })
      )
    }
    const design: CakeDesign = {
      id: 'd',
      name: '压力测试',
      layers: [layer],
      paths,
      decorations: [],
      lighting: 'shop',
      createdAt: 0,
      updatedAt: 0
    }
    const stats = computeStats(design, DEFAULT_SETTINGS)
    const manualSum = paths.reduce((sum, path) => sum + pathVolume(path), 0)
    assert.ok(stats.piping.segmentCount > 1000, `管段只有 ${stats.piping.segmentCount}`)
    assert.ok(Math.abs(stats.piping.totalVolume - manualSum) / manualSum < 0.02)
  })
})

describe('花型生成器', () => {
  test('玫瑰路径采样点连续且体积为正', () => {
    const layer: CakeLayer = {
      id: 'l', shape: 'round', diameter: 24, height: 10,
      material: 'cream', color: { r: 255, g: 255, b: 255 }, dripRatio: 0
    }
    const rose = generateRose({
      layerId: 'l', cx: 0, cz: 0, radius: 3,
      nozzle: 'petal', color: { r: 244, g: 178, b: 196 }, whip: 0.8, yTop: 10
    })
    assert.ok(rose.points.length > 30)
    assert.ok(rose.volume > 0)
  })

  test('花边贴合三种形状边界且不越界', () => {
    for (const shape of ['round', 'square', 'heart'] as const) {
      const layers: CakeLayer[] = [{
        id: 'l', shape, diameter: 22, height: 10,
        material: 'cream', color: { r: 255, g: 255, b: 255 }, dripRatio: 0
      }]
      const border = generateBorderForLayers(layers, layers[0], 'shell', { r: 1, g: 2, b: 3 }, 0.8)
      const limit = 22 / 2 + 0.5
      for (const point of border.points) {
        assert.ok(Math.abs(point.x) <= limit && Math.abs(point.z) <= limit)
      }
      assert.ok(border.volume > 0)
    }
  })
})
