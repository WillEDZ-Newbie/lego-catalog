// storage-provider.js — provider-neutral storage contract.
// Base class documenting the interface every storage provider implements.
// Methods that a concrete provider cannot honestly perform must throw a
// NotSupported error rather than silently pretending success (§39).

export class NotSupportedError extends Error {
  constructor(providerId, method) {
    super(`Provider "${providerId}" does not support "${method}".`);
    this.name = 'NotSupportedError';
    this.notSupported = true;
  }
}

export class StorageProvider {
  constructor({ providerId, status = 'mock', label = '', capabilities = {} }) {
    this.providerId = providerId;
    this.status = status;
    this.label = label;
    this.capabilities = capabilities;
  }

  requireCapability(method, cap) {
    if (this.status === 'unavailable' || this.status === 'disconnected') {
      throw new NotSupportedError(this.providerId, `${method} (status: ${this.status})`);
    }
    if (!this.capabilities[cap]) throw new NotSupportedError(this.providerId, method);
  }

  async connect(/* config */) { throw new NotSupportedError(this.providerId, 'connect'); }
  async list(/* pathOrScope */) { this.requireCapability('list', 'list'); return []; }
  async getMetadata(/* ref */) { this.requireCapability('getMetadata', 'read'); return null; }
  async read(/* ref */) { this.requireCapability('read', 'read'); return null; }
  async write(/* ref, content, options */) { this.requireCapability('write', 'update'); }
  async move(/* ref, destination, options */) { this.requireCapability('move', 'move'); }
  async archive(/* ref, options */) { this.requireCapability('archive', 'update'); }

  describe() {
    return { providerId: this.providerId, status: this.status, label: this.label, capabilities: this.capabilities };
  }
}
