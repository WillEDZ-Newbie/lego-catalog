// ai-provider.stub.js — AIProvider interface (classify / plan / reviewSafety).
// Labelled mock. Returns transparent, deterministic-ish heuristics so the
// reasoning and safety-review flows are wired end to end without a live model.

export class AIProviderStub {
  constructor() {
    this.id = 'ai';
    this.label = 'AI provider (mock)';
    this.mode = 'mock';
    this.status = 'mock';
    this.writeCapability = 'none';
  }

  async classify(input, context = {}) {
    const t = String(input || '').toLowerCase();
    let category = 'note';
    if (/buy|purchase|order/.test(t)) category = 'shopping';
    else if (/remind|todo|task/.test(t)) category = 'task';
    else if (/meet|calendar|appointment/.test(t)) category = 'calendar';
    return { ok: true, providerConfirmed: true, category, confidence: 0.5, mock: true };
  }

  async plan(context = {}) {
    return {
      ok: true, providerConfirmed: true, mock: true,
      plan: ['[mock] Review inputs', '[mock] Identify next reversible step', '[mock] Gate consequential steps for approval'],
      tradeoffs: ['Mock plan — replace with a live model for real reasoning.']
    };
  }

  // Safety review of proposed jobs against policy. Flags high/critical jobs.
  async reviewSafety(proposedJobs = [], policy = {}) {
    const flagged = proposedJobs.filter(j => ['high', 'critical'].includes(j.risk));
    return {
      ok: true, providerConfirmed: true, mock: true,
      approvedForAuto: proposedJobs.filter(j => !['high', 'critical'].includes(j.risk)),
      requiresApproval: flagged
    };
  }
}
