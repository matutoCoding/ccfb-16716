import type { Design, TierStackInfo } from '../types';
import { getTierStack, shapeBoundaryPoint } from './geometry';

export interface DripDescriptor {
  tierId: string;
  x: number;
  yTop: number;
  z: number;
  radius: number;
  length: number;
  tierIndex: number;
}

function hash01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export function getDrips(design: Design): DripDescriptor[] {
  const stack = getTierStack(design.tiers);
  const result: DripDescriptor[] = [];
  for (const info of stack) {
    if (info.tier.material !== 'glaze') continue;
    const count = Math.max(0, Math.min(24, info.tier.glaze.drips));
    for (let i = 0; i < count; i++) {
      const seed = (info.index + 1) * 100 + i;
      const u = (i + 0.25 + hash01(seed) * 0.5) / count;
      const p = shapeBoundaryPoint(info.tier.shape, info.tier.sizeCm + 0.08, u);
      const radius = 0.28 + hash01(seed + 9) * 0.25;
      // 让滴柱一半嵌入侧壁，视觉上是挂在表面的淋面，而不是独立柱子。
      const inward = Math.max(0.82, 1 - (radius * 0.95) / (info.tier.sizeCm / 2));
      const length = info.tier.glaze.dripLengthCm * (0.45 + hash01(seed + 17) * 0.85);
      result.push({
        tierId: info.tier.id,
        x: info.centerX + p[0] * inward,
        yTop: info.topY + 0.04,
        z: info.centerZ + p[1] * inward,
        radius,
        length: Math.max(0.4, length),
        tierIndex: info.index
      });
    }
  }
  return result;
}

export function dripVolumeCm3(d: DripDescriptor): number {
  return Math.PI * d.radius * d.radius * d.length + (4 / 3) * Math.PI * d.radius ** 3;
}
