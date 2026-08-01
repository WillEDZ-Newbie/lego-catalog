// store.js — central state and mutation methods.
// The store is the single source of truth in memory, mirrored durably into
// IndexedDB via persistence.js. Views never mutate state directly; they call
// mutation methods, which persist and emit events.

import { bus } from './events.js';
import { generateId } from './validation.js';

const SEED_FILES = {
  system: 'data/system.json',
  locations: 'data/locations.json',
  worlds: 'data/worlds.json',
  objects: 'data/objects.json',
  sources: 'data/sources.json',
  activity: 'data/activity.json',
  chief: 'data/chief.json',
  settings: 'data/settings.json',
  safety: 'data/safety-policy.json'
};

export class Store {
  constructor(persistence, { basePath = '' } = {}) {
    this.p = persistence;
    this.basePath = basePath;
    this.bus = bus;
    this.state = {
      system: null,
      locations: [],
      worlds: [],
      objects: [],
      sources: [],
      activity: [],
      approvals: [],
      chief: null,
      settings: null,
      safetyPolicy: null
    };
    this.seededFresh = false;
  }

  async init() {
    // Has the database already been seeded?
    const metaSeeded = await this.p.get('meta', 'seeded');
    if (!metaSeeded) {
      await this._seed();
      await this.p.put('meta', { id: 'seeded', at: new Date().toISOString() });
      this.seededFresh = true;
    }
    await this._hydrate();
    bus.emit('store:ready', { durable: this.p.durable });
    return this;
  }

