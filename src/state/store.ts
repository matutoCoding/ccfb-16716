// 全局状态仓库：轻量发布订阅 + 持久化
import type { AppSettings, CakeDesign, Order } from '../model/types.ts'
import { uid, clone } from './math3d.ts'
import { designStore, orderStore, settingsStore } from './storage.ts'

export interface AppState {
  orders: Order[]
  designs: CakeDesign[]
  settings: AppSettings
  // 当前工作上下文
  currentOrderId: string | null
  currentDesignId: string | null
}

type Listener = (state: AppState) => void

class Store {
  private state: AppState = {
    orders: [],
    designs: [],
    settings: {
      creamDensity: 0.45,
      fondantDensity: 1.25,
      glazeDensity: 1.1,
      renderScale: 1,
      targetFps: 30
    },
    currentOrderId: null,
    currentDesignId: null
  }

  private listeners = new Set<Listener>()

  getState(): AppState {
    return this.state
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.state)
  }

  private patch(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial }
    this.emit()
  }

  async hydrate(): Promise<void> {
    const [orders, designs, settings] = await Promise.all([
      orderStore.list(),
      designStore.list(),
      settingsStore.load()
    ])
    this.patch({
      orders: orders.sort((a, b) => b.createdAt - a.createdAt),
      designs: designs.sort((a, b) => b.updatedAt - a.updatedAt),
      settings
    })
  }

  // ---- 订单 ----
  async saveOrder(order: Order): Promise<void> {
    const exists = this.state.orders.some((item) => item.id === order.id)
    const next = exists
      ? this.state.orders.map((item) => (item.id === order.id ? order : item))
      : [order, ...this.state.orders]
    this.patch({ orders: next })
    await orderStore.save(order)
  }

  async removeOrder(id: string): Promise<void> {
    const order = this.state.orders.find((item) => item.id === id)
    this.patch({
      orders: this.state.orders.filter((item) => item.id !== id),
      designs: this.state.designs.filter((item) => !order?.designIds.includes(item.id)),
      currentOrderId: this.state.currentOrderId === id ? null : this.state.currentOrderId
    })
    if (order) await Promise.all(order.designIds.map((designId) => designStore.remove(designId)))
    await orderStore.remove(id)
  }

  setCurrent(orderId: string | null, designId: string | null): void {
    this.patch({ currentOrderId: orderId, currentDesignId: designId })
  }

  // ---- 方案 ----
  async saveDesign(design: CakeDesign): Promise<void> {
    const stamped: CakeDesign = { ...clone(design), updatedAt: Date.now() }
    const exists = this.state.designs.some((item) => item.id === design.id)
    const next = exists
      ? this.state.designs.map((item) => (item.id === design.id ? stamped : item))
      : [stamped, ...this.state.designs]
    this.patch({ designs: next })
    await designStore.save(stamped)
    // 反向登记到订单
    const order = this.state.orders.find((item) => item.designIds.includes(design.id))
    if (order) await this.saveOrder({ ...order })
  }

  async createDesign(orderId: string, name: string): Promise<CakeDesign> {
    const now = Date.now()
    const design: CakeDesign = {
      id: uid(),
      name,
      layers: [],
      paths: [],
      decorations: [],
      lighting: 'shop',
      createdAt: now,
      updatedAt: now
    }
    await this.saveDesign(design)
    const order = this.state.orders.find((item) => item.id === orderId)
    if (order) {
      await this.saveOrder({ ...order, designIds: [...order.designIds, design.id] })
    }
    this.patch({ currentOrderId: orderId, currentDesignId: design.id })
    return design
  }

  async removeDesign(id: string): Promise<void> {
    this.patch({
      designs: this.state.designs.filter((item) => item.id !== id),
      currentDesignId: this.state.currentDesignId === id ? null : this.state.currentDesignId
    })
    const order = this.state.orders.find((item) => item.designIds.includes(id))
    if (order) {
      await this.saveOrder({
        ...order,
        designIds: order.designIds.filter((designId) => designId !== id)
      })
    }
    await designStore.remove(id)
  }

  // ---- 设置 ----
  async saveSettings(settings: AppSettings): Promise<void> {
    this.patch({ settings })
    await settingsStore.save(settings)
  }
}

export const store = new Store()
