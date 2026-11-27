import type { Vec2 } from '../types';
import { polygonArea } from '../lib/color';

export interface Nozzle {
  id: string;
  name: string;
  kind: 'round' | 'star' | 'french' | 'petal' | 'leaf';
  openingMm: number;
  teeth?: number;
  profile: Vec2[];
  areaCm2: number;
  description: string;
}

function circleProfile(radiusCm: number, segments = 18): Vec2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * radiusCm, Math.sin(a) * radiusCm] as Vec2;
  });
}

function starProfile(outerCm: number, innerRatio: number, teeth: number): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? outerCm : outerCm * innerRatio;
    const a = (i / (teeth * 2)) * Math.PI * 2 - Math.PI / 2;
    points.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return points;
}

function ellipseProfile(rx: number, ry: number, segments = 18): Vec2[] {
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return [Math.cos(a) * rx, Math.sin(a) * ry] as Vec2;
  });
}

function makeNozzle(
  id: string,
  name: string,
  kind: Nozzle['kind'],
  openingMm: number,
  profile: Vec2[],
  description: string,
  teeth?: number
): Nozzle {
  return { id, name, kind, openingMm, profile, areaCm2: polygonArea(profile), description, teeth };
}

export const NOZZLES: Nozzle[] = [
  makeNozzle('round-3', '圆口 #3', 'round', 3, circleProfile(0.15), '细线、写字、糖珠连接'),
  makeNozzle('round-12', '圆口 #12', 'round', 12, circleProfile(0.6), '奶油珠、夹馅、围边'),
  makeNozzle('star-18', '星星 #18', 'star', 18, starProfile(0.55, 0.42, 6), '小号星星花、贝壳边'),
  makeNozzle('star-1m', '星形 #1M', 'star', 25, starProfile(0.82, 0.48, 8), '经典螺旋星星、纸杯蛋糕'),
  makeNozzle('french-8b', '法式 #8B', 'french', 22, starProfile(0.72, 0.72, 10), '细密沟槽、复古花边', 10),
  makeNozzle('petal-104', '玫瑰花瓣 #104', 'petal', 18, ellipseProfile(0.72, 0.22), '玫瑰、花瓣、缎带'),
  makeNozzle('leaf-67', '叶子 #67', 'leaf', 16, ellipseProfile(0.58, 0.16), '叶片、褶皱边')
];

export const NOZZLE_MAP = new Map(NOZZLES.map((n) => [n.id, n]));

export function getNozzle(id: string): Nozzle {
  return NOZZLE_MAP.get(id) ?? NOZZLES[0];
}
