// import-export.js — validated import and export.
// Export produces a portable snapshot of Atlas metadata (never external
// source bytes). Import validates the dataset and backs up before applying.

import { getState, createBackup } from './store.js';
import { validateDataset } from './validation.js';
import { now } from './util.js';

export function exportData() {
  const s = getState();
  return {
    format: 'void-dominion-export',
    schemaVersion: '1.0',
    exportedAt: now(),
    note: 'Atlas metadata and references only. External source files are not included.',
    system: s.system,
    settings: s.settings,
    locations: s.locations,
    worlds: s.worlds,
    rooms: s.rooms,
    objects: s.objects,
    sources: s.sources,
    activity: s.activity,
    chief: s.chief,
  };
}

export function exportToBlob() {
  const json = JSON.stringify(exportData(), null, 2);
  return new Blob([json], { type: 'application/json' });
}

// Validate an import payload without applying it (preview).
export function previewImport(data) {
  const result = validateDataset(data);
  const counts = {
    worlds: (data.worlds || []).length,
    rooms: (data.rooms || []).length,
    objects: (data.objects || []).length,
    sources: (data.sources || []).length,
  };
  return { ...result, counts };
}

// Apply an import. Backs up first, validates, then replaces collections.
// Uses the store's persistence via a re-seed path.
export async function applyImport(data, { db, replaceCollections }) {
  const preview = previewImport(data);
  if (!preview.valid) {
    return { ok: false, errors: preview.errors };
  }
  await createBackup({ reason: 'Pre-import snapshot' });
  await replaceCollections(data);
  return { ok: true, counts: preview.counts };
}
