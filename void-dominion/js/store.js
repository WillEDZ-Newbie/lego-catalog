// store.js — central state and mutation methods.
// All meaningful mutations flow through proposeAction(), which:
//   1. classifies risk via the safety evaluator,
//   2. denies unsupported/unverifiable actions,
//   3. routes consequential/destructive actions to the approval queue,
//   4. executes allowed actions, persists them, and logs an audit record.
//
// The store is storage-agnostic: it receives a persistence adapter in init()
// so it can run against IndexedDB (browser) or an in-memory adapter (tests).

import { emit } from './events.js';
import { makeActivity } from './activity.js';
import { validateEntity } from './validation.js';
import { evaluate, DECISIONS, buildApprovalRequest } from './safety.js';
import { makeId, now, clone } from './util.js';

const state = {
  system: null,
  settings: null,
  safetyPolicy: null,
  locations: [],
  worlds: [],
  rooms: [],
  objects: [],
  sources: [],
  activity: [],
  approvals: [],
  chiefJobs: [],
  chief: null,
  conflicts: [],
  backups: [],
  ready: false,
};

let db = null;

export function getState() {
  return state;
}

// ---- collection helpers -------------------------------------------------

const COLLECTION_BY_ENTITY = {
  world: 'worlds',
  object: 'objects',
  room: 'rooms',
  source: 'sources',
};

function find(collection, id) {
  return state[collection].find((r) => r.id === id);
}

async function upsertRecord(collection, record) {
  const idx = state[collection].findIndex((r) => r.id === record.id);
  if (idx >= 0) state[collection][idx] = record;
  else state[collection].push(record);
  if (db) await db.put(collection, clone(record));
  return record;
}

async function removeRecord(collection, id) {
  const idx = state[collection].findIndex((r) => r.id === id);
  const removed = idx >= 0 ? state[collection][idx] : null;
  if (idx >= 0) state[collection].splice(idx, 1);
  if (db) await db.delete(collection, id);
  return removed;
}

// Build the provider state map the safety evaluator uses.
function providerState() {
  const map = {};
  for (const p of (state.settings && state.settings.providers) || []) {
    map[p.providerId] = { status: p.status, capabilities: p.capabilities || {} };
  }
  return map;
}

// ---- executors ----------------------------------------------------------
// Each executor applies a persisted action descriptor and returns
// { entity, before, after }. No functions are stored on the action, so an
// approved action can be replayed later from the persisted approval record.

