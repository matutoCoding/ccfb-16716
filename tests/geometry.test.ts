// 几何模块测试：占地面积、周长、层堆叠、尺寸推荐
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  boundaryRadius,
  footprintArea,
  footprintPerimeter,
  pointInFootprint,
  recommendSingleLayer,
  recommendTiers,
  stackLayers
} from '../src/lib/geometry.ts'
import type { CakeLayer } from '../src/model/types.ts'

const makeLayer = (diameter: number, height: number): CakeLayer => ({
  id: 'l',
  shape: 'round',
  diameter,
  height,
  material: 'cream',
  color: { r: 255, g: 255, b: 255 },
  dripRatio: 0
})

describe('footprintArea', () => {
  test('圆形面积与解析公式误差小于 0.5%', () => {
    const diameter = 24
    const expected = Math.PI * (diameter / 2) ** 2
    const actual = footprintArea('round', diameter)
    assert.ok(Math.abs(actual - expected) / expected < 0.005)
  })

  test('方形面积等于边长平方', () => {
    assert.equal(footprintArea('square', 20), 400)
  })

  test('心形面积约为同宽圆形的 58%~70%（心形定义域决定）', () => {
    const diameter = 24
    const circle = Math.PI * (diameter / 2) ** 2
    const heart = footprintArea('heart', diameter)
    const ratio = heart / circle
    assert.ok(ratio > 0.58 && ratio < 0.7, `实际比例 ${ratio}`)
  })

  test('心形周长与面积内部一致（等比缩放平方关系）', () => {
    const a1 = footprintArea('heart', 10)
    const a2 = footprintArea('heart', 20)
    assert.ok(Math.abs(a2 / a1 - 4) < 0.03)
  })
})

describe('footprintPerimeter', () => {
  test('圆形周长等于 πd', () => {
    const p = footprintPerimeter('round', 20)
    assert.ok(Math.abs(p - Math.PI * 20) / (Math.PI * 20) < 0.01)
  })

  test('方形周长等于 4d', () => {
    assert.equal(footprintPerimeter('square', 20), 80)
  })
})

describe('pointInFootprint 与 boundaryRadius', () => {
  test('圆形边界半径恒等于半径', () => {
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2
      assert.ok(Math.abs(boundaryRadius('round', 20, angle) - 10) < 1e-9)
    }
  })

  test('边界点落在 footprint 内、边界外一点被拒绝', () => {
    for (const shape of ['round', 'square', 'heart'] as const) {
      const angle = 0.7
      const r = boundaryRadius(shape, 20, angle)
      const inside = r * 0.9
      const outside = r * 1.15
      assert.ok(pointInFootprint(shape, 20, Math.cos(angle) * inside, Math.sin(angle) * inside))
      assert.ok(!pointInFootprint(shape, 20, Math.cos(angle) * outside, Math.sin(angle) * outside))
    }
  })
})

describe('stackLayers', () => {
  test('三层底面高度依次累加', () => {
    const layers = [makeLayer(30, 11), makeLayer(24, 10), makeLayer(18, 9)]
    const layout = stackLayers(layers)
    assert.deepEqual(layout.map((item) => item.yBottom), [0, 11, 21])
    assert.deepEqual(layout.map((item) => item.yTop), [11, 21, 30])
  })
})

describe('尺寸推荐', () => {
  test('10 人推荐最小档圆形 15cm', () => {
    assert.equal(recommendSingleLayer(10, 'round'), 15)
  })

  test('方形推荐面积不小于同人数圆形', () => {
    const round = recommendSingleLayer(30, 'round')
    const square = recommendSingleLayer(30, 'square')
    assert.ok(square * square >= Math.PI * (round / 2) ** 2 * 0.98)
  })

  test('60 人推荐三层且总份数达标', () => {
    const suggestion = recommendTiers(60)
    assert.equal(suggestion.tiers.length, 3)
    assert.ok(suggestion.totalServings >= 60)
    // 底层最大、顶层最小，相邻层差至少 4cm
    for (let i = 1; i < suggestion.tiers.length; i++) {
      assert.ok(suggestion.tiers[i - 1] - suggestion.tiers[i] >= 4)
    }
  })
})
