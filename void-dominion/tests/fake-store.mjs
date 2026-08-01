// fake-store.mjs — minimal in-memory store double for logic tests.
// Implements only the surface the evaluator / search / resolver need.

let counter = 0;
const id = (p) => `${p}-${++counter}`;

export function makeFakeStore(overrides = {}) {
  const state = {
    worlds: overrides.worlds || [
      { id: 'world-halo', name: 'Halo', status: 'active', priority: 'high', description: 'widgets', nextAction: 'link export', unresolvedQuestions: [], sourceRefs: ['src-1'], canon: [], objectIds: ['obj-1'] }
    ],
    objects: overrides.objects || [
      { id: 'obj-1', worldId: 'world-halo', title: 'Halo clock', type: 'image', stage: 'final', tags: ['widget'], sourceRef: 'src-1' }
    ],
    sources: overrides.sources || [
      { id: 'src-1', provider: 'github', authority: 'primary', availability: 'unknown' }
    ],
    locations: overrides.locations || [
      { id: 'machine-oracle', name: 'Machine Oracle', responsibility: 'Chief', requirement: 'reasoning' }
    ],
    activity: [],
    approvals: []
  };

  const policy = overrides.policy || {
    decisions: ['allow', 'allow-with-log', 'require-approval', 'deny'],
    riskClasses: [
      { risk: 'low', decision: 'allow-with-log', requiresBackup: false },
      { risk: 'medium', decision: 'allow-with-log', requiresBackup: false, requiresBeforeAfter: true },
      { risk: 'high', decision: 'require-approval', requiresApproval: true },
      { risk: 'critical', decision: 'require-approval', requiresApproval: true, requiresBackup: true }
    ],
    alwaysRequireApproval: ['delete', 'world_delete', 'canon_change', 'send', 'github_write'],
    rules: {}
  };

  return {
    state,
    getSafetyPolicy: () => policy,
    getWorlds: () => state.worlds,
    getWorld: (i) => state.worlds.find(w => w.id === i) || null,
    getObjects: () => state.objects,
    getObject: (i) => state.objects.find(o => o.id === i) || null,
    getObjectsForWorld: (w) => state.objects.filter(o => o.worldId === w),
    getSources: () => state.sources,
    getSource: (i) => state.sources.find(s => s.id === i) || null,
    getLocations: () => state.locations,
    getApprovals: () => state.approvals,
    async addActivity(entry) { const r = { id: id('activity'), timestamp: new Date().toISOString(), result: 'success', ...entry }; state.activity.push(r); return r; },
    async addApproval(a) { const r = { id: id('approval'), status: 'pending', createdAt: new Date().toISOString(), resolvedAt: null, ...a }; state.approvals.push(r); return r; },
    async updateApproval(i, patch) { const a = state.approvals.find(x => x.id === i); Object.assign(a, patch); return a; }
  };
}
