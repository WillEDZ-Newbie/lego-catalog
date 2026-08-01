// source-resolver.js — source authority and conflict detection (§24).
// Determines the authoritative copy of an asset and flags conflicts instead
// of guessing when the same asset exists in multiple providers.

// Group sources/objects by a logical asset key and detect conflicts.
export function detectConflicts(objects) {
  const byKey = new Map();
  for (const o of objects || []) {
    const key = (o.title || '').trim().toLowerCase();
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(o);
  }
  const conflicts = [];
  for (const [key, group] of byKey) {
    const canonical = group.filter((o) => o.canonical);
    if (group.length > 1 && (canonical.length !== 1)) {
      conflicts.push({
        key,
        objectIds: group.map((o) => o.id),
        providers: [...new Set(group.map((o) => o.provider))],
        reason: canonical.length === 0
          ? 'Same asset in multiple providers with no authoritative copy marked.'
          : 'Multiple copies marked authoritative.',
      });
    }
  }
  return conflicts;
}

// Resolve the authoritative source for an object given its world's sources.
export function resolveAuthority(object, sources) {
  if (object.canonical) return { authority: 'object.canonical', source: object };
  const worldSources = (sources || []).filter((s) => s.worldId === object.worldId);
  const primary = worldSources.find((s) => s.authority === 'primary' && s.provider === object.provider);
  if (primary) return { authority: 'source.primary', source: primary };
  return { authority: 'unresolved', source: null };
}

// Human-readable availability summary for a source record.
export function availabilityLabel(source) {
  if (!source) return 'No source record';
  switch (source.availability) {
    case 'available': return 'Available';
    case 'unavailable': return 'Unavailable — offer relink';
    default: return 'Unverified — not confirmed as current';
  }
}
