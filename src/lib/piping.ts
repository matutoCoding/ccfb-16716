import type { PipingPath, PathSample, TierStackInfo, Vec3, Vec2 } from '../types';
import { getNozzle, type Nozzle } from '../data/nozzles';
import { shapePerimeter, shapeBoundaryPoint } from './geometry';
import { clamp, uid } from './util';

export function extrusionScale(path: Pick<PipingPath, 'pressure' | 'speedCmS'>): number {
  const pressure = clamp(path.pressure, 0.1, 1);
  const speed = Math.max(0.5, path.speedCmS);
  // 截面积 ≈ 挤出流量 / 移动速度；压力决定流量。半径缩放取平方根。
  const areaRatio = clamp((0.42 + pressure * 0.94) / (speed / 4), 0.18, 2.35);
  return Math.sqrt(areaRatio);
}

function pushSample(list: PathSample[], p: Vec3, scale: number, twist = 0): void {
  list.push({ p, scale: Math.max(0.04, scale), twist });
}

export function buildPathSamples(path: PipingPath, info?: TierStackInfo): PathSample[] {
  const base = extrusionScale(path);
  const samples: PathSample[] = [];
  const topY = info?.topY ?? path.points?.[0]?.[1] ?? 0;
  const cx = path.center?.[0] ?? info?.centerX ?? 0;
  const cz = path.center?.[1] ?? info?.centerZ ?? 0;

  if (path.pattern === 'free') {
    const pts = path.points ?? [];
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(pts.length - 1, i + 1)];
      const dx = next[0] - prev[0], dz = next[2] - prev[2];
      pushSample(samples, [pts[i][0], pts[i][1] + 0.08, pts[i][2]], base, Math.atan2(dz, dx) * 0.15);
    }
    return samples;
  }

  if (!info) return samples;
  const { tier } = info;
  const perimeter = shapePerimeter(tier.shape, tier.sizeCm);

  if (path.pattern === 'shell' || path.pattern === 'bead') {
    const shellLength = path.pattern === 'shell' ? 3.1 : 2.15;
    const repeats = path.repeats ?? Math.max(8, Math.round(perimeter / shellLength));
    const perMotif = path.pattern === 'shell' ? 11 : 9;
    const n = repeats * perMotif;
    const yBase = path.surface === 'top-border' ? info.topY + 0.16 : info.baseY + 0.48;
    for (let i = 0; i < n; i++) {
      const globalU = i / n;
      const boundary = shapeBoundaryPoint(tier.shape, tier.sizeCm + 0.18, globalU);
      const phase = (globalU * repeats) % 1;
      const envelope = Math.pow(Math.sin(Math.PI * phase), path.pattern === 'shell' ? 0.62 : 1.5);
      const scale = path.pattern === 'shell' ? base * (0.20 + 1.12 * envelope) : base * (0.10 + 1.05 * envelope);
      const lift = path.pattern === 'shell' ? 0.22 * envelope : 0.34 * envelope;
      pushSample(
        samples,
        [info.centerX + boundary[0], yBase + lift, info.centerZ + boundary[1]],
        scale,
        phase * Math.PI
      );
    }
    return samples;
  }

  if (path.pattern === 'rose') {
    const size = path.sizeCm ?? 2.9;
    const turns = path.turns ?? 2.7;
    const n = 82;
    const seed = path.seed ?? 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const theta = t * turns * Math.PI * 2 + seed;
      const r = Math.max(0.08, size * 0.52 * (1 - t));
      const petal = 0.84 + 0.20 * Math.sin(theta * 5.0 + seed);
      pushSample(
        samples,
        [cx + Math.cos(theta) * r, topY + 0.14 + t * size * 0.24, cz + Math.sin(theta) * r],
        base * petal * (1.04 - t * 0.18),
        theta * 0.8
      );
    }
    return samples;
  }

  if (path.pattern === 'star') {
    const size = path.sizeCm ?? 2.7;
    const n = 66;
    const seed = path.seed ?? 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const theta = t * Math.PI * 6 + seed;
      const r = Math.max(0.06, size * 0.43 * Math.pow(1 - t, 0.72));
      pushSample(
        samples,
        [cx + Math.cos(theta) * r, topY + 0.12 + t * size * 0.92, cz + Math.sin(theta) * r],
        base * (1.08 - 0.42 * t),
        theta
      );
    }
    return samples;
  }

  return samples;
}

