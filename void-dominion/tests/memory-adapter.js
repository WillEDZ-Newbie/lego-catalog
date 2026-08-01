// memory-adapter.js — in-memory persistence adapter implementing the same
// contract as the IndexedDB adapter, so the store can be unit-tested in Node.

export function createMemoryAdapter() {
  const stores = {};
  const meta = {};
  const ensure = (s) => { if (!stores[s]) stores[s] = new Map(); return stores[s]; };
  return {
    async init() { return this; },
    async getAll(store) { return Array.from(ensure(store).values()).map((v) => JSON.parse(JSON.stringify(v))); },
    async get(store, id) { const v = ensure(store).get(id); return v ? JSON.parse(JSON.stringify(v)) : undefined; },
    async put(store, record) { ensure(store).set(record.id, JSON.parse(JSON.stringify(record))); return record; },
    async bulkPut(store, records) { for (const r of records) ensure(store).set(r.id, JSON.parse(JSON.stringify(r))); return records; },
    async delete(store, id) { ensure(store).delete(id); },
    async clear(store) { ensure(store).clear(); },
    async getMeta(key) { return meta[key] ? JSON.parse(JSON.stringify(meta[key])) : undefined; },
    async setMeta(key, value) { meta[key] = JSON.parse(JSON.stringify(value)); return value; },
    async isEmpty() { return !stores.worlds || stores.worlds.size === 0; },
  };
}
