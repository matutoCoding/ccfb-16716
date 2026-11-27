import type { Design } from '../types';
import { getTierStack } from '../lib/geometry';
import { buildPathSamples } from '../lib/piping';
import { getNozzle } from '../data/nozzles';
import { whippedColor } from '../lib/color';
import { appendDecoration, appendTube, createMeshData, type MeshData } from './meshData';

export interface DesignMeshes {
  piping: MeshData;
  decorations: MeshData;
  numbers: MeshData;
  triangleCount: number;
  vertexCount: number;
}

export function buildDesignMeshes(design: Design): DesignMeshes {
  const piping = createMeshData();
  const decorations = createMeshData();
  const numbers = createMeshData();
  const stack = getTierStack(design.tiers);

  for (const path of design.paths) {
    if (!path.visible) continue;
    const info = stack.find((t) => t.tier.id === path.tierId);
    if (!info) continue;
    const nozzle = getNozzle(path.nozzleId);
    const samples = buildPathSamples(path, info);
    appendTube(piping, samples, nozzle, whippedColor(path.color, path.whip), path.closed);
  }

  for (const dec of design.decorations) {
    const info = stack.find((t) => t.tier.id === dec.tierId);
    appendDecoration(decorations, numbers, dec, info?.topY ?? 0);
  }

  const triangleCount = (piping.indices.length + decorations.indices.length + numbers.indices.length) / 3;
  const vertexCount = (piping.positions.length + decorations.positions.length + numbers.positions.length) / 3;
  return { piping, decorations, numbers, triangleCount, vertexCount };
}
