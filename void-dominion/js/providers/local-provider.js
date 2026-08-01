// local-provider.js — fully functional local metadata provider.
// Handles browser-safe references and metadata. It never claims to hold the
// only copy of irreplaceable external source files (§5).

import { StorageProvider } from './storage-provider.js';

export class LocalProvider extends StorageProvider {
  constructor() {
    super({
      providerId: 'local',
      status: 'connected',
      label: 'Local metadata provider',
      capabilities: { list: true, read: true, preview: true, create: true, update: true, move: false, delete: true, commit: false },
    });
  }

  async connect() { this.status = 'connected'; return true; }

  async getMetadata(ref) {
    // Local refs point at bundled placeholders / relative asset paths.
    return { ref, provider: 'local', available: true };
  }

  async read(ref) {
    return { ref, provider: 'local', content: null, note: 'Local provider stores references, not external bytes.' };
  }
}
