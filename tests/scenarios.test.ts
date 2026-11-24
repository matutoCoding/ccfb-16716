// 三个测试方案的结构与用料统计集成测试
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildBirthdayCake,
  buildGlazeMousse,
  buildSeedOrder,
  buildWeddingCake
} from '../src/lib/seed_scenarios.ts'
import { computeStats } from '../src/lib/stats.ts'
import { DEFAULT_SETTINGS, whippedColor } from '../src/lib/materials.ts'
import { buildScene, GRID_MAX_PER_CELL, MAX_SEGMENTS } from '../src/render/scene_build.ts'

describe('方案一：三层婚礼蛋糕', () => {
  const design = buildWeddingCake()
  test('三层圆形堆叠、总高 31cm', () => {
    assert.equal(design.layers.length, 3)
    assert.ok(design.layers.every((layer) => layer.shape === 'round'))
    const totalHeight = design.layers.reduce((sum, layer) => sum + layer.height, 0)
    assert.equal(totalHeight, 31)
  })
  test('包含玫瑰、糖珠边和侧面环带', () => {
    assert.ok(design.paths.length >= 10)
    assert.ok(design.paths.some((path) => path.surface === 'side'))
    assert.ok(design.decorations.some((item) => item.kind === 'sugar_pearl'))
  })
  test('婚礼灯光预设', () => {
    assert.equal(design.lighting, 'wedding')
  })
})

describe('方案二：镜面淋面慕斯', () => {
  const design = buildGlazeMousse()
  test('心形双层且带滴落参数', () => {
    assert.ok(design.layers.every((layer) => layer.shape === 'heart'))
    assert.ok(design.layers.every((layer) => layer.material === 'glaze'))
    assert.ok(design.layers.every((layer) => layer.dripRatio > 0))
  })
  test('包含草莓蓝莓与巧克力片', () => {
    const kinds = new Set(design.decorations.map((item) => item.kind))
    assert.ok(kinds.has('fruit_strawberry'))
    assert.ok(kinds.has('fruit_blueberry'))
    assert.ok(kinds.has('chocolate_shard'))
  })
})

describe('方案三：数字生日蛋糕', () => {
  const design = buildBirthdayCake()
  test('方形单层 + 两根数字蜡烛 1 和 8', () => {
    assert.equal(design.layers[0].shape, 'square')
    const candles = design.decorations.filter((item) => item.kind === 'number_candle')
    assert.deepEqual(candles.map((item) => item.digit).sort(), [1, 8])
  })
  test('草莓围边数量为偶数对称', () => {
    const berries = design.decorations.filter((item) => item.kind === 'fruit_strawberry')
    assert.equal(berries.length % 2, 0)
    assert.ok(berries.length >= 10)
  })
})

describe('用料统计', () => {
  test('三个方案都能算出正数质量且淋面密度生效', () => {
    const seed = buildSeedOrder()
    for (const design of seed.designs) {
      const stats = computeStats(design, DEFAULT_SETTINGS)
      assert.ok(stats.totalMass > 0)
      assert.ok(stats.materials.length > 0)
    }
    const mousse = buildGlazeMousse()
    const glazeMaterial = computeStats(mousse, DEFAULT_SETTINGS).materials.find(
      (item) => item.material === 'glaze'
    )
    assert.ok(glazeMaterial)
    const expected = glazeMaterial.volume * DEFAULT_SETTINGS.glazeDensity
    assert.ok(Math.abs(glazeMaterial.mass - expected) < 1e-9)
  })

  test('打发程度越高奶油颜色越浅', () => {
    const base = { r: 200, g: 60, b: 90 }
    const low = whippedColor(base, 0.4)
    const high = whippedColor(base, 1)
    assert.ok(high.r >= low.r && high.g >= low.g && high.b >= low.b)
    assert.ok(high.r > base.r)
  })
})

describe('GPU 场景构建', () => {
  test('管段与装饰件数量在硬件上限内', () => {
    const seed = buildSeedOrder()
    for (const design of seed.designs) {
      const scene = buildScene(design)
      assert.ok(scene.segments.length <= MAX_SEGMENTS)
      assert.ok(scene.decorations.length <= 128)
      assert.ok(scene.grid.buckets.length > 0)
      const peak = Math.max(...scene.grid.buckets.map((bucket) => bucket.length))
      assert.ok(
        peak <= GRID_MAX_PER_CELL,
        `${design.name} 网格单格 ${peak} 段超过槽位 ${GRID_MAX_PER_CELL}`
      )
      // 每个管段至少落进一个格子
      const covered = new Set(scene.grid.buckets.flat())
      assert.equal(covered.size, scene.segments.length)
    }
  })

  test('空设计也能构建出合法场景', () => {
    const scene = buildScene({
      id: 'empty', name: 'empty', layers: [], paths: [], decorations: [],
      lighting: 'shop', createdAt: 0, updatedAt: 0
    })
    assert.equal(scene.segments.length, 0)
    assert.equal(scene.segBuffer.length, MAX_SEGMENTS * 13)
  })
})
