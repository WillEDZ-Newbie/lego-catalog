// search.js — Atlas-wide and World-scoped search index.
// A simple inverted-token index rebuilt from store state. Fast enough for the
// local metadata sizes this system holds, with no external dependencies.

export class SearchIndex {
  constructor(store) {
    this.store = store;
    this.docs = [];
    this.rebuild();
  }

  _tokens(text) {
    return String(text || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(t => t.length > 1);
  }

  rebuild() {
    const docs = [];
    for (const w of this.store.getWorlds()) {
      docs.push({
        id: w.id, kind: 'world', worldId: w.id, title: w.name,
        route: `#/world/${w.id}`,
        text: [w.name, w.description, w.nextAction, ...(w.unresolvedQuestions || [])].join(' ')
      });
    }
    for (const o of this.store.getObjects()) {
      docs.push({
        id: o.id, kind: 'object', worldId: o.worldId, title: o.title,
        route: `#/object/${o.id}`,
        text: [o.title, o.type, o.stage, ...(o.tags || [])].join(' ')
      });
    }
    for (const l of this.store.getLocations()) {
      docs.push({
        id: l.id, kind: 'location', title: l.name,
        route: `#/location/${l.id}`,
        text: [l.name, l.responsibility, l.requirement].join(' ')
      });
    }
    this.docs = docs.map(d => ({ ...d, tokens: new Set(this._tokens(d.text)) }));
  }

  // scope: undefined for Atlas-wide, or a worldId to restrict to one World.
  query(q, { scope } = {}) {
    const terms = this._tokens(q);
    if (!terms.length) return [];
    let pool = this.docs;
    if (scope) pool = pool.filter(d => d.worldId === scope);
    const scored = [];
    for (const doc of pool) {
      let score = 0;
      for (const term of terms) {
        if (doc.tokens.has(term)) score += 2;
        else if ([...doc.tokens].some(t => t.startsWith(term))) score += 1;
      }
      if (score > 0) scored.push({ ...doc, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, 40);
  }
}
