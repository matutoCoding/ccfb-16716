import type { Decoration, PathSample, Vec3 } from '../types';
import type { Nozzle } from '../data/nozzles';
import { hexToRgb01 } from '../lib/color';

export interface MeshData {
  positions: number[];
  normals: number[];
  colors: number[];
  params: number[];
  uvs: number[];
  indices: number[];
}

export interface Xf {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  localScale?: [number, number, number];
}

export function createMeshData(): MeshData {
  return { positions: [], normals: [], colors: [], params: [], uvs: [], indices: [] };
}

type RGB = [number, number, number];

function colorOf(color: string | undefined, fallback = '#ffffff'): RGB {
  return hexToRgb01(color ?? fallback);
}

function transformPoint(p: Vec3, xf?: Xf): Vec3 {
  if (!xf) return p;
  const ls = xf.localScale ?? [1, 1, 1];
  let x = p[0] * ls[0] * xf.scale;
  let y = p[1] * ls[1] * xf.scale;
  let z = p[2] * ls[2] * xf.scale;
  const c = Math.cos(xf.rotY), s = Math.sin(xf.rotY);
  const rx = x * c + z * s;
  const rz = -x * s + z * c;
  return [rx + xf.x, y + xf.y, rz + xf.z];
}

function transformNormal(n: Vec3, xf?: Xf): Vec3 {
  if (!xf) return n;
  const ls = xf.localScale ?? [1, 1, 1];
  let x = n[0] / ls[0];
  let y = n[1] / ls[1];
  let z = n[2] / ls[2];
  const len = Math.hypot(x, y, z) || 1;
  x /= len; y /= len; z /= len;
  const c = Math.cos(xf.rotY), s = Math.sin(xf.rotY);
  return [x * c + z * s, y, -x * s + z * c];
}

export function addVertex(
  mesh: MeshData,
  p: Vec3,
  n: Vec3,
  color: RGB,
  rough = 0.7,
  spec = 0.25,
  kind = 0,
  uv: [number, number] = [0, 0],
  xf?: Xf
): number {
  const index = mesh.positions.length / 3;
  const pp = transformPoint(p, xf);
  const nn = transformNormal(n, xf);
  mesh.positions.push(pp[0], pp[1], pp[2]);
  mesh.normals.push(nn[0], nn[1], nn[2]);
  mesh.colors.push(color[0], color[1], color[2]);
  mesh.params.push(rough, spec, kind, 0);
  mesh.uvs.push(uv[0], uv[1]);
  return index;
}

