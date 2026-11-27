import type { Design, Order } from '../types';

const DB_NAME = 'gateau-studio';
const DB_VERSION = 1;
const STORES = ['orders', 'designs', 'kv'] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('orders')) db.createObjectStore('orders', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('designs')) {
        const store = db.createObjectStore('designs', { keyPath: 'id' });
        store.createIndex('orderId', 'orderId', { unique: false });
      }
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(storeName: (typeof STORES)[number], mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = run(store);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export const db = {
  async getAllOrders(): Promise<Order[]> {
    return tx<Order[]>('orders', 'readonly', (s) => s.getAll() as IDBRequest<Order[]>);
  },
  async putOrder(order: Order): Promise<IDBValidKey> {
    return tx('orders', 'readwrite', (s) => s.put(order));
  },
  async deleteOrder(id: string): Promise<undefined> {
    await tx('orders', 'readwrite', (s) => s.delete(id));
  },
  async getAllDesigns(): Promise<Design[]> {
    return tx<Design[]>('designs', 'readonly', (s) => s.getAll() as IDBRequest<Design[]>);
  },
  async putDesign(design: Design): Promise<IDBValidKey> {
    return tx('designs', 'readwrite', (s) => s.put(design));
  },
  async deleteDesign(id: string): Promise<undefined> {
    await tx('designs', 'readwrite', (s) => s.delete(id));
  },
  async getKv<T>(key: string): Promise<T | undefined> {
    const row = await tx<{ key: string; value: T } | undefined>('kv', 'readonly', (s) => s.get(key));
    return row?.value;
  },
  async setKv(key: string, value: unknown): Promise<IDBValidKey> {
    return tx('kv', 'readwrite', (s) => s.put({ key, value }));
  },
  async clearAll(): Promise<void> {
    const database = await openDb();
    await Promise.all(
      STORES.map(
        (name) =>
          new Promise<void>((resolve, reject) => {
            const req = database.transaction(name, 'readwrite').objectStore(name).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          })
      )
    );
  }
};
