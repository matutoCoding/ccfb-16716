import type { AppSettings, Design, Order, Tier } from '../types';
import { uid } from '../lib/util';

export const DEFAULT_APP_SETTINGS: AppSettings = {
  renderScale: 0.85,
  maxPixelRatio: 1.5,
  autoRotate: false,
  showFps: true,
  shadows: true,
  grain: true,
  densityCream: 1.08,
  densityFondant: 1.18,
  densityGlaze: 1.22,
  autoSave: true
};

export function createTier(partial: Partial<Tier> = {}): Tier {
  return {
    id: uid('tier'),
    shape: 'round',
    sizeCm: 18,
    heightCm: 10,
    offsetXCm: 0,
    offsetZCm: 0,
    material: 'cream',
    color: '#fff1d6',
    whip: 55,
    glaze: { color: '#7b1e3a', drips: 12, dripLengthCm: 4.5 },
    ...partial
  };
}

export function createOrder(partial: Partial<Order> = {}): Order {
  const now = Date.now();
  return {
    id: uid('ord'),
    code: `GD-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(now).slice(-4)}`,
    customer: { name: '新客户', phone: '', note: '' },
    eventType: 'birthday',
    eventDate: new Date(now + 7 * 86400000).toISOString().slice(0, 10),
    people: 12,
    budget: 800,
    status: 'consulting',
    createdAt: now,
    updatedAt: now,
    ...partial
  };
}

export function createDesign(orderId: string, partial: Partial<Design> = {}): Design {
  const now = Date.now();
  return {
    id: uid('des'),
    orderId,
    name: '新方案',
    proposalLabel: '方案 A',
    updatedAt: now,
    tiers: [createTier()],
    paths: [],
    decorations: [],
    light: 'shop',
    settings: { ...DEFAULT_APP_SETTINGS },
    ...partial
  };
}
