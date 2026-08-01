// search.js — Atlas-wide and World-scoped search indexes.
// Pure, in-memory inverted-ish index. Rebuilt from state; derived data only.

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

// Build a flat list of searchable records from the state.
export function buildIndex(state) {
  const records = [];
  for (const w of state.worlds || []) {
    records.push({
      id: w.id, kind: 'world', worldId: w.id,
      title: w.name, subtitle: w.description || '',
      route: `#/world/${w.id}`,
      text: [w.name, w.description, w.status, w.nextAction, (w.canon || []).map((c) => c.title).join(' ')].join(' '),
    });
  }
  for (const o of state.objects || []) {
    records.push({
      id: o.id, kind: 'object', worldId: o.worldId,
      title: o.title, subtitle: `${o.type} · ${o.provider}`,
      route: `#/object/${o.id}`,
      text: [o.title, o.type, o.provider, (o.tags || []).join(' '), o.path, o.repositoryUrl].join(' '),
    });
  }
  for (const r of state.rooms || []) {
    records.push({
      id: r.id, kind: 'room', worldId: r.worldId,
      title: r.name, subtitle: `Room · ${r.type || 'section'}`,
      route: `#/world/${r.worldId}/room/${r.id}`,
      text: [r.name, r.type, r.notes].join(' '),
    });
  }
  for (const l of state.locations || []) {
    records.push({
      id: l.id, kind: 'location', worldId: null,
      title: l.name, subtitle: 'Permanent Location',
      route: `#/location/${l.id}`,
      text: [l.name, l.function, l.responsibility].join(' '),
    });
  }
  return records;
}

// Query the index. Optional worldId scopes results to a single World
// (plus its rooms/objects) — never a global takeover of a World's scope.
export function query(index, term, { worldId = null, limit = 50 } = {}) {
  const tokens = tokenize(term);
  if (!tokens.length) return [];
  let pool = index;
  if (worldId) pool = index.filter((r) => r.worldId === worldId);
  const scored = [];
  for (const rec of pool) {
    const haystack = rec.text.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (haystack.includes(t)) score += 1;
      if (rec.title && rec.title.toLowerCase().includes(t)) score += 2;
    }
    if (score > 0) scored.push({ ...rec, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