const executors = {
  'world.create': async (a) => {
    const entity = a.payload;
    await upsertRecord('worlds', entity);
    return { entity, before: {}, after: clone(entity) };
  },
  'world.update': async (a) => patchEntity('world', a.entityId, a.payload),
  'world.archive': async (a) => patchEntity('world', a.entityId, { status: 'archived' }),
  'world.restore': async (a) => patchEntity('world', a.entityId, { status: 'active' }),
  'world.delete': async (a) => {
    const before = clone(find('worlds', a.entityId));
    const removed = await removeRecord('worlds', a.entityId);
    return { entity: removed, before, after: {} };
  },
  'object.create': async (a) => {
    await upsertRecord('objects', a.payload);
    return { entity: a.payload, before: {}, after: clone(a.payload) };
  },
  'object.update': async (a) => patchEntity('object', a.entityId, a.payload),
  'object.archive': async (a) => patchEntity('object', a.entityId, { stage: 'superseded' }),
  'object.delete': async (a) => {
    const before = clone(find('objects', a.entityId));
    const removed = await removeRecord('objects', a.entityId);
    return { entity: removed, before, after: {} };
  },
  'room.create': async (a) => {
    await upsertRecord('rooms', a.payload);
    // Link into world.roomIds
    const world = find('worlds', a.payload.worldId);
    if (world && !world.roomIds.includes(a.payload.id)) {
      world.roomIds = [...world.roomIds, a.payload.id];
      await upsertRecord('worlds', world);
    }
    return { entity: a.payload, before: {}, after: clone(a.payload) };
  },
  'room.update': async (a) => patchEntity('room', a.entityId, a.payload),
  'room.delete': async (a) => {
    const before = clone(find('rooms', a.entityId));
    const removed = await removeRecord('rooms', a.entityId);
    return { entity: removed, before, after: {} };
  },
  'canon.change': async (a) => {
    const world = find('worlds', a.entityId);
    const before = clone(world.canon);
    const item = a.payload;
    const idx = world.canon.findIndex((c) => c.id === item.id);
    if (idx >= 0) world.canon[idx] = { ...world.canon[idx], ...item };
    else world.canon = [...world.canon, item];
    world.updatedAt = now();
    await upsertRecord('worlds', world);
    return { entity: world, before, after: clone(world.canon) };
  },
  'canon.finalize': async (a) => {
    const world = find('worlds', a.entityId);
    const before = clone(world.canon);
    const item = world.canon.find((c) => c.id === a.payload.canonId);
    if (item) item.stage = 'final';
    world.updatedAt = now();
    await upsertRecord('worlds', world);
    return { entity: world, before, after: clone(world.canon) };
  },
  'settings.update': async (a) => {
    const before = clone(state.settings);
    state.settings = { ...state.settings, ...a.payload, updatedAt: now() };
    if (db) await db.setMeta('settings', clone(state.settings));
    return { entity: state.settings, before, after: clone(state.settings) };
  },
  'provider.enable': async (a) => {
    const before = clone(state.settings.providers);
    const p = state.settings.providers.find((x) => x.providerId === a.payload.providerId);
    if (p) Object.assign(p, a.payload.patch);
    if (db) await db.setMeta('settings', clone(state.settings));
    return { entity: p, before, after: clone(state.settings.providers) };
  },
  'capture.create': async (a) => {
    const job = a.payload;
    state.chiefJobs.push(job);
    if (db) await db.put('chiefJobs', clone(job));
    return { entity: job, before: {}, after: clone(job) };
  },
  'data.reset': async () => {
    const before = { worlds: state.worlds.length };
    for (const col of ['worlds', 'rooms', 'objects', 'activity', 'approvals', 'sources', 'chiefJobs']) {
      state[col] = [];
      if (db) await db.clear(col);
    }
    return { entity: null, before, after: { worlds: 0 } };
  },
};

async function patchEntity(entityType, id, patch) {
  const collection = COLLECTION_BY_ENTITY[entityType];
  const record = find(collection, id);
  if (!record) throw new Error(`${entityType} ${id} not found`);
  const before = clone(record);
  Object.assign(record, patch, { updatedAt: now() });
  await upsertRecord(collection, record);
  return { entity: record, before, after: clone(record) };
}

// ---- audit --------------------------------------------------------------

async function log(entry) {
  const record = makeActivity(entry);
  state.activity.unshift(record);
  if (db) await db.put('activity', clone(record));
  emit('activity.recorded', record);
  return record;
}

// ---- core: proposeAction ------------------------------------------------

// action: {
//   type, actor, entityType, entityId, summary, reason,
//   payload, context, before, proposedAfter, affectedEntities, rollbackAvailable
// }
export async function proposeAction(action) {
  const ev = evaluate(action, state.safetyPolicy, providerState());

  if (ev.decision === DECISIONS.DENY) {
    await log({
      actor: action.actor || 'system',
      type: action.type,
      entityType: action.entityType || '',
      entityId: action.entityId || '',
      summary: `Blocked: ${action.summary || action.type}. ${ev.reason}`,
      result: 'failure',
    });
    const result = { ok: false, denied: true, reason: ev.reason, risk: ev.risk };
    emit('action.denied', { action, result });
    return result;
  }

  if (ev.decision === DECISIONS.REQUIRE_APPROVAL) {
    const approval = buildApprovalRequest(action, ev, { makeId, now });
    // Do not persist executable functions; store the descriptor only.
    approval._action = clone(action);
    state.approvals.unshift(approval);
    if (db) await db.put('approvals', clone(approval));
    await log({
      actor: action.actor || 'user',
      type: 'approval.requested',
      entityType: action.entityType || '',
      entityId: action.entityId || '',
      summary: `Approval requested: ${approval.summary}`,
      approvalId: approval.id,
      result: 'partial',
    });
    emit('approval.requested', approval);
    emit('state.changed', { reason: 'approval.requested' });
    return { ok: false, requiresApproval: true, approvalId: approval.id, risk: ev.risk };
  }

  // allow / allow-with-log
  return executeAction(action, ev, null);
}

