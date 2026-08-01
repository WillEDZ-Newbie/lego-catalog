// chief-provider.stub.js — local mock of the Chief reasoning/dispatch pipeline.
// Faithfully represents Chief without pretending the browser is the complete
// Apple Shortcuts implementation. Capture/queue/approvals are real local data;
// reasoning is a deterministic local placeholder (no external model calls).

export class ChiefProviderStub {
  constructor() {
    this.providerId = 'chief';
    this.status = 'mock';
    this.label = 'Chief (stub) — local mock of Apple Shortcuts reasoning and dispatch';
    this.capabilities = { list: true, read: true, preview: true, create: true, update: true, move: false, delete: false, commit: false };
  }

  // Choose a reasoning depth from simple heuristics on the input.
  suggestDepth(input) {
    const text = String(input || '').toLowerCase();
    if (/(delete|buy|pay|book|cancel|send|legal|medical|merge|overwrite|reset)/.test(text)) return 'oracle';
    if (/(plan|schedule|weekly|conflict|travel|sequence|budget|deadline)/.test(text)) return 'strategy';
    return 'brain';
  }

  // Produce a validated-shaped reasoning result (deterministic placeholder).
  async requestReasoning(job) {
    const depth = job.reasoningDepth || this.suggestDepth(job.input);
    const risky = depth === 'oracle';
    return {
      schemaVersion: '1.0',
      reasoningDepth: depth,
      verifiedFacts: [],
      inferences: [`Local mock interpretation of: "${job.input}"`],
      missingInformation: ['Live context (calendar, reminders, files) not connected in browser build.'],
      confidence: 0.4,
      risk: risky ? 'high' : 'low',
      requiresApproval: risky,
      recommendation: risky
        ? 'This appears consequential. Prepared as a proposal requiring explicit approval.'
        : 'Low-risk item captured for follow-up.',
      jobs: [],
      selfCheck: { sourceConfirmed: false, conflictsChecked: true, duplicateChecked: true, safestReversibleOptionPreferred: true },
    };
  }
}