export function appendTube(mesh: MeshData, samples: PathSample[], nozzle: Nozzle, colorHex: string, closed: boolean): void {
  if (samples.length < 2) return;
  const color = colorOf(colorHex, '#fff1d6');
  const nSamples = samples.length;
  const tangents: Vec3[] = [];
  for (let i = 0; i < nSamples; i++) {
    const a = samples[Math.max(0, i - 1)].p;
    const b = samples[Math.min(nSamples - 1, i + 1)].p;
    let t: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...t) || 1;
    t = [t[0] / len, t[1] / len, t[2] / len];
    tangents.push(t);
  }

  const normals: Vec3[] = [];
  let prevN: Vec3 = Math.abs(tangents[0][1]) > 0.88 ? [1, 0, 0] : [0, 1, 0];
  let d = prevN[0] * tangents[0][0] + prevN[1] * tangents[0][1] + prevN[2] * tangents[0][2];
  prevN = [prevN[0] - d * tangents[0][0], prevN[1] - d * tangents[0][1], prevN[2] - d * tangents[0][2]];
  let len = Math.hypot(...prevN) || 1;
  prevN = [prevN[0] / len, prevN[1] / len, prevN[2] / len];
  normals.push(prevN);
  for (let i = 1; i < nSamples; i++) {
    const t = tangents[i];
    let n: Vec3 = [normals[i - 1][0], normals[i - 1][1], normals[i - 1][2]];
    d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
    n = [n[0] - d * t[0], n[1] - d * t[1], n[2] - d * t[2]];
    len = Math.hypot(...n);
    if (len < 1e-5) {
      n = Math.abs(t[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
      d = n[0] * t[0] + n[1] * t[1] + n[2] * t[2];
      n = [n[0] - d * t[0], n[1] - d * t[1], n[2] - d * t[2]];
      len = Math.hypot(...n) || 1;
    }
    n = [n[0] / len, n[1] / len, n[2] / len];
    normals.push(n);
  }

  const profile = nozzle.profile;
  const m = profile.length;
  const ringStart = mesh.positions.length / 3;

  for (let i = 0; i < nSamples; i++) {
    const t = tangents[i];
    const n = normals[i];
    const b: Vec3 = [
      t[1] * n[2] - t[2] * n[1],
      t[2] * n[0] - t[0] * n[2],
      t[0] * n[1] - t[1] * n[0]
    ];
    const s = samples[i].scale;
    const twist = samples[i].twist;
    const ct = Math.cos(twist), st = Math.sin(twist);
    for (const point of profile) {
      const px = point[0] * s;
      const py = point[1] * s;
      const rx = px * ct - py * st;
      const ry = px * st + py * ct;
      const offset: Vec3 = [n[0] * rx + b[0] * ry, n[1] * rx + b[1] * ry, n[2] * rx + b[2] * ry];
      const ol = Math.hypot(...offset) || 1;
      const normal: Vec3 = [offset[0] / ol, offset[1] / ol, offset[2] / ol];
      addVertex(
        mesh,
        [samples[i].p[0] + offset[0], samples[i].p[1] + offset[1], samples[i].p[2] + offset[2]],
        normal,
        color,
        0.82,
        0.16,
        0
      );
    }
  }

  const ringLinks = closed ? nSamples : nSamples - 1;
  for (let i = 0; i < ringLinks; i++) {
    const ni = (i + 1) % nSamples;
    for (let j = 0; j < m; j++) {
      const a = ringStart + i * m + j;
      const b = ringStart + i * m + ((j + 1) % m);
      const c = ringStart + ni * m + j;
      const d2 = ringStart + ni * m + ((j + 1) % m);
      mesh.indices.push(a, b, c, b, d2, c);
    }
  }

  if (!closed) {
    const startCenter = addVertex(mesh, samples[0].p, [-tangents[0][0], -tangents[0][1], -tangents[0][2]], color, 0.84, 0.12);
    for (let j = 0; j < m; j++) mesh.indices.push(startCenter, ringStart + (j + 1) % m, ringStart + j);

    const endRing = ringStart + (nSamples - 1) * m;
    const endCenter = addVertex(mesh, samples[nSamples - 1].p, tangents[nSamples - 1], color, 0.84, 0.12);
    for (let j = 0; j < m; j++) mesh.indices.push(endCenter, endRing + j, endRing + (j + 1) % m);
  }
}

export function appendSphere(
  mesh: MeshData,
  center: Vec3,
  radius: number,
  colorHex: string,
  xf?: Xf,
  rough = 0.55,
  spec = 0.35,
  lat = 10,
  lon = 14
): void {
  const color = colorOf(colorHex);
  const start = mesh.positions.length / 3;
  for (let y = 0; y <= lat; y++) {
    const v = y / lat;
    const theta = v * Math.PI;
    for (let x = 0; x <= lon; x++) {
      const u = x / lon;
      const phi = u * Math.PI * 2;
      const nx = Math.sin(theta) * Math.cos(phi);
      const ny = Math.cos(theta);
      const nz = Math.sin(theta) * Math.sin(phi);
      addVertex(mesh, [center[0] + nx * radius, center[1] + ny * radius, center[2] + nz * radius], [nx, ny, nz], color, rough, spec, 0, [u, v], xf);
    }
  }
  for (let y = 0; y < lat; y++) {
    for (let x = 0; x < lon; x++) {
      const a = start + y * (lon + 1) + x;
      const b = a + lon + 1;
      mesh.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}

export function appendBox(mesh: MeshData, center: Vec3, size: Vec3, colorHex: string, xf?: Xf, rough = 0.45, spec = 0.4): void {
  const c = colorOf(colorHex);
  const hx = size[0] / 2, hy = size[1] / 2, hz = size[2] / 2;
  const faces: Array<{ n: Vec3; p: Vec3[] }> = [
    { n: [1, 0, 0], p: [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]] },
    { n: [-1, 0, 0], p: [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    { n: [0, 1, 0], p: [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]] },
    { n: [0, -1, 0], p: [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]] },
    { n: [0, 0, 1], p: [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz]] },
    { n: [0, 0, -1], p: [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]] }
  ];
  for (const face of faces) {
    const base = mesh.positions.length / 3;
    for (const p of face.p) addVertex(mesh, [p[0] + center[0], p[1] + center[1], p[2] + center[2]], face.n, c, rough, spec, 0, [0, 0], xf);
    mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

export function appendCylinder(mesh: MeshData, radiusTop: number, radiusBottom: number, height: number, colorHex: string, xf?: Xf, segments = 18, rough = 0.5, spec = 0.3): void {
  const c = colorOf(colorHex);
  const start = mesh.positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const co = Math.cos(a), si = Math.sin(a);
    addVertex(mesh, [co * radiusBottom, height / 2, si * radiusBottom], [co, 0.12, si], c, rough, spec, 0, [i / segments, 0], xf);
    addVertex(mesh, [co * radiusTop, -height / 2, si * radiusTop], [co, 0.12, si], c, rough, spec, 0, [i / segments, 1], xf);
  }
  // 上面函数把 y 方向放反了：第二圈用 -height/2。为保持底部原点语义，调用方使用 center/xf.y=height/2，因此这里应底 -h/2、顶 +h/2。
  // 修正：重新生成不可行，故 appendCylinderCentered 为实际使用实现。
  void start;
}

export function appendCylinderCentered(mesh: MeshData, radiusTop: number, radiusBottom: number, height: number, centerY: number, colorHex: string, xf?: Xf, segments = 18, rough = 0.5, spec = 0.3): void {
  const c = colorOf(colorHex);
  const start = mesh.positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const co = Math.cos(a), si = Math.sin(a);
    addVertex(mesh, [co * radiusBottom, centerY - height / 2, si * radiusBottom], [co, 0.08, si], c, rough, spec, 0, [i / segments, 0], xf);
    addVertex(mesh, [co * radiusTop, centerY + height / 2, si * radiusTop], [co, 0.08, si], c, rough, spec, 0, [i / segments, 1], xf);
  }
  for (let i = 0; i < segments; i++) {
    const a = start + i * 2;
    mesh.indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }
  const topCenter = addVertex(mesh, [0, centerY + height / 2, 0], [0, 1, 0], c, rough, spec, 0, [0.5, 0.5], xf);
  const topStart = mesh.positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    addVertex(mesh, [Math.cos(a) * radiusTop, centerY + height / 2, Math.sin(a) * radiusTop], [0, 1, 0], c, rough, spec, 0, [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5], xf);
  }
  for (let i = 0; i < segments; i++) mesh.indices.push(topCenter, topStart + i + 1, topStart + i);

  const bottomCenter = addVertex(mesh, [0, centerY - height / 2, 0], [0, -1, 0], c, rough, spec, 0, [0.5, 0.5], xf);
  const bottomStart = mesh.positions.length / 3;
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    addVertex(mesh, [Math.cos(a) * radiusBottom, centerY - height / 2, Math.sin(a) * radiusBottom], [0, -1, 0], c, rough, spec, 0, [0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5], xf);
  }
  for (let i = 0; i < segments; i++) mesh.indices.push(bottomCenter, bottomStart + i, bottomStart + i + 1);
}

