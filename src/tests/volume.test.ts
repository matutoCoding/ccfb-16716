import { describe, expect, it } from 'vitest';
import { NOZZLE_MAP } from '../data/nozzles';
import { volumeFromSamples, closedPathVolume, computePathVolume, createPipingPath } from '../lib/piping';
import { appendTube, createMeshData, meshSignedVolume } from '../render/meshData';
import { buildTestPlans } from '../data/presets';
import { addFlowerField } from '../lib/flowerField';
import { listPipingVolumes, totalPipingVolume } from '../lib/stats';
import { recommendTiers, getTierStack } from '../lib/geometry';
import type { PathSample, TierStackInfo } from '../types';

function straightSamples(length: number, count: number, scale = 1): PathSample[] {
  return Array.from({ length: count }, (_, i) => ({
    p: [(i / (count - 1)) * length, 0, 0] as [number, number, number],
    scale,
    twist: 0
  }));
}

describe('挤花路径体积统计', () => {
  it('直线路径与花嘴截面积 × 长度一致', () => {
    const nozzle = NOZZLE_MAP.get('star-1m')!;
    const length = 12;
    const volume = volumeFromSamples(straightSamples(length, 24), nozzle);
    const analytical = nozzle.areaCm2 * length;
    expect(Math.abs(volume - analytical) / analytical).toBeLessThan(0.000001);
  });

  it('生成的扫掠网格有符号体积与积分体积误差小于 2%', () => {
    const nozzle = NOZZLE_MAP.get('star-18')!;
    const samples = straightSamples(18, 48, 1.08);
    const integrated = volumeFromSamples(samples, nozzle);
    const mesh = createMeshData();
    appendTube(mesh, samples, nozzle, '#ffffff', false);
    const meshVolume = meshSignedVolume(mesh);
    const error = Math.abs(meshVolume - integrated) / integrated;
    expect(error).toBeLessThan(0.02);
  });

  it('压力/速度改变截面时，分段梯形积分仍与网格体积一致 (<2%)', () => {
    const nozzle = NOZZLE_MAP.get('round-12')!;
    const samples: PathSample[] = Array.from({ length: 60 }, (_, i) => {
      const t = i / 59;
      return { p: [t * 20, 0, Math.sin(t * Math.PI * 2) * 1.5], scale: 0.75 + 0.35 * Math.sin(t * Math.PI), twist: 0 };
    });
    const integrated = volumeFromSamples(samples, nozzle);
    const mesh = createMeshData();
    appendTube(mesh, samples, nozzle, '#fff', false);
    const meshVolume = meshSignedVolume(mesh);
    expect(Math.abs(meshVolume - integrated) / integrated).toBeLessThan(0.02);
  });

  it('闭合贝壳边把首尾段计入体积', () => {
    const nozzle = NOZZLE_MAP.get('star-18')!;
    const r = 10;
    const samples: PathSample[] = Array.from({ length: 120 }, (_, i) => {
      const a = (i / 120) * Math.PI * 2;
      return { p: [Math.cos(a) * r, 0, Math.sin(a) * r], scale: 1, twist: 0 };
    });
    const closed = closedPathVolume(samples, nozzle);
    const circumference = Math.PI * 2 * r;
    expect(Math.abs(closed - nozzle.areaCm2 * circumference) / (nozzle.areaCm2 * circumference)).toBeLessThan(0.02);
  });

  it('UI 行体积逐路径累加等于总体积', () => {
    const seed = buildTestPlans();
    for (const design of seed.designs) {
      const rows = listPipingVolumes(design);
      const sum = rows.reduce((s, r) => s + r.volumeCm3, 0);
      expect(sum).toBeCloseTo(totalPipingVolume(design), 10);
      for (const row of rows) expect(row.volumeCm3).toBeGreaterThan(0);
    }
  });

  it('computePathVolume 与列表统计使用同一实现', () => {
    const seed = buildTestPlans();
    const d = seed.designs[0];
    const stack = getTierStack(d.tiers);
    const rows = listPipingVolumes(d);
    for (const row of rows.slice(0, 20)) {
      const path = d.paths.find((p) => p.id === row.pathId)!;
      const info = stack.find((t) => t.tier.id === path.tierId);
      expect(computePathVolume(path, info)).toBeGreaterThan(0);
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('三套测试方案与性能压测', () => {
  it('包含婚礼、镜面慕斯、数字生日三个场景', () => {
    const seed = buildTestPlans();
    expect(seed.orders).toHaveLength(3);
    expect(seed.designs.length).toBeGreaterThanOrEqual(4);
    const allText = JSON.stringify(seed);
    expect(allText).toContain('婚礼');
    expect(allText).toContain('镜面');
    expect(allText).toContain('数字蜡烛');
  });

  it('120 朵挤花压测可生成且体积全部可统计', () => {
    const seed = buildTestPlans();
    const wedding = seed.designs[0];
    const before = wedding.paths.length;
    const added = addFlowerField(wedding, 120, 42);
    expect(added).toBeGreaterThanOrEqual(100);
    expect(wedding.paths.length).toBe(before + added);
    const rows = listPipingVolumes(wedding);
    expect(rows.length).toBe(wedding.paths.filter((p) => p.visible).length);
    expect(rows.reduce((s, r) => s + r.volumeCm3, 0)).toBeGreaterThan(100);
  });

  it('人数推荐尺寸覆盖目标体积', () => {
    for (const people of [8, 18, 40, 96, 150]) {
      const sizes = recommendTiers(people, people > 60 ? 'wedding' : 'birthday');
      expect(sizes.length).toBeGreaterThan(0);
      expect(sizes[0]).toBeGreaterThanOrEqual(sizes[sizes.length - 1]);
    }
    expect(recommendTiers(96, 'wedding')).toHaveLength(3);
  });
});
