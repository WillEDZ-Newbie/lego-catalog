// suite.js — unit + integration tests for the Void Dominion foundation.
// Covers the required test areas from §28: hierarchy, storage, safety, worlds,
// plus store mutation lifecycle, search and validation.

import { test, assert, assertEqual } from './framework.js';
import { createMemoryAdapter } from './memory-adapter.js';

import { validateEntity, validateDataset } from '../js/validation.js';
import { evaluate, classify, DECISIONS } from '../js/safety.js';
import { buildIndex, query } from '../js/search.js';
import { detectConflicts } from '../js/source-resolver.js';
import * as store from '../js/store.js';
import { exportData } from '../js/import-export.js';

// ---- minimal seed (mirrors data/*.json shape) ---------------------------

function makeSeed() {
  const locations = Array.from({ length: 9 }, (_, i) => ({
    schemaVersion: '1.0', id: `loc-${i + 1}`, index: i + 1, name: `Location ${i + 1}`,
    function: 'fn', responsibility: 'r', mustNotBecome: 'x',
  }));
  return {
    system: { schemaVersion: '1.0', id: 'system', name: 'Void Dominion', shell: 'Void Dominion', operatingInterface: 'Atlas', convergencePoint: 'Nexus' },
    settings: {
      schemaVersion: '1.0', id: 'settings', featureFlags: {},
      providers: [
        { providerId: 'local', status: 'connected', capabilities: { create: true, update: true, delete: true, read: true } },
        { providerId: 'github', status: 'mock', capabilities: { list: true, read: true, create: false, commit: false } },
        { providerId: 'chief', status: 'mock', capabilities: { create: true } },
      ],
    },
    safetyPolicy: {
      schemaVersion: '1.0',
      riskClasses: {
        low: { requiresApproval: false },
        moderate: { requiresApproval: false },
        high: { requiresApproval: true },
        critical: { requiresApproval: true, backupFirst: true },
      },
      actionRisk: {
        'world.create': 'high', 'world.delete': 'critical', 'object.create': 'low',
        'object.delete': 'critical', 'canon.change': 'high', 'file.move': 'high',
        'capture.create': 'low', 'settings.update': 'moderate',
      },
    },
    locations,
    chief: { status: { label: 'mock' }, queue: [], approvals: [], reasoningLevels: [] },
    worlds: [
      { schemaVersion: '1.0', id: 'world-a', name: 'Alpha World', status: 'active', priority: 'high', canon: [], roomIds: [], objectIds: [], galleryConfig: { layout: 'grid', assetSlots: ['cover'] }, sourceRefs: [], unresolvedQuestions: [], nextAction: 'do', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    ],
    rooms: [],
    objects: [],
    sources: [],
    activity: [],
  };
}

let initialized = null;
async function ready() {
  if (!initialized) {
    initialized = store.initStore(createMemoryAdapter(), makeSeed());
  }
  return initialized;
}

// ---- hierarchy tests (§28.1) --------------------------------------------

test('hierarchy: exactly nine permanent Locations seeded', async () => {
  const s = await ready();
  assertEqual(s.locations.length, 9, 'should seed nine Locations');
});

test('hierarchy: Nexus is not modelled as a Location', async () => {
  const s = await ready();
  assert(!s.locations.some((l) => /nexus/i.test(l.name)), 'Nexus must not appear as a Location');
});

test('hierarchy: every World owns its own gallery config', async () => {
  const s = await ready();
  assert(s.worlds.every((w) => w.galleryConfig && Array.isArray(w.galleryConfig.assetSlots)), 'each World needs its own galleryConfig');
});

// ---- validation tests ---------------------------------------------------

test('validation: world missing name is invalid', () => {
  const res = validateEntity('world', { schemaVersion: '1.0', id: 'w', status: 'active' });
  assert(!res.valid, 'missing name should be invalid');
});

test('validation: full dataset validates', () => {
  const seed = makeSeed();
  const res = validateDataset({ worlds: seed.worlds, rooms: seed.rooms, objects: seed.objects, sources: seed.sources });
  assert(res.valid, `dataset should validate: ${res.errors.join('; ')}`);
});

test('validation: object referencing missing world fails relationships', () => {
  const res = validateDataset({
    worlds: [{ schemaVersion: '1.0', id: 'w1', name: 'W', status: 'active' }],
    objects: [{ schemaVersion: '1.0', id: 'o1', worldId: 'ghost', title: 'X', type: 'image' }],
  });
  assert(!res.valid, 'dangling worldId should fail');
});

// ---- safety tests (§28.3) -----------------------------------------------

test('safety: world.delete classifies as critical', () => {
  const policy = makeSeed().safetyPolicy;
  assertEqual(classify('world.delete', policy), 'critical');
});

test('safety: world.create requires approval', () => {
  const policy = makeSeed().safetyPolicy;
  const ev = evaluate({ type: 'world.create' }, policy, {});
  assertEqual(ev.decision, DECISIONS.REQUIRE_APPROVAL);
});

test('safety: low-risk object.create is allowed with log', () => {
  const policy = makeSeed().safetyPolicy;
  const ev = evaluate({ type: 'object.create', context: { provider: 'local' } }, policy, { local: { status: 'connected', capabilities: { create: true } } });
  assertEqual(ev.decision, DECISIONS.ALLOW_WITH_LOG);
});

test('safety: write via mock provider is denied (no faked success)', () => {
  const policy = makeSeed().safetyPolicy;
  const ev = evaluate({ type: 'file.move', context: { provider: 'github' } }, policy, { github: { status: 'mock', capabilities: { read: true, commit: false } } });
  assertEqual(ev.decision, DECISIONS.DENY);
});

// ---- store lifecycle tests (§28.2, §28.4) -------------------------------

test('store: creating a World routes through approval, then executes', async () => {
  await ready();
  const r = await store.actions.createWorld({ name: 'Beta World' });
  assert(r.requiresApproval, 'World creation must require approval');
  const s = store.getState();
  assert(!s.worlds.some((w) => w.name === 'Beta World'), 'World must not exist before approval');
  const res = await store.resolveApproval(r.approvalId, 'approve');
  assert(res.ok, 'approval execution should succeed');
  assert(store.getState().worlds.some((w) => w.name === 'Beta World'), 'World should exist after approval');
});

test('store: low-risk object.create persists immediately', async () => {
  const s = await ready();
  const r = await store.actions.createObject({ worldId: 'world-a', title: 'Sample Obj', type: 'image', provider: 'local' });
  assert(r.ok, 'object creation should execute immediately');
  assert(store.getState().objects.some((o) => o.title === 'Sample Obj'), 'object should be persisted');
});

test('store: rejecting a deletion performs no destructive action', async () => {
  await ready();
  const obj = store.getState().objects.find((o) => o.title === 'Sample Obj');
  const r = await store.actions.deleteObject(obj.id);
  assert(r.requiresApproval, 'deletion requires approval');
  await store.resolveApproval(r.approvalId, 'reject');
  assert(store.getState().objects.some((o) => o.id === obj.id), 'object must survive a rejected deletion');
});

test('store: approving a critical deletion snapshots first, then removes', async () => {
  await ready();
  const obj = store.getState().objects.find((o) => o.title === 'Sample Obj');
  const r = await store.actions.deleteObject(obj.id);
  const before = store.getState().backups.length;
  await store.resolveApproval(r.approvalId, 'approve');
  assert(store.getState().backups.length > before, 'a backup snapshot must be taken before destructive execution');
  assert(!store.getState().objects.some((o) => o.id === obj.id), 'object should be removed after approval');
});

test('store: every mutation writes an activity record', async () => {
  const s = await ready();
  const count = s.activity.length;
  await store.actions.capture('Test capture', 'brain');
  assert(store.getState().activity.length > count, 'capture should record activity');
});

test('store: approval lifecycle records requested + resolved states', async () => {
  await ready();
  const r = await store.actions.createWorld({ name: 'Gamma World' });
  await store.resolveApproval(r.approvalId, 'approve');
  const approval = store.getState().approvals.find((a) => a.id === r.approvalId);
  assertEqual(approval.status, 'executed', 'approval should be marked executed');
});

// ---- search tests -------------------------------------------------------

test('search: finds a World by name', async () => {
  const s = await ready();
  const index = buildIndex(s);
  const results = query(index, 'Alpha');
  assert(results.some((r) => r.kind === 'world' && /Alpha/.test(r.title)), 'should find Alpha World');
});

test('search: World-scoped query excludes other Worlds', async () => {
  const s = await ready();
  const index = buildIndex(s);
  const results = query(index, 'World', { worldId: 'world-a' });
  assert(results.every((r) => r.worldId === 'world-a' || r.worldId === null ? true : r.worldId === 'world-a'), 'scoped search stays in world-a');
});

// ---- source-resolver tests ----------------------------------------------

test('source-resolver: flags duplicate assets with no authoritative copy', () => {
  const conflicts = detectConflicts([
    { id: 'o1', title: 'Cover', provider: 'icloud', canonical: false },
    { id: 'o2', title: 'Cover', provider: 'github', canonical: false },
  ]);
  assert(conflicts.length === 1, 'should detect one conflict');
});

test('source-resolver: no conflict when one copy is canonical', () => {
  const conflicts = detectConflicts([
    { id: 'o1', title: 'Cover', provider: 'icloud', canonical: true },
    { id: 'o2', title: 'Cover', provider: 'github', canonical: false },
  ]);
  assertEqual(conflicts.length, 0);
});

// ---- import/export tests ------------------------------------------------

test('export: produces a dataset that re-validates', async () => {
  await ready();
  const data = exportData();
  const res = validateDataset({ worlds: data.worlds, rooms: data.rooms, objects: data.objects, sources: data.sources });
  assert(res.valid, `exported data should validate: ${res.errors.join('; ')}`);
});
