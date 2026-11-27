import { NOZZLE_MAP } from '../data/nozzles';
import { volumeFromSamples } from './piping';
import { appendTube, createMeshData, meshSignedVolume } from '../render/meshData';
import { buildTestPlans } from '../data/presets';
import { addFlowerField } from './flowerField';
import { listPipingVolumes } from './stats';
import { db } from './db';
import type { PathSample } from '../types';

export interface SelfTestResult {
  name: string;
  pass: boolean;
  detail: string;
}

function straightSamples(length: number, count: number, scale = 1): PathSample[] {
  return Array.from({ length: count }, (_, i) => ({ p: [(i / (count - 1)) * length, 0, 0] as [number, number, number], scale, twist: 0 }));
}

export async function runSelfTests(): Promise<SelfTestResult[]> {
  const results: SelfTestResult[] = [];
  const test = (name: string, fn: () => void | Promise<void>) => {
    try {
      const maybe = fn();
      if (maybe instanceof Promise) {
        return maybe.then(() => results.push({ name, pass: true, detail: '通过' })).catch((err) => results.push({ name, pass: false, detail: String(err?.message ?? err) }));
      }
      results.push({ name, pass: true, detail: '通过' });
    } catch (err) {
      results.push({ name, pass: false, detail: String((err as Error)?.message ?? err) });
    }
  };

  await test('直线挤花体积 = 花嘴截面积 × 长度', () => {
    const nozzle = NOZZLE_MAP.get('star-1m')!;
    const v = volumeFromSamples(straightSamples(12, 24), nozzle);
    const expected = nozzle.areaCm2 * 12;
    const err = Math.abs(v - expected) / expected;
    if (err > 0.000001) throw new Error(`误差 ${(err * 100).toFixed(6)}%`);
  });

  await test('扫掠网格体积与路径积分误差 < 2%', () => {
    const nozzle = NOZZLE_MAP.get('star-18')!;
    const samples = straightSamples(18, 48, 1.08);
    const integrated = volumeFromSamples(samples, nozzle);
    const mesh = createMeshData();
    appendTube(mesh, samples, nozzle, '#fff', false);
    const meshVolume = meshSignedVolume(mesh);
    const err = Math.abs(meshVolume - integrated) / integrated;
    if (err >= 0.02) throw new Error(`误差 ${(err * 100).toFixed(2)}%`);
    results.push({ name: '　└ 实际误差', pass: true, detail: `${(err * 100).toFixed(3)}%（阈值 2%）` });
  });

  await test('三套业务方案完整', () => {
    const seed = buildTestPlans();
    if (seed.orders.length !== 3 || seed.designs.length < 4) throw new Error('订单或方案数量不足');
  });

  await test('120 朵压测方案可统计', () => {
    const seed = buildTestPlans();
    const added = addFlowerField(seed.designs[0], 120, 7);
    if (added < 100) throw new Error(`仅生成 ${added} 朵`);
    const rows = listPipingVolumes(seed.designs[0]);
    const sum = rows.reduce((s, r) => s + r.volumeCm3, 0);
    const total = rows.reduce((s, r) => s + r.volumeCm3, 0);
    if (Math.abs(sum - total) > 1e-9) throw new Error('逐路径累加不一致');
  });

  await test('IndexedDB 可读写', async () => {
    const key = `selftest-${Date.now()}`;
    await db.setKv(key, { ok: true, at: new Date().toISOString() });
    const value = await db.getKv<{ ok: boolean }>(key);
    if (!value?.ok) throw new Error('读取失败');
  });

  return results;
}
