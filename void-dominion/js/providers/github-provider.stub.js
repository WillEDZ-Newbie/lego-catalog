// github-provider.stub.js — honest GitHub adapter placeholder.
// Read-only public metadata could be added later via the public API, but writes
// require authenticated, approved integration. Until configured this stub does
// not perform reads or writes and never reports success it did not achieve.

import { StorageProvider } from './storage-provider.js';

export class GitHubProviderStub extends StorageProvider {
  constructor() {
    super({ id: 'github', label: 'GitHub (stub)', mode: 'stub', status: 'not-configured', writeCapability: 'none' });
  }

  // Repository-provider surface (see brief §15 RepositoryProvider).
  async listRepositories() { return this._notPerformed('listRepositories'); }
  async getRepository(ref) { return this._notPerformed('getRepository', ref); }
  async listIssues(ref) { return this._notPerformed('listIssues', ref); }
  async getStatus(ref) { return this._notPerformed('getStatus', ref); }

  setupRequirements() {
    return [
      'A configured GitHub integration (token handled server-side or via device flow) — never a secret embedded in client code.',
      'Explicit approval before any write/publish action.',
      'Repository references remain valid and inspectable even while the provider is a stub.'
    ];
  }
}
