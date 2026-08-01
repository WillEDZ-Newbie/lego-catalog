import { test, assert, truthy, eq } from './harness.mjs';
import { Persistence } from '../js/persistence.js';
import { Store } from '../js/store.js';

// In Node there is no IndexedDB, so Persistence falls back to memory and Store
// is seeded manually (no fetch). This exercises mutations + persistence.
async function freshStore() {
  const p = await new Persistence().open();
  const store = new Store(p);
  await p.put('system', { id: 'sys', name: 'VD' });
  await p.put('worlds', { id: 'w1', schemaVersion: '1.0', name: 'Halo', status: 'active', priority: 'high', objectIds: [], sourceRefs: [] });
  await p.put('settings', { id: 'settings', theme: 'void' });
  await p.put('safety', { id: 'safety', riskClasses: [], alwaysRequireApproval: [] });
  await store._hydrate();
  return { p, store };
}

test('persistence falls back to memory in Node', async () => {
  const p = await new Persistence().open();
  eq(p.durable, false, 'no IndexedDB in Node');
});

test('hydrate loads seeded records', async () => {
  const { store } = await freshStore();
  truthy(store.getWorld('w1'), 'world should load');
});

test('upsertWorld updates in place and persists', async () => {
  const { store, p } = await freshStore();
  await store.upsertWorld({ id: 'w1', nextAction: 'ship it' });
  eq(store.getWorld('w1').nextAction, 'ship it');
  const persisted = await p.get('worlds', 'w1');
  eq(persisted.nextAction, 'ship it', 'must persist');
});

test('upsertObject links into world.objectIds', async () => {
  const { store } = await freshStore();
  await store.upsertObject({ id: 'o1', worldId: 'w1', title: 'X', type: 'image' });
  truthy(store.getWorld('w1').objectIds.includes('o1'), 'object linked to world');
});

test('addActivity prepends newest-first', async () => {
  const { store } = await freshStore();
  await store.addActivity({ summary: 'first', type: 't' });
  await store.addActivity({ summary: 'second', type: 't' });
  eq(store.getActivity()[0].summary, 'second');
});

test('addApproval defaults to pending', async () => {
  const { store } = await freshStore();
  const a = await store.addApproval({ actionType: 'delete', risk: 'critical', summary: 'x' });
  eq(a.status, 'pending');
  eq(store.getPendingApprovals().length, 1);
});

test('snapshot + replaceAll round-trips', async () => {
  const { store } = await freshStore();
  const snap = store.snapshot();
  await store.replaceAll(snap);
  truthy(store.getWorld('w1'), 'world survives round-trip');
});

test('removeWorld removes world and its objects', async () => {
  const { store } = await freshStore();
  await store.upsertObject({ id: 'o1', worldId: 'w1', title: 'X', type: 'image' });
  await store.removeWorld('w1');
  eq(store.getWorld('w1'), null);
  eq(store.getObject('o1'), null);
});
