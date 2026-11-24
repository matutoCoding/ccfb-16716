// IndexedDB 封装：订单 / 方案 / 设置三个仓库
import type { AppSettings, CakeDesign, Order } from '../model/types.ts'
import { DEFAULT_SETTINGS } from './materials.ts'

const DB_NAME = 'cake-studio'
const DB_VERSION = 1

type StoreName = 'orders' | 'designs' | 'settings'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('designs')) db.createObjectStore('designs', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function tx<T>(
  db: IDBDatabase,
  store: StoreName,
  mode: IDBTransactionMode,
  run: (objectStore: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const objectStore = db.transaction(store, mode).objectStore(store)
    const request = run(objectStore)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb()
  try {
    return await tx<T[]>(db, store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
  } finally {
    db.close()
  }
}

async function put<T>(store: StoreName, value: T, key?: IDBValidKey): Promise<void> {
  const db = await openDb()
  try {
    await tx(db, store, 'readwrite', (s) => s.put(value, key))
  } finally {
    db.close()
  }
}

async function remove(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb()
  try {
    await tx(db, store, 'readwrite', (s) => s.delete(key))
  } finally {
    db.close()
  }
}

export const orderStore = {
  list: (): Promise<Order[]> => getAll<Order>('orders'),
  save: (order: Order): Promise<void> => put('orders', order),
  remove: (id: string): Promise<void> => remove('orders', id)
}

export const designStore = {
  list: (): Promise<CakeDesign[]> => getAll<CakeDesign>('designs'),
  save: (design: CakeDesign): Promise<void> => put('designs', design),
  remove: (id: string): Promise<void> => remove('designs', id)
}

const SETTINGS_KEY = 'app'

export const settingsStore = {
  async load(): Promise<AppSettings> {
    const db = await openDb()
    try {
      const value = await tx<AppSettings | undefined>(db, 'settings', 'readonly', (s) =>
        s.get(SETTINGS_KEY)
      )
      return value ?? { ...DEFAULT_SETTINGS }
    } finally {
      db.close()
    }
  },
  save: (settings: AppSettings): Promise<void> => put('settings', settings, SETTINGS_KEY)
}