async function executeAction(action, ev, approvalId) {
  const executor = executors[action.type];
  if (!executor) {
    await log({
      actor: action.actor || 'system',
      type: action.type,
      summary: `No executor registered for ${action.type}`,
      result: 'failure',
    });
    return { ok: false, reason: `No executor for ${action.type}` };
  }
  try {
    const { entity, before, after } = await executor(action);
    await log({
      actor: action.actor || 'user',
      type: action.type,
      entityType: action.entityType || '',
      entityId: action.entityId || (entity && entity.id) || '',
      summary: action.summary || action.type,
      before: before || {},
      after: after || {},
      approvalId,
      result: 'success',
    });
    emit('state.changed', { reason: action.type, entity });
    return { ok: true, entity, risk: ev.risk };
  } catch (err) {
    await log({
      actor: action.actor || 'system',
      type: action.type,
      entityType: action.entityType || '',
      entityId: action.entityId || '',
      summary: `Failed: ${action.summary || action.type} — ${err.message}`,
      result: 'failure',
    });
    return { ok: false, reason: err.message };
  }
}

// ---- approvals ----------------------------------------------------------

export async function resolveApproval(approvalId, decision, { actor = 'user' } = {}) {
  const approval = state.approvals.find((a) => a.id === approvalId);
  if (!approval) return { ok: false, reason: 'Approval not found' };
  if (approval.status !== 'pending') {
    return { ok: false, reason: `Approval already ${approval.status}` };
  }

  if (decision === 'reject') {
    approval.status = 'rejected';
    approval.resolvedAt = now();
    if (db) await db.put('approvals', clone(approval));
    await log({
      actor, type: 'approval.rejected', approvalId,
      summary: `Rejected: ${approval.summary}`, result: 'success',
    });
    emit('approval.resolved', approval);
    emit('state.changed', { reason: 'approval.rejected' });
    return { ok: true, status: 'rejected' };
  }

  // approve → snapshot first if required, then execute
  if (approval.backupFirst) {
    await createBackup({ reason: `Pre-execution snapshot for ${approval.id}` });
  }
  const result = await executeAction(approval._action, { risk: approval.risk }, approvalId);
  approval.status = result.ok ? 'executed' : 'failed';
  approval.resolvedAt = now();
  if (db) await db.put('approvals', clone(approval));
  emit('approval.resolved', approval);
  emit('state.changed', { reason: 'approval.resolved' });
  return { ok: result.ok, status: approval.status, result };
}

// ---- backups ------------------------------------------------------------

export async function createBackup({ reason = 'manual' } = {}) {
  const snapshot = {
    id: makeId('backup'),
    schemaVersion: '1.0',
    reason,
    createdAt: now(),
    data: {
      worlds: clone(state.worlds),
      rooms: clone(state.rooms),
      objects: clone(state.objects),
      sources: clone(state.sources),
      activity: clone(state.activity),
      approvals: clone(state.approvals.map((a) => ({ ...a, _action: undefined }))),
      chiefJobs: clone(state.chiefJobs),
      settings: clone(state.settings),
    },
  };
  state.backups.unshift(snapshot);
  if (db) await db.put('backups', clone(snapshot));
  await log({ actor: 'system', type: 'backup.created', summary: `Backup created (${reason})`, result: 'success' });
  emit('state.changed', { reason: 'backup.created' });
  return snapshot;
}

export async function restoreBackup(backupId) {
  const backup = state.backups.find((b) => b.id === backupId);
  if (!backup) return { ok: false, reason: 'Backup not found' };
  const d = backup.data;
  state.worlds = clone(d.worlds || []);
  state.rooms = clone(d.rooms || []);
  state.objects = clone(d.objects || []);
  state.sources = clone(d.sources || []);
  state.chiefJobs = clone(d.chiefJobs || []);
  if (d.settings) state.settings = clone(d.settings);
  if (db) {
    for (const col of ['worlds', 'rooms', 'objects', 'sources', 'chiefJobs']) {
      await db.clear(col);
      await db.bulkPut(col, clone(state[col]));
    }
    await db.setMeta('settings', clone(state.settings));
  }
  await log({ actor: 'user', type: 'backup.restored', summary: `Restored backup ${backupId}`, result: 'success' });
  emit('state.changed', { reason: 'backup.restored' });
  return { ok: true };
}

// ---- import dataset -----------------------------------------------------

