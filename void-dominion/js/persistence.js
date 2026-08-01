// persistence.js — durable metadata storage.
// IndexedDB is the primary durable store for Atlas metadata and app data.
// localStorage is reserved for tiny UI preferences only (handled in app.js).
//
// This module exposes an adapter with a small, storage-agnostic contract so
// the central store can be tested against an in-memory adapter (see tests/).

export const DB_NAME = 'void-dominion';
export const DB_VERSION = 1;

// Collections persisted as arrays of records keyed by `id`.
export const STORES = ['worlds', 'rooms', 'objects', 'activity', 'approvals', 'sources', 'chiefJobs', 'backups'];
// Single-document collections stored in a key/value "meta" store.
export const META_KEYS = ['system', 'settings', 'chief', 'safetyPolicy', 'locations', 'schemaMeta'];

// In-memory adapter implementing the same contract. Used as a graceful
// fallback when IndexedDB is unavailable (e.g. some file:// contexts) and by
// the test suite. Data does not persist across reloads in this mode.
export function createMemoryAdapter() {
  const stores = {};
  const meta = {};
  const ensure = (s) => { if (!stores[s]) stores[s] = new Map(); return stores[s]; };
  const copy = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  return {
    async init() { return this; },
    async getAll(store) { return Array.from(ensure(store).values()).map(copy); },
    async get(store, id) { return copy(ensure(store).get(id)); },
    async put(store, record) { ensure(store).set(record.id, copy(record)); return record; },
    async bulkPut(store, records) { for (const r of records) ensure(store).set(r.id, copy(r)); return records; },
    async delete(store, id) { ensure(store).delete(id); },
    async clear(store) { ensure(store).clear(); },
    async getMeta(key) { return copy(meta[key]); },
    async setMeta(key, value) { meta[key] = copy(value); return value; },
    async isEmpty() { return !stores.worlds || stores.worlds.size === 0; },
  };
}

// Create the IndexedDB-backed adapter (browser only).
export function createIndexedDBAdapter() {
  let db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const store of STORES) {
          if (!d.objectStoreNames.contains(store)) {
            d.createObjectStore(store, { keyPath: 'id' });
          }
        }
        if (!d.objectStoreNames.contains('meta')) {
          d.createObjectStore('meta', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(store, mode) {
    return db.transaction(store, mode).objectStore(store);
  }

  function toPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  return {
    async init() {
      db = await open();
      return this;
    },
    async getAll(store) {
      return toPromise(tx(store, 'readonly').getAll());
    },
    async get(store, id) {
      return toPromise(tx(store, 'readonly').get(id));
    },
    async put(store, record) {
      await toPromise(tx(store, 'readwrite').put(record));
      return record;
    },
    async bulkPut(store, records) {
      const os = tx(store, 'readwrite');
      await Promise.all(records.map((r) => toPromise(os.put(r))));
      return records;
    },
    async delete(store, id) {
      return toPromise(tx(store, 'readwrite').delete(id));
    },
    async clear(store) {
      return toPromise(tx(store, 'readwrite').clear());
    },
    async getMeta(key) {
      const row = await toPromise(tx('meta', 'readonly').get(key));
      return row ? row.value : undefined;
    },
    async setMeta(key, value) {
      await toPromise(tx('meta', 'readwrite').put({ key, value }));
      return value;
    },
    async isEmpty() {
      const worlds = await this.getAll('worlds');
      return !worlds || worlds.length === 0;
    },
  };
}
