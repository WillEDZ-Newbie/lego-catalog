// icloud-provider.stub.js — honest iCloud Drive stub.
// Direct browser access to iCloud Drive is not available. This stub declares
// no read/write capability and explains what a live integration requires
// (user-selected files, a local companion, Apple Shortcuts, or a native app).

import { StorageProvider, NotSupportedError } from './storage-provider.js';

export class ICloudProviderStub extends StorageProvider {
  constructor() {
    super({
      providerId: 'icloud',
      status: 'mock',
      label: 'iCloud Drive (stub) — requires user-selected files, a local companion, Apple Shortcuts or a native app',
      capabilities: { list: false, read: false, preview: false, create: false, update: false, move: false, delete: false, commit: false },
    });
    this.setupRequirements = [
      'User-selected files via the File System Access API, or',
      'A local companion process exposing an authorised endpoint, or',
      'Apple Shortcuts writing to a shared JSON bridge, or',
      'A future native macOS / iPadOS application.',
    ];
  }

  async connect() { throw new NotSupportedError('icloud', 'connect (no browser integration configured)'); }
}
