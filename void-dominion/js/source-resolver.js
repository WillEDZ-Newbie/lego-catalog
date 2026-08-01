// source-resolver.js — source authority and conflict detection.
// Determines the authoritative copy for an Object/World and flags conflicts
// (e.g. two providers both marked "primary"). Never overwrites one provider
// from another; it only reports.

export class SourceResolver {
  constructor(store) {
    this.store = store;
  }

  resolveForObject(objectId) {
    const obj = this.store.getObject(objectId);
    if (!obj) return { ok: false, reason: 'No such object' };
    const refs = [];
    if (obj.sourceRef) {
      const s = this.store.getSource(obj.sourceRef);
      if (s) refs.push(s);
    }
    return this._resolve(refs, obj);
  }

  resolveForWorld(worldId) {
    const world = this.store.getWorld(worldId);
    if (!world) return { ok: false, reason: 'No such world' };
    const refs = (world.sourceRefs || []).map(id => this.store.getSource(id)).filter(Boolean);
    return this._resolve(refs, world);
  }

  _resolve(refs, owner) {
    const primaries = refs.filter(r => r.authority === 'primary');
    const conflict = primaries.length > 1;
    const authoritative = primaries[0] || refs[0] || null;
    const missing = (owner.sourceRefs || (owner.sourceRef ? [owner.sourceRef] : []))
      .filter(id => !this.store.getSource(id));
    return {
      ok: true,
      authoritative,
      conflict,
      conflictingSources: conflict ? primaries.map(p => p.id) : [],
      missing,
      availability: authoritative ? authoritative.availability : 'unknown'
    };
  }

  // System-wide list of source problems for Leviathan Spine diagnostics.
  diagnostics() {
    const problems = [];
    for (const w of this.store.getWorlds()) {
      const r = this.resolveForWorld(w.id);
      if (r.conflict) problems.push({ kind: 'world', id: w.id, issue: 'conflicting primary sources', detail: r.conflictingSources });
      for (const m of r.missing) problems.push({ kind: 'world', id: w.id, issue: 'missing source', detail: m });
    }
    for (const s of this.store.getSources()) {
      if (s.availability === 'unavailable') problems.push({ kind: 'source', id: s.id, issue: 'source unavailable' });
    }
    return problems;
  }
}
