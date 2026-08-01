// icloud-provider.stub.js — honest iCloud Drive adapter placeholder.
// The browser cannot reach iCloud Drive directly. Until a real integration is
// approved and configured, every operation reports "not performed". This stub
// exists so the interface, references and setup requirements are real now.

import { StorageProvider } from './storage-provider.js';

export class ICloudProviderStub extends StorageProvider {
  constructor() {
    super({ id: 'icloud', label: 'iCloud Drive (stub)', mode: 'stub', status: 'not-configured', writeCapability: 'none' });
  }

  setupRequirements() {
    return [
      'A native bridge (Shortcuts, a companion app, or a file-system access flow) that can reach iCloud Drive.',
      'User-granted permission scoped to the referenced folders.',
      'No API secrets stored in client JavaScript.'
    ];
  }
}
