import type { Design, MaterialRow } from '../types';
import { estimateServings, getTierStack, shapePerimeter, shapeTopArea } from './geometry';
import { computePathVolume } from './piping';
import { getNozzle } from '../data/nozzles';
import { dripVolumeCm3, getDrips } from './drips';

export const DEFAULT_DENSITIES = {
  cream: 1.08,
  fondant: 1.18,
  glaze: 1.22,
  sponge: 0.62
};

export interface PipingVolumeRow {
  pathId: string;
  name: string;
  nozzle: string;
  sequence: number;
  volumeCm3: number;
  creamG: number;
  color: string;
}

export function listPipingVolumes(design: Design): PipingVolumeRow[] {
  const stack = getTierStack(design.tiers);
  return design.paths
    .filter((p) => p.visible)
    .map((path) => {
      const info = stack.find((t) => t.tier.id === path.tierId);
      const volumeCm3 = computePathVolume(path, info);
      return {
        pathId: path.id,
        name: path.name,
        nozzle: getNozzle(path.nozzleId).name,
        sequence: path.sequence,
        volumeCm3,
        creamG: volumeCm3 * DEFAULT_DENSITIES.cream,
        color: path.color
      };
    })
    .sort((a, b) => a.sequence - b.sequence);
}

export function totalPipingVolume(design: Design): number {
  return listPipingVolumes(design).reduce((sum, row) => sum + row.volumeCm3, 0);
}

export function collectMaterials(design: Design): { rows: MaterialRow[]; total: MaterialRow | null; pipingRows: PipingVolumeRow[] } {
  const stack = getTierStack(design.tiers);
  const pipingRows = listPipingVolumes(design);
  const drips = getDrips(design);

  const rows: MaterialRow[] = stack.map((info) => {
    const tier = info.tier;
    const topArea = shapeTopArea(tier.shape, tier.sizeCm);
    const sideArea = shapePerimeter(tier.shape, tier.sizeCm) * tier.heightCm;
    const area = topArea + sideArea;
    let coatingVolume = 0;
    let coatingName = '奶油抹面';
    let density = DEFAULT_DENSITIES.cream;
    if (tier.material === 'cream') {
      coatingVolume = area * 0.34;
      coatingName = '奶油抹面';
      density = DEFAULT_DENSITIES.cream;
    } else if (tier.material === 'fondant') {
      coatingVolume = area * 0.16 + topArea * 0.08;
      coatingName = '翻糖皮包覆';
      density = DEFAULT_DENSITIES.fondant;
    } else {
      coatingVolume = topArea * 0.22 + sideArea * 0.08;
      coatingVolume += drips.filter((d) => d.tierId === tier.id).reduce((s, d) => s + dripVolumeCm3(d), 0);
      coatingName = '镜面淋面';
      density = DEFAULT_DENSITIES.glaze;
    }

    const tierPipingRows = pipingRows.filter((row) => {
      const path = design.paths.find((p) => p.id === row.pathId);
      return path?.tierId === tier.id;
    });
    const pipingVolume = tierPipingRows.reduce((s, r) => s + r.volumeCm3, 0);
    const tierPaths = design.paths.filter((p) => p.tierId === tier.id && p.visible);
    const flowerCount = tierPaths.filter((p) => p.pattern === 'rose' || p.pattern === 'star').length;
    const spongeVolume = topArea * tier.heightCm * 0.94;

    return {
      tierId: tier.id,
      label: `第 ${info.index + 1} 层 · ${tier.shape === 'round' ? '圆形' : tier.shape === 'square' ? '方形' : '心形'} ${tier.sizeCm}cm`,
      shape: tier.shape,
      sizeCm: tier.sizeCm,
      heightCm: tier.heightCm,
      serves: estimateServings(tier),
      spongeVolumeCm3: spongeVolume,
      spongeG: spongeVolume * DEFAULT_DENSITIES.sponge,
      coatingName,
      coatingVolumeCm3: coatingVolume,
      coatingG: coatingVolume * density,
      pipingVolumeCm3: pipingVolume,
      pipingG: pipingVolume * DEFAULT_DENSITIES.cream,
      pathCount: tierPaths.length,
      flowerCount,
      nozzles: Array.from(new Set(tierPaths.map((p) => getNozzle(p.nozzleId).name)))
    };
  });

  const total: MaterialRow | null = rows.length
    ? rows.reduce((acc, row) => {
        acc.serves += row.serves;
        acc.spongeVolumeCm3 += row.spongeVolumeCm3;
        acc.spongeG += row.spongeG;
        acc.coatingVolumeCm3 += row.coatingVolumeCm3;
        acc.coatingG += row.coatingG;
        acc.pipingVolumeCm3 += row.pipingVolumeCm3;
        acc.pipingG += row.pipingG;
        acc.pathCount += row.pathCount;
        acc.flowerCount += row.flowerCount;
        return acc;
      }, { ...rows[0], label: '合计' })
    : null;

  return { rows, total, pipingRows };
}

export function formatCm3(v: number): string {
  return `${v.toFixed(1)} ml`;
}

export function formatG(v: number): string {
  return `${Math.round(v)} g`;
}
