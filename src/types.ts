export type ID = string;
export type PageId = 'orders' | 'cake' | 'piping' | 'decorate' | 'preview' | 'settings';
export type CakeShape = 'round' | 'square' | 'heart';
export type CoatingMaterial = 'cream' | 'fondant' | 'glaze';
export type LightPreset = 'shop' | 'wedding';
export type EventType = 'wedding' | 'birthday' | 'party';

export interface Customer {
  name: string;
  phone?: string;
  note?: string;
}

export interface Order {
  id: ID;
  code: string;
  customer: Customer;
  eventType: EventType;
  eventDate: string;
  people: number;
  budget: number;
  status: 'consulting' | 'confirmed' | 'making' | 'delivered';
  createdAt: number;
  updatedAt: number;
}

export interface GlazeSettings {
  color: string;
  drips: number;
  dripLengthCm: number;
}

export interface Tier {
  id: ID;
  shape: CakeShape;
  sizeCm: number;
  heightCm: number;
  offsetXCm: number;
  offsetZCm: number;
  material: CoatingMaterial;
  color: string;
  whip: number;
  glaze: GlazeSettings;
}

export type NozzleKind = 'round' | 'star' | 'french' | 'petal' | 'leaf';
export type PatternKind = 'free' | 'rose' | 'shell' | 'star' | 'bead';
export type SurfaceKind = 'top' | 'top-border' | 'bottom-border';

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

export interface PathSample {
  p: Vec3;
  scale: number;
  twist: number;
}

export interface PipingPath {
  id: ID;
  tierId: ID;
  name: string;
  nozzleId: string;
  pattern: PatternKind;
  surface: SurfaceKind;
  color: string;
  pressure: number;
  speedCmS: number;
  whip: number;
  sequence: number;
  closed: boolean;
  points?: Vec3[];
  center?: Vec2;
  radiusCm?: number;
  sizeCm?: number;
  turns?: number;
  repeats?: number;
  seed?: number;
  visible: boolean;
}

export type DecorationType =
  | 'strawberry'
  | 'blueberry'
  | 'cherry'
  | 'chocolate-slab'
  | 'chocolate-chip'
  | 'pearl'
  | 'candle-number';

export interface Decoration {
  id: ID;
  tierId?: ID;
  type: DecorationType;
  x: number;
  z: number;
  rotation: number;
  scale: number;
  number?: number;
  color?: string;
}

export interface RenderSettings {
  renderScale: number;
  maxPixelRatio: number;
  autoRotate: boolean;
  showFps: boolean;
  shadows: boolean;
  grain: boolean;
}

export interface Design {
  id: ID;
  orderId: ID;
  name: string;
  proposalLabel: string;
  updatedAt: number;
  tiers: Tier[];
  paths: PipingPath[];
  decorations: Decoration[];
  light: LightPreset;
  settings: RenderSettings;
}

export interface AppSettings extends RenderSettings {
  densityCream: number;
  densityFondant: number;
  densityGlaze: number;
  autoSave: boolean;
}

export interface TierStackInfo {
  tier: Tier;
  index: number;
  baseY: number;
  topY: number;
  centerX: number;
  centerZ: number;
}

export interface MaterialRow {
  tierId: ID;
  label: string;
  shape: CakeShape;
  sizeCm: number;
  heightCm: number;
  serves: number;
  spongeVolumeCm3: number;
  spongeG: number;
  coatingName: string;
  coatingVolumeCm3: number;
  coatingG: number;
  pipingVolumeCm3: number;
  pipingG: number;
  pathCount: number;
  flowerCount: number;
  nozzles: string[];
}

export interface VolumeCheck {
  pathId: ID;
  name: string;
  analyticalCm3: number;
  integratedCm3: number;
  meshCm3?: number;
  errorPct: number;
}
