import type { Design, PipingPath, Vec2 } from '../types';
import { getTierStack, isInsideShape, shapeTopArea } from './geometry';
import { makeBorder, makeRose, makeStar } from './piping';

export function nextSequence(design: Design): number {
  return design.paths.reduce((max, p) => Math.max(max, p.sequence), 0) + 1;
}

export function addRoseRing(design: Design, tierIndex: number, count: number, radiusCm?: number, color = '#f2b8c6'): void {
  const info = getTierStack(design.tiers)[tierIndex];
  if (!info) return;
  const radius = radiusCm ?? info.tier.sizeCm * 0.38;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + tierIndex * 0.27;
    const path = makeRose(info, nextSequence(design), info.centerX + Math.cos(a) * radius, info.centerZ + Math.sin(a) * radius, color);
    design.paths.push(path);
  }
}

/** 性能验收用：在各层未被上层覆盖的顶面区域生成上百朵玫瑰花/星星花。 */
export function addFlowerField(design: Design, total = 120, seed = 20261127): number {
  const stack = getTierStack(design.tiers);
  if (!stack.length) return 0;
  let state = seed >>> 0;
  const random = () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };

  const weights = stack.map((info, i) => {
    const next = stack[i + 1]?.tier;
    const innerArea = next ? shapeTopArea(next.shape, next.sizeCm) : 0;
    return Math.max(1, shapeTopArea(info.tier.shape, info.tier.sizeCm) - innerArea * 0.72);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const counts = weights.map((w) => Math.floor((total * w) / weightSum));
  while (counts.reduce((a, b) => a + b, 0) < total) {
    const i = weights.indexOf(Math.max(...weights));
    counts[i]++;
  }
  let added = 0;

  stack.forEach((info, tierIndex) => {
    const count = counts[tierIndex];
    const nextSize = stack[tierIndex + 1]?.tier.sizeCm ?? 0;
    const innerR = nextSize ? nextSize / 2 + 0.8 : 0;
    const outerR = info.tier.sizeCm / 2 - 1.4;
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count && added < total; i++) {
      let x = 0, z = 0, ok = false;
      for (let attempt = 0; attempt < 24; attempt++) {
        const a = i * golden + attempt * 0.73;
        const r = innerR + Math.sqrt((i + random()) / Math.max(1, count)) * Math.max(0.1, outerR - innerR);
        x = info.centerX + Math.cos(a) * r;
        z = info.centerZ + Math.sin(a) * r;
        const lx = x - info.centerX, lz = z - info.centerZ;
        if (r >= innerR && isInsideShape(info.tier.shape, info.tier.sizeCm - 2.2, lx, lz)) {
          ok = true;
          break;
        }
      }
      if (!ok) continue;
      const useRose = (i + tierIndex) % 2 === 0;
      const path = useRose
        ? makeRose(info, nextSequence(design), x, z, ['#f6c6d2', '#fff1d6', '#e79aae', '#f8d7b0'][i % 4])
        : makeStar(info, nextSequence(design), x, z, ['#fff4df', '#f7d774', '#f3b7c4', '#d8e8c4'][i % 4]);
      path.seed = random() * Math.PI * 2;
      design.paths.push(path);
      added++;
    }
  });
  return added;
}

export function addDefaultBorders(design: Design): void {
  for (const info of getTierStack(design.tiers)) {
    design.paths.push(makeBorder(info, nextSequence(design), 'shell', 'bottom-border', '#fff1d6'));
    design.paths.push(makeBorder(info, nextSequence(design), 'bead', 'top-border', '#f7e3c4'));
  }
}

export function shiftPointsForTier(path: PipingPath, _tierIndex: number): Vec2 {
  return [path.center?.[0] ?? 0, path.center?.[1] ?? 0];
}
