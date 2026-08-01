import { test, assert, truthy, eq } from './harness.mjs';
import { buildExport, inspectImport, BackupService, EXPORT_KIND } from '../js/import-export.js';
import { Persistence } from '../js/persistence.js';
import { Store } from '../js/store.js';

async function freshStore() {
  const p = await new Persistence().open();
  const store = new Store(p);
  await p.put('worlds', { id: 'w1', schemaVersion: '1.0', name: 'Halo', status: 'active', priority: 'high', objectIds: [], sourceRefs: [] });
  await store._hydrate();
  return { p, store };
}

test('buildExport produces a valid envelope', async () => {
  const { store } = await freshStore();
  const exp = buildExport(store);
  eq(exp.kind, EXPORT_KIND);
  truthy(exp.data.worlds.length >= 1);
});

test('inspectImport accepts a good export and rejects garbage', async () => {
  const { store } = await freshStore();
  const good = buildExport(store);
  truthy(inspectImport(good).valid, 'own export should validate');
  assert(!inspectImport({ kind: 'nope' }).valid, 'garbage should fail');
});

test('inspectImport catches invalid entities', () => {
  const bad = { kind: EXPORT_KIND, schemaVersion: '1.0', data: { worlds: [{ id: '', name: '', status: 'active' }] } };
  assert(!inspectImport(bad).valid, 'invalid world should fail import inspection');
});

test('backup create + list + restore', async () => {
  const { store, p } = await freshStore();
  const backup = new BackupService(store, p);
  await backup.create('test');
  const list = await backup.list();
  truthy(list.length >= 1, 'backup listed');
  const restored = await backup.restore(list[0].id);
  truthy(restored, 'restore returns record');
  truthy(store.getWorld('w1'), 'data present after restore');
});

test('importData takes a pre-import backup', async () => {
  const { store, p } = await freshStore();
  const backup = new BackupService(store, p);
  const payload = buildExport(store);
  await backup.importData(payload);
  const list = await backup.list();
  truthy(list.some(b => b.label === 'pre-import'), 'pre-import backup exists');
});
