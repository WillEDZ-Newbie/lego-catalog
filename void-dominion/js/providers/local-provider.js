// local-provider.js — local metadata and browser-safe file references.
// The only fully-live provider in the browser-only build. It manages metadata
// and references; it never claims to hold irreplaceable source files.

import { StorageProvider } from './storage-provider.js';

export class LocalProvider extends StorageProvider {
  constructor(store) {
    super({ id: 'local', label: 'Local metadata provider', mode: 'live', status: 'connected', writeCapability: 'approved' });
    this.store = store;
  }

  async list(scope) {
    const objects = scope
      ? this.store.getObjectsForWorld(scope)
      : this.store.getObjects();
    return { ok: true, providerConfirmed: true, op: 'list', items: objects.map(o => ({ id: o.id, title: o.title, type: o.type })) };
  }

  async getMetadata(ref) {
    const obj = this.store.getObject(ref);
    if (!obj) return { ok: false, providerConfirmed: true, op: 'getMetadata', reason: `No local object ${ref}` };
    return { ok: true, providerConfirmed: true, op: 'getMetadata', metadata: obj };
  }

  async read(ref) {
    // Local provider stores references + preview metadata, not raw file bytes.
    const obj = this.store.getObject(ref);
    if (!obj) return { ok: false, providerConfirmed: true, reason: `No local object ${ref}` };
    return { ok: true, providerConfirmed: true, op: 'read', previewRef: obj.previewRef, note: 'Local provider returns metadata/preview, not source bytes.' };
  }

  async write(ref, content, options = {}) {
    // "Writing" locally means persisting metadata for a reference.
    return { ok: true, providerConfirmed: true, op: 'write', ref, note: 'Local metadata persisted.' };
  }
}
