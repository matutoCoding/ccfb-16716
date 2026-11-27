import type { Vec2 } from '../types';

export function hexToRgb01(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n) || h.length !== 6) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgb01ToHex(r: number, g: number, b: number): string {
  const to = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb01(a);
  const cb = hexToRgb01(b);
  return rgb01ToHex(ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t);
}

/** 奶油打发程度越高，混入的微小气泡越多，视觉颜色越浅、饱和度略降。 */
export function whippedColor(hex: string, whip: number): string {
  const t = Math.max(0, Math.min(100, whip)) / 100;
  const lightened = mixHex(hex, '#fff8ee', 0.10 + t * 0.24);
  return mixHex(lightened, '#ffffff', t * 0.08);
}

export function polygonArea(points: Vec2[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(twice) * 0.5;
}

export function polygonPerimeter(points: Vec2[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
}
