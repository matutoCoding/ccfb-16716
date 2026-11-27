import type { Decoration, Design, Order } from '../types';
import { createDesign, createOrder, createTier, DEFAULT_APP_SETTINGS } from './defaults';
import { uid, deepClone } from '../lib/util';
import { getTierStack } from '../lib/geometry';
import { addDefaultBorders, addRoseRing } from '../lib/flowerField';

function deco(partial: Partial<Decoration> & Pick<Decoration, 'type' | 'x' | 'z'>): Decoration {
  return { id: uid('dec'), rotation: 0, scale: 1, ...partial };
}

export interface SeedBundle {
  orders: Order[];
  designs: Design[];
}

export function buildTestPlans(): SeedBundle {
  // 方案 1：三层婚礼蛋糕，含两层客户备选方案。
  const weddingOrder = createOrder({
    code: 'GD-W261218',
    customer: { name: '林女士', phone: '138****2046', note: '婚礼主蛋糕，仪式区暖光，忌坚果' },
    eventType: 'wedding',
    eventDate: '2026-12-18',
    people: 96,
    budget: 6800,
    status: 'confirmed'
  });

  const wedding = createDesign(weddingOrder.id, {
    name: '纯白玫瑰三层婚礼蛋糕',
    proposalLabel: '方案 A · 纯白玫瑰',
    light: 'wedding',
    settings: { ...DEFAULT_APP_SETTINGS, renderScale: 0.9 }
  });
  wedding.tiers = [
    createTier({ shape: 'round', sizeCm: 30, heightCm: 12, material: 'fondant', color: '#f8f1e7', whip: 28 }),
    createTier({ shape: 'round', sizeCm: 23, heightCm: 11, material: 'cream', color: '#f4d7dc', whip: 58 }),
    createTier({ shape: 'round', sizeCm: 15, heightCm: 10, material: 'fondant', color: '#fff8ec', whip: 30 })
  ];
  addDefaultBorders(wedding);
  addRoseRing(wedding, 0, 14, 12.7, '#f3c1cd');
  addRoseRing(wedding, 1, 9, 9.4, '#f7d4dd');
  addRoseRing(wedding, 2, 6, 4.7, '#e99aaf');
  wedding.decorations.push(
    deco({ type: 'pearl', tierId: wedding.tiers[2].id, x: -2.2, z: 1.2, scale: 0.72, color: '#f7e7b5' }),
    deco({ type: 'pearl', tierId: wedding.tiers[2].id, x: 2.1, z: 1.0, scale: 0.72, color: '#f7e7b5' })
  );

  const weddingB = deepClone(wedding);
  weddingB.id = uid('des');
  weddingB.proposalLabel = '方案 B · 香槟轻奢';
  weddingB.name = '香槟金方形婚礼备选';
  weddingB.tiers = weddingB.tiers.map((t, i) => ({
    ...t,
    id: uid('tier'),
    shape: i === 1 ? 'square' : t.shape,
    color: i === 1 ? '#ead3aa' : '#fbf2df',
    material: i === 1 ? 'cream' : 'fondant'
  }));
  weddingB.paths = weddingB.paths.map((p) => ({ ...p, id: uid('pipe'), tierId: weddingB.tiers.find((_, idx) => idx === wedding.tiers.findIndex((t) => t.id === p.tierId))?.id ?? weddingB.tiers[0].id, color: '#e7c58d' }));
  weddingB.decorations = weddingB.decorations.map((d) => ({ ...d, id: uid('dec'), tierId: weddingB.tiers[2].id }));
  weddingB.light = 'shop';

  // 方案 2：镜面淋面慕斯。
  const mousseOrder = createOrder({
    code: 'GD-M261202',
    customer: { name: '甜屿研发室', phone: '', note: '测试镜面淋面滴落长度与水果摆盘' },
    eventType: 'party',
    eventDate: '2026-12-02',
    people: 10,
    budget: 680,
    status: 'consulting'
  });
  const mousse = createDesign(mousseOrder.id, {
    name: '勃艮第镜面淋面慕斯',
    proposalLabel: '方案 A · 莓果镜面',
    light: 'shop'
  });
  mousse.tiers = [
    createTier({
      shape: 'round',
      sizeCm: 20,
      heightCm: 9,
      material: 'glaze',
      color: '#c98a9b',
      whip: 20,
      glaze: { color: '#7b1030', drips: 15, dripLengthCm: 5.4 }
    })
  ];
  mousse.decorations = [
    deco({ type: 'strawberry', tierId: mousse.tiers[0].id, x: -4.2, z: -1.8, rotation: 0.4, scale: 1.05 }),
    deco({ type: 'strawberry', tierId: mousse.tiers[0].id, x: -1.5, z: -4.0, rotation: -0.5, scale: 0.95 }),
    deco({ type: 'strawberry', tierId: mousse.tiers[0].id, x: 3.8, z: -2.6, rotation: 1.1, scale: 1 }),
    deco({ type: 'blueberry', tierId: mousse.tiers[0].id, x: 1.2, z: -2.0, scale: 1 }),
    deco({ type: 'blueberry', tierId: mousse.tiers[0].id, x: 2.4, z: -0.8, scale: 0.9 }),
    deco({ type: 'blueberry', tierId: mousse.tiers[0].id, x: 0.4, z: -0.4, scale: 0.85 }),
    deco({ type: 'cherry', tierId: mousse.tiers[0].id, x: 4.6, z: 1.8, scale: 1.05 }),
    deco({ type: 'chocolate-slab', tierId: mousse.tiers[0].id, x: -0.8, z: 2.6, rotation: 0.7, scale: 1.1 }),
    deco({ type: 'chocolate-slab', tierId: mousse.tiers[0].id, x: 1.4, z: 2.9, rotation: -0.45, scale: 0.85 }),
    deco({ type: 'pearl', tierId: mousse.tiers[0].id, x: -3.0, z: 2.8, scale: 0.55, color: '#d8b45a' }),
    deco({ type: 'pearl', tierId: mousse.tiers[0].id, x: 3.0, z: 3.6, scale: 0.5, color: '#d8b45a' })
  ];

  // 方案 3：数字生日蛋糕。
  const birthdayOrder = createOrder({
    code: 'GD-B261128',
    customer: { name: '陈先生', phone: '139****7788', note: '30 岁生日，少糖，小朋友多' },
    eventType: 'birthday',
    eventDate: '2026-11-28',
    people: 30,
    budget: 1580,
    status: 'making'
  });
  const birthday = createDesign(birthdayOrder.id, {
    name: '数字蜡烛星星生日蛋糕',
    proposalLabel: '方案 A · 30 岁',
    light: 'shop'
  });
  birthday.tiers = [createTier({ shape: 'square', sizeCm: 28, heightCm: 11, material: 'cream', color: '#fff0c9', whip: 72 })];
  addDefaultBorders(birthday);
  const info = getTierStack(birthday.tiers)[0];
  const starPositions: Array<[number, number, string]> = [];
  for (let x = -10; x <= 10; x += 4) {
    for (let z = -10; z <= 10; z += 4) {
      if (Math.abs(x) < 4.5 && Math.abs(z) < 2.2) continue;
      if (Math.max(Math.abs(x), Math.abs(z)) > 12) continue;
      starPositions.push([x + ((x + z) % 2) * 0.5, z, ['#fff7df', '#f6a9bd', '#9cc7e6', '#c9df9a'][Math.abs(x + z) % 4]]);
    }
  }
  for (const [x, z, color] of starPositions) {
    const seq = birthday.paths.reduce((m, p) => Math.max(m, p.sequence), 0) + 1;
    birthday.paths.push({
      id: uid('pipe'), tierId: info.tier.id, name: '星星花', nozzleId: 'star-1m', pattern: 'star', surface: 'top',
      color, pressure: 0.76, speedCmS: 3.8, whip: 64, sequence: seq, closed: false, center: [info.centerX + x, info.centerZ + z],
      sizeCm: 2.25, seed: (x * 13 + z * 7) * 0.17, visible: true
    });
  }
  birthday.decorations.push(
    deco({ type: 'candle-number', tierId: birthday.tiers[0].id, x: -2.4, z: 0, number: 3, scale: 1.12, color: '#ef5b7a' }),
    deco({ type: 'candle-number', tierId: birthday.tiers[0].id, x: 2.8, z: 0, number: 0, scale: 1.12, color: '#5aa9e6' }),
    deco({ type: 'pearl', tierId: birthday.tiers[0].id, x: -9, z: 8, scale: 0.55, color: '#ef5b7a' }),
    deco({ type: 'pearl', tierId: birthday.tiers[0].id, x: -7.5, z: 8.5, scale: 0.45, color: '#5aa9e6' }),
    deco({ type: 'pearl', tierId: birthday.tiers[0].id, x: 8.5, z: -8, scale: 0.52, color: '#f4c542' }),
    deco({ type: 'chocolate-chip', tierId: birthday.tiers[0].id, x: 7, z: 6, rotation: 0.4, scale: 1 }),
    deco({ type: 'chocolate-chip', tierId: birthday.tiers[0].id, x: 8.4, z: 5.2, rotation: -0.2, scale: 0.9 })
  );

  const seedNow = Date.now();
  weddingOrder.createdAt = seedNow - 3000;
  weddingOrder.updatedAt = seedNow + 3000;
  birthdayOrder.createdAt = seedNow - 1000;
  birthdayOrder.updatedAt = seedNow + 2000;
  mousseOrder.createdAt = seedNow - 2000;
  mousseOrder.updatedAt = seedNow + 1000;

  return {
    orders: [weddingOrder, mousseOrder, birthdayOrder],
    designs: [wedding, weddingB, mousse, birthday]
  };
}
