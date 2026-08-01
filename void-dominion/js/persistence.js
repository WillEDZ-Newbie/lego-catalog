// persistence.js — durable metadata store.
// IndexedDB is the source of truth for Atlas metadata after first seed.
// Falls back to an in-memory store when IndexedDB is unavailable (e.g. some
// private-mode contexts) so the app still runs, clearly flagged as ephemeral.

const DB_NAME = 'void-dominion';
const DB_VERSION = 1;
export const STORES = [
  'system', 'locations', 'worlds', 'objects', 'sources',
  'activity', 'approvals', 'chief', 'settings', 'safety', 'meta'
];

export class Persistence {
  constructor() {
    this.db = null;
    this.durable = false;
    this._memory = new Map(); // store -> Map(id -> record)
  }

  async open() {
    if (typeof indexedDB === 'undefined') {
      this._initMemory();
      this.durable = false;
      return this;
    }
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of STORES) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: 'id' });
            }
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.durable = true;
    } catch (err) {
      console.warn('[persistence] IndexedDB unavailable, using in-memory store', err);
      this._initMemory();
      this.durable = false;
    }
    return this;
  }

  _initMemory() {
    for (const name of STORES) this._memory.set(name, new Map());
  }

  _tx(store, mode) {
    return this.db.transaction(store, mode).objectStore(store);
  }

  async getAll(store) {
    if (!this.durable) return [...(this._memory.get(store)?.values() || [])];
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readonly').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async get(store, id) {
    if (!this.durable) return this._memory.get(store)?.get(id) || null;
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readonly').get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async put(store, record) {
    if (!record || !record.id) throw new Error(`[persistence] record for "${store}" needs an id`);
    if (!this.durable) {
      this._memory.get(store).set(record.id, record);
      return record;
    }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  async putMany(store, records) {
    for (const r of records) await this.put(store, r);
    return records;
  }

  async delete(store, id) {
    if (!this.durable) {
      this._memory.get(store).delete(id);
      return;
    }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(store) {
    if (!this.durable) {
      this._memory.get(store).clear();
      return;
    }
    return new Promise((resolve, reject) => {
      const req = this._tx(store, 'readwrite').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async count(store) {
    return (await this.getAll(store)).length;
  }
}