  async _fetchJson(path) {
    const res = await fetch(`${this.basePath}${path}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  async _seed() {
    const [system, locations, worlds, objects, sources, activity, chief, settings, safety] =
      await Promise.all(Object.values(SEED_FILES).map(f => this._fetchJson(f)));
    await this.p.putMany('system', [system]);
    await this.p.putMany('locations', locations);
    await this.p.putMany('worlds', worlds);
    await this.p.putMany('objects', objects);
    await this.p.putMany('sources', sources);
    await this.p.putMany('activity', activity);
    await this.p.putMany('chief', [chief]);
    await this.p.putMany('settings', [settings]);
    await this.p.putMany('safety', [safety]);
  }

  async _hydrate() {
    const [system, locations, worlds, objects, sources, activity, approvals, chief, settings, safety] =
      await Promise.all([
        this.p.getAll('system'), this.p.getAll('locations'), this.p.getAll('worlds'),
        this.p.getAll('objects'), this.p.getAll('sources'), this.p.getAll('activity'),
        this.p.getAll('approvals'), this.p.getAll('chief'), this.p.getAll('settings'),
        this.p.getAll('safety')
      ]);
    this.state.system = system[0] || null;
    this.state.locations = locations.sort((a, b) => (a.index || 0) - (b.index || 0));
    this.state.worlds = worlds;
    this.state.objects = objects;
    this.state.sources = sources;
    this.state.activity = activity.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
    this.state.approvals = approvals;
    this.state.chief = chief[0] || null;
    this.state.settings = settings[0] || null;
    this.state.safetyPolicy = safety[0] || null;
  }

  // ---- Getters ------------------------------------------------------------
  getSystem() { return this.state.system; }
  getLocations() { return this.state.locations; }
  getLocation(id) { return this.state.locations.find(l => l.id === id) || null; }
  getWorlds() { return this.state.worlds; }
  getWorld(id) { return this.state.worlds.find(w => w.id === id) || null; }
  getObjects() { return this.state.objects; }
  getObject(id) { return this.state.objects.find(o => o.id === id) || null; }
  getObjectsForWorld(worldId) { return this.state.objects.filter(o => o.worldId === worldId); }
  getSources() { return this.state.sources; }
  getSource(id) { return this.state.sources.find(s => s.id === id) || null; }
  getActivity() { return this.state.activity; }
  getApprovals() { return this.state.approvals; }
  getPendingApprovals() { return this.state.approvals.filter(a => a.status === 'pending'); }
  getChief() { return this.state.chief; }
  getSettings() { return this.state.settings; }
  getSafetyPolicy() { return this.state.safetyPolicy; }

  // ---- Mutations ----------------------------------------------------------
  async upsertWorld(world) {
    const now = new Date().toISOString();
    const existing = this.getWorld(world.id);
    const record = { schemaVersion: '1.0', ...existing, ...world, updatedAt: now };
    if (!existing) record.createdAt = now;
    await this.p.put('worlds', record);
    if (existing) {
      Object.assign(existing, record);
    } else {
      this.state.worlds.push(record);
    }
    bus.emit('state:changed', { entity: 'world', id: record.id });
    return record;
  }

  async upsertObject(object) {
    const now = new Date().toISOString();
    const existing = this.getObject(object.id);
    const record = { schemaVersion: '1.0', ...existing, ...object, updatedAt: now };
    if (!existing) record.createdAt = now;
    await this.p.put('objects', record);
    if (existing) {
      Object.assign(existing, record);
    } else {
      this.state.objects.push(record);
      const world = this.getWorld(record.worldId);
      if (world && !(world.objectIds || []).includes(record.id)) {
        world.objectIds = [...(world.objectIds || []), record.id];
        await this.p.put('worlds', world);
      }
    }
    bus.emit('state:changed', { entity: 'object', id: record.id });
    return record;
  }

  async removeObject(id) {
    await this.p.delete('objects', id);
    this.state.objects = this.state.objects.filter(o => o.id !== id);
    bus.emit('state:changed', { entity: 'object', id });
  }

  async removeWorld(id) {
    // Remove the World and its owned objects. Callers must have backed up and
    // passed the safety gate before invoking this.
    for (const o of this.getObjectsForWorld(id)) await this.removeObject(o.id);
    await this.p.delete('worlds', id);
    this.state.worlds = this.state.worlds.filter(w => w.id !== id);
    bus.emit('state:changed', { entity: 'world', id });
  }

  async upsertSource(source) {
    const existing = this.getSource(source.id);
    const record = { ...existing, ...source };
    await this.p.put('sources', record);
    if (existing) Object.assign(existing, record);
    else this.state.sources.push(record);
    bus.emit('state:changed', { entity: 'source', id: record.id });
    return record;
  }

  async addActivity(entry) {
    const record = {
      schemaVersion: '1.0',
      id: entry.id || generateId('activity'),
      actor: entry.actor || 'system',
      type: entry.type || 'system.event',
      entityType: entry.entityType || '',
      entityId: entry.entityId || '',
      summary: entry.summary || '',
      before: entry.before || {},
      after: entry.after || {},
      approvalId: entry.approvalId || null,
      result: entry.result || 'success',
      timestamp: new Date().toISOString()
    };
    await this.p.put('activity', record);
    this.state.activity.unshift(record);
    bus.emit('state:changed', { entity: 'activity', id: record.id });
    bus.emit('activity:added', record);
    return record;
  }

  async addApproval(approval) {
    const record = {
      schemaVersion: '1.0',
      id: approval.id || generateId('approval'),
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      rollbackAvailable: false,
      affectedEntities: [],
      before: {},
      proposedAfter: {},
      ...approval
    };
    await this.p.put('approvals', record);
    this.state.approvals.push(record);
    bus.emit('state:changed', { entity: 'approval', id: record.id });
    bus.emit('approval:added', record);
    return record;
  }

  async updateApproval(id, patch) {
    const existing = this.state.approvals.find(a => a.id === id);
    if (!existing) throw new Error(`No approval ${id}`);
    Object.assign(existing, patch);
    await this.p.put('approvals', existing);
    bus.emit('state:changed', { entity: 'approval', id });
    return existing;
  }

  async updateSettings(patch) {
    this.state.settings = { ...this.state.settings, ...patch };
    await this.p.put('settings', this.state.settings);
    bus.emit('state:changed', { entity: 'settings', id: 'settings' });
    bus.emit('settings:changed', this.state.settings);
    return this.state.settings;
  }

  async updateChief(patch) {
    this.state.chief = { ...this.state.chief, ...patch };
    await this.p.put('chief', this.state.chief);
    bus.emit('state:changed', { entity: 'chief', id: 'chief' });
    return this.state.chief;
  }

  // Full snapshot for export/backup.
  snapshot() {
    return {
      system: this.state.system,
      locations: this.state.locations,
      worlds: this.state.worlds,
      objects: this.state.objects,
      sources: this.state.sources,
      activity: this.state.activity,
      approvals: this.state.approvals,
      chief: this.state.chief,
      settings: this.state.settings,
      safetyPolicy: this.state.safetyPolicy
    };
  }

  // Replace all data (used by restore/import after validation).
  async replaceAll(data) {
    const map = {
      system: ['system', data.system ? [data.system] : []],
      locations: ['locations', data.locations || []],
      worlds: ['worlds', data.worlds || []],
      objects: ['objects', data.objects || []],
      sources: ['sources', data.sources || []],
      activity: ['activity', data.activity || []],
      approvals: ['approvals', data.approvals || []],
      chief: ['chief', data.chief ? [data.chief] : []],
      settings: ['settings', data.settings ? [data.settings] : []],
      safety: ['safety', data.safetyPolicy ? [data.safetyPolicy] : []]
    };
    for (const [store, [, records]] of Object.entries(map)) {
      await this.p.clear(store);
      await this.p.putMany(store, records);
    }
    await this._hydrate();
    bus.emit('state:replaced', {});
  }
}
