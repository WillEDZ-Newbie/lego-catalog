// storage-provider.js — provider-neutral storage contract.
// Base class. Concrete providers override capability and IO methods. The
// default methods refuse to act and report honestly rather than pretending.

export class StorageProvider {
  constructor({ id, label, mode = 'stub', status = 'not-configured', writeCapability = 'none' }) {
    this.id = id;
    this.label = label;
    this.mode = mode;              // 'live' | 'stub' | 'mock'
    this.status = status;          // 'connected' | 'not-configured' | 'unavailable' | 'mock'
    this.writeCapability = writeCapability; // 'none' | 'proposed' | 'approved'
  }

  canRead() { return this.status === 'connected'; }
  canWrite() { return this.status === 'connected' && this.writeCapability === 'approved'; }

  // A standard, honest "not performed" result. providerConfirmed:false means the
  // safety/activity layer must NOT record this as a completed action.
  _notPerformed(op, ref) {
    return {
      ok: false,
      providerConfirmed: false,
      op,
      ref,
      reason: `${this.label} is ${this.status} (${this.mode}); "${op}" was not performed.`
    };
  }

  async connect() { return { ok: false, providerConfirmed: false, reason: `${this.label} has no live connection configured.` }; }
  async list() { return this._notPerformed('list'); }
  async getMetadata(ref) { return this._notPerformed('getMetadata', ref); }
  async read(ref) { return this._notPerformed('read', ref); }
  async write(ref) { return this._notPerformed('write', ref); }
  async move(ref) { return this._notPerformed('move', ref); }
  async archive(ref) { return this._notPerformed('archive', ref); }
}