// Replace the durable collections from a validated import payload.
// Backs up first (§38: create a snapshot before destructive import).
export async function importDataset(data) {
  await createBackup({ reason: 'Pre-import snapshot' });
  const cols = { worlds: 'worlds', rooms: 'rooms', objects: 'objects', sources: 'sources' };
  for (const [key, col] of Object.entries(cols)) {
    if (Array.isArray(data[key])) {
      state[col] = clone(data[key]);
      if (db) { await db.clear(col); await db.bulkPut(col, clone(state[col])); }
    }
  }
  if (data.settings) {
    state.settings = clone(data.settings);
    if (db) await db.setMeta('settings', clone(state.settings));
  }
  await log({ actor: 'user', type: 'data.import', summary: 'Imported Atlas metadata', result: 'success' });
  emit('state.changed', { reason: 'data.import' });
  return { ok: true };
}

// Recompute derived conflict state from current objects.
export function setConflicts(conflicts) {
  state.conflicts = conflicts;
}

// ---- init / seed --------------------------------------------------------

export async function initStore(adapter, seed) {
  db = adapter;
  if (db) await db.init();

  // Meta documents.
  state.system = (db && (await db.getMeta('system'))) || seed.system;
  state.settings = (db && (await db.getMeta('settings'))) || seed.settings;
  state.safetyPolicy = (db && (await db.getMeta('safetyPolicy'))) || seed.safetyPolicy;
  state.locations = (db && (await db.getMeta('locations'))) || seed.locations;
  state.chief = (db && (await db.getMeta('chief'))) || seed.chief;

  const empty = db ? await db.isEmpty() : true;
  if (empty) {
    // First run: seed durable collections.
    state.worlds = clone(seed.worlds || []);
    state.rooms = clone(seed.rooms || []);
    state.objects = clone(seed.objects || []);
    state.sources = clone(seed.sources || []);
    state.activity = clone(seed.activity || []);
    state.approvals = clone((seed.chief && seed.chief.approvals) || []);
    state.chiefJobs = clone((seed.chief && seed.chief.queue) || []);
    if (db) {
      await db.bulkPut('worlds', state.worlds);
      await db.bulkPut('rooms', state.rooms);
      await db.bulkPut('objects', state.objects);
      await db.bulkPut('sources', state.sources);
      await db.bulkPut('activity', state.activity);
      await db.bulkPut('approvals', state.approvals);
      await db.bulkPut('chiefJobs', state.chiefJobs);
      await db.setMeta('system', clone(state.system));
      await db.setMeta('settings', clone(state.settings));
      await db.setMeta('safetyPolicy', clone(state.safetyPolicy));
      await db.setMeta('locations', clone(state.locations));
      await db.setMeta('chief', clone(state.chief));
      await db.setMeta('schemaMeta', { version: '1.0', migratedAt: now() });
    }
  } else {
    state.worlds = await db.getAll('worlds');
    state.rooms = await db.getAll('rooms');
    state.objects = await db.getAll('objects');
    state.sources = await db.getAll('sources');
    state.activity = (await db.getAll('activity')).sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    state.approvals = await db.getAll('approvals');
    state.chiefJobs = await db.getAll('chiefJobs');
    state.backups = await db.getAll('backups');
  }

  state.ready = true;
  emit('store.ready', state);
  return state;
}

// Convenience wrappers used by views/components -------------------------

