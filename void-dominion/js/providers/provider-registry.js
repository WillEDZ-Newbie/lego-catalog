// provider-registry.js — provider-neutral registry.
// Views and services talk to providers only through this registry, never to a
// hard-coded provider. Each provider reports its own capabilities and honest
// connection status; nothing here fakes a live integration.

export class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(provider) {
    this.providers.set(provider.id, provider);
    return this;
  }

  get(id) {
    return this.providers.get(id) || null;
  }

  all() {
    return [...this.providers.values()];
  }

  // Status snapshot for the storage-status strip and Throne Reactor.
  statuses() {
    return this.all().map(p => ({
      id: p.id,
      label: p.label,
      mode: p.mode,            // 'live' | 'stub' | 'mock'
      status: p.status,        // 'connected' | 'not-configured' | 'unavailable' | 'mock'
      writeCapability: p.writeCapability, // 'none' | 'proposed' | 'approved'
      canRead: typeof p.canRead === 'function' ? p.canRead() : false,
      canWrite: typeof p.canWrite === 'function' ? p.canWrite() : false
    }));
  }
}
