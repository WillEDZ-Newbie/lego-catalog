// import-export.js — validated export, import, backup and restore.
// Backups are snapshots kept in the 'meta' store; export/import move data in
// and out as a versioned JSON envelope. Restore/import are destructive and so
// are routed through the safety evaluator by the caller.

import { validateImport, validateEntity } from './validation.js';

export const EXPORT_KIND = 'void-dominion-export';

export function buildExport(store) {
  return {
    kind: EXPORT_KIND,
    schemaVersion: '1.0',
    exportedAt: new Date().toISOString(),
    data: store.snapshot()
  };
}

export function exportToBlob(store) {
  const payload = buildExport(store);
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

// Validate an import payload and the entities inside it. Returns
// { valid, errors, data } — never mutates the store.
export function inspectImport(payload) {
  const base = validateImport(payload);
  if (!base.valid) return { valid: false, errors: base.errors, data: null };
  const errors = [];
  const data = payload.data || {};
  for (const w of data.worlds || []) {
    const r = validateEntity('world', w);
    if (!r.valid) errors.push(...r.errors);
  }
  for (const o of data.objects || []) {
    const r = validateEntity('object', o);
    if (!r.valid) errors.push(...r.errors);
  }
  return { valid: errors.length === 0, errors, data };
}

export class BackupService {
  constructor(store, persistence) {
    this.store = store;
    this.p = persistence;
  }

  async list() {
    const all = await this.p.getAll('meta');
    return all
      .filter(m => m.id.startsWith('backup-'))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  // Create a snapshot backup. Always called before destructive operations.
  async create(label = 'manual') {
    const id = `backup-${Date.now().toString(36)}`;
    const record = {
      id,
      createdAt: new Date().toISOString(),
      label,
      data: this.store.snapshot()
    };
    await this.p.put('meta', record);
    return record;
  }

  async restore(backupId) {
    const record = await this.p.get('meta', backupId);
    if (!record) throw new Error(`No backup ${backupId}`);
    await this.store.replaceAll(record.data);
    return record;
  }

  // Import validated data. A pre-import backup is taken so it is reversible.
  async importData(payload) {
    const inspection = inspectImport(payload);
    if (!inspection.valid) throw new Error(`Import invalid: ${inspection.errors.join('; ')}`);
    await this.create('pre-import');
    await this.store.replaceAll(inspection.data);
    return inspection;
  }
}