export const actions = {
  createWorld(payload, actor = 'user') {
    const world = {
      schemaVersion: '1.0', id: makeId('world'), status: 'active', priority: 'medium',
      canon: [], unresolvedQuestions: [], lastAction: '', nextAction: '', futureAction: '',
      roomIds: [], objectIds: [], galleryConfig: { layout: 'grid', assetSlots: ['cover'] },
      sourceRefs: [], blockers: [], deadlines: [], createdAt: now(), updatedAt: now(),
      ...payload,
    };
    const v = validateEntity('world', world);
    if (!v.valid) return Promise.resolve({ ok: false, reason: v.errors.join('; ') });
    return proposeAction({
      type: 'world.create', actor, entityType: 'world', entityId: world.id,
      summary: `Create World "${world.name}"`,
      reason: 'A new Project World requires explicit approval before creation.',
      payload: world, proposedAfter: world,
    });
  },
  updateWorld(id, patch, actor = 'user') {
    return proposeAction({
      type: 'world.update', actor, entityType: 'world', entityId: id,
      summary: `Update World ${id}`, payload: patch,
    });
  },
  archiveWorld(id, actor = 'user') {
    return proposeAction({
      type: 'world.archive', actor, entityType: 'world', entityId: id,
      summary: `Archive World ${id}`,
    });
  },
  restoreWorld(id, actor = 'user') {
    return proposeAction({
      type: 'world.restore', actor, entityType: 'world', entityId: id,
      summary: `Restore World ${id}`,
    });
  },
  deleteWorld(id, actor = 'user') {
    const w = find('worlds', id);
    return proposeAction({
      type: 'world.delete', actor, entityType: 'world', entityId: id,
      summary: `Permanently delete World "${w ? w.name : id}"`,
      reason: 'Destructive action. A backup snapshot is taken before execution.',
      before: clone(w) || {}, rollbackAvailable: true,
    });
  },
  createObject(payload, actor = 'user') {
    const obj = {
      schemaVersion: '1.0', id: makeId('object'), roomId: null, stage: 'draft',
      canonical: false, provider: 'local', providerObjectId: '', path: '', repositoryUrl: '',
      externalUrl: '', previewRef: '', tags: [], provenance: {}, createdAt: now(), updatedAt: now(),
      ...payload,
    };
    const v = validateEntity('object', obj);
    if (!v.valid) return Promise.resolve({ ok: false, reason: v.errors.join('; ') });
    return proposeAction({
      type: 'object.create', actor, entityType: 'object', entityId: obj.id,
      summary: `Add object "${obj.title}"`, payload: obj, context: { provider: 'local' },
    });
  },
  updateObject(id, patch, actor = 'user') {
    return proposeAction({ type: 'object.update', actor, entityType: 'object', entityId: id, summary: `Update object ${id}`, payload: patch });
  },
  deleteObject(id, actor = 'user') {
    const o = find('objects', id);
    return proposeAction({
      type: 'object.delete', actor, entityType: 'object', entityId: id,
      summary: `Permanently delete object "${o ? o.title : id}"`,
      reason: 'Destructive action. A backup snapshot is taken before execution.',
      before: clone(o) || {},
    });
  },
  createRoom(payload, actor = 'user') {
    const room = { schemaVersion: '1.0', id: makeId('room'), type: 'section', objectIds: [], notes: '', ...payload };
    const v = validateEntity('room', room);
    if (!v.valid) return Promise.resolve({ ok: false, reason: v.errors.join('; ') });
    return proposeAction({ type: 'room.create', actor, entityType: 'room', entityId: room.id, summary: `Create room "${room.name}"`, payload: room });
  },
  addCanon(worldId, item, actor = 'user') {
    const canonItem = { id: makeId('canon'), stage: 'draft', supersedes: null, createdAt: now(), ...item };
    return proposeAction({
      type: 'canon.change', actor, entityType: 'world', entityId: worldId,
      summary: `Change canon for ${worldId}: "${canonItem.title}"`,
      reason: 'Changing established canon requires a recorded proposal and approval.',
      payload: canonItem, proposedAfter: canonItem,
    });
  },
  finalizeCanon(worldId, canonId, actor = 'user') {
    return proposeAction({
      type: 'canon.finalize', actor, entityType: 'world', entityId: worldId,
      summary: `Finalize canon ${canonId}`,
      reason: 'Marking canon as final is a consequential change requiring approval.',
      payload: { canonId }, affectedEntities: [canonId],
    });
  },
  updateSettings(patch, actor = 'user') {
    return proposeAction({ type: 'settings.update', actor, entityType: 'settings', entityId: 'settings', summary: 'Update settings', payload: patch });
  },
  capture(input, reasoningDepth = 'brain', actor = 'user') {
    const job = { id: makeId('job'), actor, input, reasoningDepth, status: 'queued', risk: 'low', createdAt: now() };
    return proposeAction({ type: 'capture.create', actor, entityType: 'chiefJob', entityId: job.id, summary: 'Chief capture', payload: job, context: { provider: 'chief' } });
  },
  resetData(actor = 'user') {
    return proposeAction({
      type: 'data.reset', actor, entityType: 'system', entityId: 'system',
      summary: 'Reset all Atlas data', reason: 'Destructive system reset. Backup is taken before execution.',
    });
  },
};
