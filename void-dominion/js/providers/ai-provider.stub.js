// ai-provider.stub.js — deterministic local AI placeholder.
// No external model calls. Returns structured, validated-shaped output so the
// reasoning-output contract (§40) can be exercised locally. Invalid output is
// impossible here because the shape is produced deterministically.

export class AIProviderStub {
  constructor() {
    this.providerId = 'ai';
    this.status = 'mock';
    this.label = 'AI reasoning (stub) — deterministic local placeholder; no external model calls';
    this.capabilities = { list: false, read: true, preview: false, create: true, update: false, move: false, delete: false, commit: false };
  }

  async classify(input) {
    return { label: 'uncategorised', confidence: 0.3, note: 'Local stub classification.' };
  }

  async plan() {
    return { steps: [], note: 'Local stub plan. Connect a real provider for genuine planning.' };
  }

  async reviewSafety(proposedJobs, policy) {
    // Never approve; always defer to the safety evaluator + human approval.
    return { approved: false, note: 'Stub defers all execution to the safety evaluator and explicit approval.' };
  }
}
