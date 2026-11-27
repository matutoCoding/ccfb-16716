import type { CakeShape, TierStackInfo, Tier, Vec2 } from '../types';
import { polygonArea, polygonPerimeter } from './color';

const heartCache = new Map<number, Vec2[]>();

/** 经典心形参数曲线，归一化到总宽度 = sizeCm。 */
export function heartPolygon(sizeCm: number, segments = 96): Vec2[] {
  const key = Math.round(sizeCm * 100) / 100;
  const cached = heartCache.get(key);
  if (cached) return cached;

  const raw: Vec2[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push([x, y]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const width = maxX - minX;
  const height = maxY - minY;
  const scale = sizeCm / width;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  // 第二个坐标是世界 Z；翻转曲线 Y，使心形凹口朝 +Z（镜头前方偏上也可通过旋转观察）。
  const points: Vec2[] = raw.map(([x, y]) => [(x - cx) * scale, -(y - cy) * scale * (sizeCm / (height * scale))]);
  heartCache.set(key, points);
  return points;
}

export function shapeTopArea(shape: CakeShape, sizeCm: number): number {
  if (shape === 'round') return Math.PI * sizeCm * sizeCm * 0.25;
  if (shape === 'square') return sizeCm * sizeCm;
  return polygonArea(heartPolygon(sizeCm));
}

export function shapePerimeter(shape: CakeShape, sizeCm: number): number {
  if (shape === 'round') return Math.PI * sizeCm;
  if (shape === 'square') return 4 * sizeCm;
  return polygonPerimeter(heartPolygon(sizeCm));
}

export function shapeBoundaryPoint(shape: CakeShape, sizeCm: number, u: number): Vec2 {
  const t = u * Math.PI * 2;
  if (shape === 'round') {
    const r = sizeCm / 2;
    return [Math.cos(t) * r, Math.sin(t) * r];
  }
  if (shape === 'square') {
    // 沿正方形周长匀速采样。
    const perimeter = 4 * sizeCm;
    let d = ((u % 1 + 1) % 1) * perimeter;
    const h = sizeCm / 2;
    if (d < sizeCm) return [-h + d, -h];
    d -= sizeCm;
    if (d < sizeCm) return [h, -h + d];
    d -= sizeCm;
    if (d < sizeCm) return [h - d, h];
    d -= sizeCm;
    return [-h, h - d];
  }
  const poly = heartPolygon(sizeCm);
  const f = ((u % 1 + 1) % 1) * poly.length;
  const i = Math.floor(f) % poly.length;
  const j = (i + 1) % poly.length;
  const k = f - Math.floor(f);
  return [poly[i][0] + (poly[j][0] - poly[i][0]) * k, poly[i][1] + (poly[j][1] - poly[i][1]) * k];
}

export function isInsideShape(shape: CakeShape, sizeCm: number, x: number, z: number): boolean {
  if (shape === 'round') return x * x + z * z <= (sizeCm / 2) ** 2;
  if (shape === 'square') return Math.abs(x) <= sizeCm / 2 && Math.abs(z) <= sizeCm / 2;
  const poly = heartPolygon(sizeCm, 64);
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1];
    const xj = poly[j][0], zj = poly[j][1];
    const intersect = (zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function getTierStack(tiers: Tier[]): TierStackInfo[] {
  let baseY = 0;
  return tiers.map((tier, index) => {
    const info: TierStackInfo = {
      tier,
      index,
      baseY,
      topY: baseY + tier.heightCm,
      centerX: tier.offsetXCm,
      centerZ: tier.offsetZCm
    };
    baseY += tier.heightCm;
    return info;
  });
}

export function getTierInfo(tiers: Tier[], tierId: string): TierStackInfo | undefined {
  return getTierStack(tiers).find((t) => t.tier.id === tierId);
}

/** 婚礼份量约 130–160 cm³/人；派对/儿童切块更大。 */
export function recommendTiers(people: number, event: 'wedding' | 'birthday' | 'party' = 'wedding'): number[] {
  const servingVolume = event === 'wedding' ? 145 : 190;
  const target = Math.max(1, people) * servingVolume;
  const heights = [12, 11, 10, 10];
  const candidates = [12, 15, 18, 20, 23, 25, 28, 30, 35, 40];

  const volume = (sizes: number[]) =>
    sizes.reduce((sum, d, i) => sum + shapeTopArea('round', d) * (heights[Math.min(i, heights.length - 1)] ?? 10), 0);

  const tierCount = people >= 70 ? 3 : people >= 28 ? 2 : 1;
  let best: number[] = tierCount === 3 ? [30, 23, 15] : tierCount === 2 ? [23, 15] : [18];

  // 在常见尺寸中搜索刚好覆盖目标体积、且层级递减的组合。
  for (let a = 0; a < candidates.length; a++) {
    for (let b = 0; b <= a; b++) {
      for (let c = 0; c <= b; c++) {
        const sizes = tierCount === 1 ? [candidates[a]] : tierCount === 2 ? [candidates[a], candidates[b]] : [candidates[a], candidates[b], candidates[c]];
        if (sizes.some((v, i) => i > 0 && v >= sizes[i - 1])) continue;
        const v = volume(sizes);
        const bestV = volume(best);
        if (v >= target && (bestV < target || v < bestV)) best = sizes;
      }
    }
  }
  return best;
}

export function estimateServings(tier: Tier): number {
  return Math.max(1, Math.round((shapeTopArea(tier.shape, tier.sizeCm) * tier.heightCm) / 145));
}
