// provider-registry.js — provider-neutral registry.
// Views and services never hard-code a provider; they resolve one here and
// consult its published capabilities before offering an action (§36).

const registry = new Map();

export function register(provider) {
  registry.set(provider.providerId, provider);
  return provider;
}

export function get(providerId) {
  return registry.get(providerId);
}

export function all() {
  return Array.from(registry.values());
}

// Whether a provider supports a capability right now. Never inferred from a
// path or URL — only from the provider's declared capabilities + status.
export function can(providerId, capability) {
  const p = registry.get(providerId);
  if (!p) return false;
  if (p.status === 'unavailable' || p.status === 'disconnected') return false;
  return !!(p.capabilities && p.capabilities[capability]);
}
