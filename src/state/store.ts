import type { AppSettings, Design, Order, PageId } from '../types';
import { db } from '../lib/db';
import { buildTestPlans } from '../data/presets';
import { createDesign, createOrder, DEFAULT_APP_SETTINGS } from '../data/defaults';
import { uid } from '../lib/util';
import { DEFAULT_DENSITIES } from '../lib/stats';

interface State {
  ready: boolean;
  route: PageId;
  orders: Order[];
  designs: Design[];
  currentOrderId: string | null;
  currentDesignId: string | null;
  designVersion: number;
  settings: AppSettings;
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
  lastSavedAt: number | null;
  toast: string | null;
}

type Listener = () => void;

const SETTINGS_KEY = 'gateau-settings-v1';
const SELECTION_KEY = 'gateau-selection-v1';

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_APP_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_APP_SETTINGS };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
}

class Store {
  state: State = {
    ready: false,
    route: 'orders',
    orders: [],
    designs: [],
    currentOrderId: null,
    currentDesignId: null,
    designVersion: 0,
    settings: loadSettings(),
    saveState: 'idle',
    lastSavedAt: null,
    toast: null
  };

  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;
  private toastTimer: number | null = null;

  constructor() {
    Object.assign(DEFAULT_DENSITIES, {
      cream: this.state.settings.densityCream,
      fondant: this.state.settings.densityFondant,
      glaze: this.state.settings.densityGlaze
    });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(): void {
    this.listeners.forEach((fn) => fn());
  }

  toast(message: string): void {
    this.state.toast = message;
    this.emit();
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.state.toast = null;
      this.emit();
    }, 2600);
  }

  async init(): Promise<void> {
    let orders = await db.getAllOrders();
    let designs = await db.getAllDesigns();
    if (orders.length === 0 || designs.length === 0) {
      const seed = buildTestPlans();
      orders = seed.orders;
      designs = seed.designs;
      await Promise.all([...orders.map((o) => db.putOrder(o)), ...designs.map((d) => db.putDesign(d))]);
    }
    this.state.orders = orders.sort((a, b) => b.updatedAt - a.updatedAt);
    this.state.designs = designs.sort((a, b) => b.updatedAt - a.updatedAt);

    let selection: { orderId?: string; designId?: string } = {};
    try {
      selection = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? '{}');
    } catch { /* ignore */ }
    this.state.currentOrderId = orders.find((o) => o.id === selection.orderId)?.id ?? orders[0]?.id ?? null;
    const orderDesigns = designs.filter((d) => d.orderId === this.state.currentOrderId);
    this.state.currentDesignId = orderDesigns.find((d) => d.id === selection.designId)?.id ?? orderDesigns[0]?.id ?? designs[0]?.id ?? null;
    this.state.ready = true;
    this.persistSelection();
    this.emit();
  }

  private persistSelection(): void {
    localStorage.setItem(SELECTION_KEY, JSON.stringify({ orderId: this.state.currentOrderId, designId: this.state.currentDesignId }));
  }

  get currentOrder(): Order | undefined {
    return this.state.orders.find((o) => o.id === this.state.currentOrderId);
  }

  get currentDesign(): Design | undefined {
    return this.state.designs.find((d) => d.id === this.state.currentDesignId);
  }

  designsForOrder(orderId: string | null | undefined): Design[] {
    if (!orderId) return [];
    return this.state.designs
      .filter((d) => d.orderId === orderId)
      .sort((a, b) => (a.proposalLabel < b.proposalLabel ? -1 : a.proposalLabel > b.proposalLabel ? 1 : 0));
  }

  setRoute(route: PageId): void {
    this.state.route = route;
    this.emit();
  }

  selectOrder(orderId: string): void {
    this.state.currentOrderId = orderId;
    const first = this.designsForOrder(orderId)[0];
    this.state.currentDesignId = first?.id ?? null;
    this.persistSelection();
    this.emit();
  }

  selectDesign(designId: string): void {
    const d = this.state.designs.find((x) => x.id === designId);
    if (!d) return;
    this.state.currentDesignId = designId;
    this.state.currentOrderId = d.orderId;
    this.persistSelection();
    this.emit();
  }

  async createOrderWithDesign(input?: Partial<Order>): Promise<{ order: Order; design: Design }> {
    const order = createOrder(input);
    const design = createDesign(order.id, { name: '主方案', proposalLabel: '方案 A' });
    this.state.orders.unshift(order);
    this.state.designs.unshift(design);
    this.state.currentOrderId = order.id;
    this.state.currentDesignId = design.id;
    this.persistSelection();
    await Promise.all([db.putOrder(order), db.putDesign(design)]);
    this.emit();
    return { order, design };
  }

  updateOrder(patch: Partial<Order>): void {
    const order = this.currentOrder;
    if (!order) return;
    Object.assign(order, patch, { updatedAt: Date.now() });
    this.state.orders.sort((a, b) => b.updatedAt - a.updatedAt);
    void db.putOrder(order);
    this.emit();
  }

  async removeOrder(id: string): Promise<void> {
    const designs = this.designsForOrder(id);
    await Promise.all([db.deleteOrder(id), ...designs.map((d) => db.deleteDesign(d.id))]);
    this.state.orders = this.state.orders.filter((o) => o.id !== id);
    this.state.designs = this.state.designs.filter((d) => d.orderId !== id);
    if (this.state.currentOrderId === id) {
      this.state.currentOrderId = this.state.orders[0]?.id ?? null;
      this.state.currentDesignId = this.designsForOrder(this.state.currentOrderId)[0]?.id ?? null;
    }
    this.persistSelection();
    this.emit();
  }

  createProposal(name?: string): Design | null {
    const order = this.currentOrder;
    if (!order) return null;
    const siblings = this.designsForOrder(order.id);
    const label = `方案 ${String.fromCharCode(65 + siblings.length)}`;
    const source = this.currentDesign;
    const design = source
      ? structuredClone(source)
      : createDesign(order.id);
    design.id = uid('des');
    design.orderId = order.id;
    design.proposalLabel = label;
    design.name = name ?? `${order.customer.name} · ${label}`;
    design.updatedAt = Date.now();
    this.state.designs.unshift(design);
    this.state.currentDesignId = design.id;
    this.persistSelection();
    void db.putDesign(design);
    this.emit();
    return design;
  }

  duplicateDesign(id: string): Design | null {
    const source = this.state.designs.find((d) => d.id === id);
    if (!source) return null;
    const copy = structuredClone(source);
    copy.id = uid('des');
    copy.name = `${source.name} 副本`;
    copy.proposalLabel = `方案 ${String.fromCharCode(65 + this.designsForOrder(source.orderId).length)}`;
    copy.updatedAt = Date.now();
    this.state.designs.unshift(copy);
    this.state.currentDesignId = copy.id;
    void db.putDesign(copy);
    this.emit();
    return copy;
  }

  async removeDesign(id: string): Promise<void> {
    const design = this.state.designs.find((d) => d.id === id);
    await db.deleteDesign(id);
    this.state.designs = this.state.designs.filter((d) => d.id !== id);
    if (this.state.currentDesignId === id) {
      this.state.currentDesignId = this.designsForOrder(design?.orderId)[0]?.id ?? null;
      this.persistSelection();
    }
    this.emit();
  }

  mutateDesign(mutator: (design: Design) => void, immediate = false): Design | undefined {
    const design = this.currentDesign;
    if (!design) return undefined;
    mutator(design);
    design.updatedAt = Date.now();
    this.state.designVersion++;
    this.state.saveState = 'dirty';
    this.emit();
    if (this.state.settings.autoSave && !immediate) this.scheduleSave(design);
    else void this.saveDesignNow();
    return design;
  }

  private scheduleSave(design: Design): void {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.state.saveState = 'dirty';
    this.saveTimer = window.setTimeout(() => void this.saveDesignNow(design), 450);
  }

  async saveDesignNow(design = this.currentDesign): Promise<void> {
    if (!design) return;
    this.state.saveState = 'saving';
    this.emit();
    try {
      await db.putDesign(design);
      this.state.saveState = 'saved';
      this.state.lastSavedAt = Date.now();
    } catch (err) {
      console.error(err);
      this.state.saveState = 'error';
      this.toast('保存到 IndexedDB 失败');
    }
    this.emit();
  }

  updateSettings(patch: Partial<AppSettings>): void {
    Object.assign(this.state.settings, patch);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.state.settings));
    Object.assign(DEFAULT_DENSITIES, {
      cream: this.state.settings.densityCream,
      fondant: this.state.settings.densityFondant,
      glaze: this.state.settings.densityGlaze
    });
    const d = this.currentDesign;
    if (d) {
      d.settings.renderScale = this.state.settings.renderScale;
      d.settings.maxPixelRatio = this.state.settings.maxPixelRatio;
      d.settings.autoRotate = this.state.settings.autoRotate;
      d.settings.showFps = this.state.settings.showFps;
      d.settings.shadows = this.state.settings.shadows;
      d.settings.grain = this.state.settings.grain;
      this.state.designVersion++;
      void db.putDesign(d);
    }
    this.emit();
  }

  async resetAndSeed(): Promise<void> {
    await db.clearAll();
    const seed = buildTestPlans();
    this.state.orders = seed.orders;
    this.state.designs = seed.designs;
    this.state.currentOrderId = seed.orders[0].id;
    this.state.currentDesignId = seed.designs[0].id;
    await Promise.all([...seed.orders.map((o) => db.putOrder(o)), ...seed.designs.map((d) => db.putDesign(d))]);
    this.persistSelection();
    this.emit();
  }
}

export const store = new Store();