export function volumeFromSamples(samples: PathSample[], nozzle: Nozzle): number {
  if (samples.length < 2) return 0;
  let volume = 0;
  const segmentCount = samples.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const a = samples[i];
    const b = samples[i + 1];
    const length = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
    const areaA = nozzle.areaCm2 * a.scale * a.scale;
    const areaB = nozzle.areaCm2 * b.scale * b.scale;
    volume += (length * (areaA + areaB)) / 2;
  }
  return volume;
}

export function closedPathVolume(samples: PathSample[], nozzle: Nozzle): number {
  if (samples.length < 3) return volumeFromSamples(samples, nozzle);
  let volume = volumeFromSamples(samples, nozzle);
  const a = samples[samples.length - 1];
  const b = samples[0];
  const length = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
  volume += (length * nozzle.areaCm2 * (a.scale * a.scale + b.scale * b.scale)) / 2;
  return volume;
}

export function computePathVolume(path: PipingPath, info?: TierStackInfo): number {
  const nozzle = getNozzle(path.nozzleId);
  const samples = buildPathSamples(path, info);
  return path.closed ? closedPathVolume(samples, nozzle) : volumeFromSamples(samples, nozzle);
}

interface PathDefaults {
  tierId: string;
  sequence: number;
  color: string;
  whip?: number;
  pressure?: number;
  speedCmS?: number;
}

export function createPipingPath(pattern: PipingPath['pattern'], nozzleId: string, init: PathDefaults & Partial<PipingPath>): PipingPath {
  const names: Record<PipingPath['pattern'], string> = {
    free: '手绘挤线',
    rose: '玫瑰花',
    shell: '贝壳边',
    star: '星星花',
    bead: '糖珠边'
  };
  const { tierId, sequence, color, ...rest } = init;
  return {
    id: uid('pipe'),
    tierId,
    sequence,
    color,
    name: names[pattern],
    nozzleId,
    pattern,
    surface: 'top',
    pressure: 0.72,
    speedCmS: 4,
    whip: 55,
    closed: pattern === 'shell' || pattern === 'bead',
    visible: true,
    ...rest
  };
}

export function makeRose(info: TierStackInfo, sequence: number, x?: number, z?: number, color = '#f2b8c6'): PipingPath {
  return createPipingPath('rose', 'petal-104', {
    tierId: info.tier.id,
    sequence,
    color,
    center: [x ?? info.centerX, z ?? info.centerZ],
    sizeCm: 2.7 + (Math.random() - 0.5) * 0.35,
    seed: Math.random() * Math.PI * 2,
    pressure: 0.76,
    whip: 62
  });
}

export function makeStar(info: TierStackInfo, sequence: number, x?: number, z?: number, color = '#fff1d6'): PipingPath {
  return createPipingPath('star', 'star-1m', {
    tierId: info.tier.id,
    sequence,
    color,
    center: [x ?? info.centerX, z ?? info.centerZ],
    sizeCm: 2.5 + (Math.random() - 0.5) * 0.3,
    seed: Math.random() * Math.PI * 2,
    pressure: 0.74,
    whip: 58
  });
}

export function makeBorder(info: TierStackInfo, sequence: number, kind: 'shell' | 'bead' = 'shell', surface: 'top-border' | 'bottom-border' = 'bottom-border', color = '#fff1d6'): PipingPath {
  return createPipingPath(kind, kind === 'shell' ? 'star-18' : 'round-12', {
    tierId: info.tier.id,
    sequence,
    surface,
    color,
    pressure: 0.7,
    speedCmS: 3.6,
    whip: 55
  });
}