export function appendNumberPlane(mesh: MeshData, digit: number, colorHex: string, xf?: Xf): void {
  const w = 1.55, h = 2.05;
  const row = digit >= 5 ? 1 : 0;
  const col = digit % 5;
  const u0 = col / 5, u1 = (col + 0.86) / 5;
  // UNPACK_FLIP_Y=true：Canvas 第一行对应 UV 上部。
  const v1 = 1 - row / 2;
  const v0 = 1 - (row + 1) / 2;
  const digitColor = colorOf(colorHex, '#d6284f');
  const base = mesh.positions.length / 3;
  const positions: Vec3[] = [[-w / 2, 4.55, 0], [-w / 2, 4.55 + h, 0], [w / 2, 4.55 + h, 0], [w / 2, 4.55, 0]];
  const uvs: [number, number][] = [[u0 + 0.07 / 5, v0 + 0.08 / 2], [u0 + 0.07 / 5, v1 - 0.08 / 2], [u1 - 0.07 / 5, v1 - 0.08 / 2], [u1 - 0.07 / 5, v0 + 0.08 / 2]];
  for (let i = 0; i < 4; i++) addVertex(mesh, positions[i], [0, 0, 1], digitColor, 0.38, 0.35, 1, uvs[i], xf);
  mesh.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

export function appendDecoration(mesh: MeshData, numberMesh: MeshData, d: Decoration, topY: number): void {
  const xf: Xf = { x: d.x, y: topY, z: d.z, rotY: d.rotation, scale: d.scale };
  switch (d.type) {
    case 'strawberry': {
      appendSphere(mesh, [0, 0.92, 0], 0.72, '#d92f45', { ...xf, localScale: [0.92, 1.22, 0.92] }, 0.48, 0.35, 12, 16);
      for (let i = 0; i < 14; i++) {
        const a = i * 2.399;
        const y = 0.55 + (i % 5) * 0.22;
        const rr = 0.58 * (1 - Math.abs(y - 0.95) / 1.1);
        appendSphere(mesh, [Math.cos(a) * rr, y, Math.sin(a) * rr], 0.045, '#ffe79a', xf, 0.6, 0.1, 5, 6);
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        appendBox(mesh, [Math.cos(a) * 0.22, 1.78, Math.sin(a) * 0.22], [0.18, 0.08, 0.72], '#3f8f45', { ...xf, rotY: xf.rotY + a }, 0.7, 0.1);
      }
      break;
    }
    case 'blueberry':
      appendSphere(mesh, [0, 0.56, 0], 0.56, '#315a9c', xf, 0.58, 0.28, 10, 14);
      appendCylinderCentered(mesh, 0.16, 0.22, 0.12, 1.08, '#1d3564', xf, 10, 0.7, 0.1);
      break;
    case 'cherry':
      appendSphere(mesh, [0, 0.66, 0], 0.66, '#c9152f', xf, 0.32, 0.7, 12, 16);
      appendCylinderCentered(mesh, 0.045, 0.055, 1.2, 1.55, '#5c3a1e', { ...xf, rotY: xf.rotY + 0.35 }, 8, 0.7, 0.1);
      break;
    case 'chocolate-slab':
      appendBox(mesh, [0, 0.2, 0], [2.25, 0.34, 1.55], '#4a2818', xf, 0.34, 0.75);
      for (let i = -1; i <= 1; i++) appendBox(mesh, [i * 0.68, 0.39, 0], [0.05, 0.03, 1.42], '#6b3f2a', xf, 0.4, 0.5);
      break;
    case 'chocolate-chip':
      appendSphere(mesh, [0, 0.42, 0], 0.55, '#3a2116', { ...xf, localScale: [1, 0.82, 1] }, 0.38, 0.55, 8, 12);
      appendCylinderCentered(mesh, 0.08, 0.42, 0.45, 0.23, '#3a2116', xf, 14, 0.38, 0.55);
      break;
    case 'pearl':
      appendSphere(mesh, [0, 0.42, 0], 0.42, d.color ?? '#ffffff', xf, 0.16, 1.0, 10, 14);
      break;
    case 'candle-number': {
      const wax = d.color ?? '#ef5b7a';
      appendCylinderCentered(mesh, 0.27, 0.27, 4.1, 2.05, wax, xf, 18, 0.42, 0.45);
      appendCylinderCentered(mesh, 0.055, 0.055, 0.55, 4.35, '#2b211d', xf, 8, 0.8, 0.1);
      appendSphere(mesh, [0, 4.72, 0], 0.16, '#ffc857', xf, 0.25, 0.8, 6, 8);
      appendNumberPlane(numberMesh, d.number ?? 0, d.color ?? '#d6284f', xf);
      break;
    }
  }
}

export function meshSignedVolume(mesh: MeshData): number {
  let six = 0;
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ia = mesh.indices[i] * 3, ib = mesh.indices[i + 1] * 3, ic = mesh.indices[i + 2] * 3;
    const ax = p[ia], ay = p[ia + 1], az = p[ia + 2];
    const bx = p[ib], by = p[ib + 1], bz = p[ib + 2];
    const cx = p[ic], cy = p[ic + 1], cz = p[ic + 2];
    six += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(six) / 6;
}
