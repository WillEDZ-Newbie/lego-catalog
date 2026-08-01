// github-provider.stub.js — honest GitHub stub / repository reference adapter.
// Repository URLs are read references only. Listing/reading public metadata is
// declared; writes/commits require an authenticated provider and explicit
// approval and are therefore NOT enabled here (§36).

import { StorageProvider, NotSupportedError } from './storage-provider.js';

export class GithubProviderStub extends StorageProvider {
  constructor() {
    super({
      providerId: 'github',
      status: 'mock',
      label: 'GitHub (stub) — repository URLs are read references only; writes need authenticated provider and approval',
      capabilities: { list: true, read: true, preview: true, create: false, update: false, move: false, delete: false, commit: false },
    });
  }

  // Repository contract methods (read-only reference behaviour).
  async listRepositories() { return []; }
  async getRepository(ref) { return { ref, provider: 'github', writeAuthority: false }; }
  async listIssues() { return []; }
  async getStatus() { return { available: 'unknown', note: 'Not verified without authenticated provider.' }; }

  async write() { throw new NotSupportedError('github', 'write (requires authenticated provider + approval)'); }
  async commit() { throw new NotSupportedError('github', 'commit (requires authenticated provider + approval)'); }
}
