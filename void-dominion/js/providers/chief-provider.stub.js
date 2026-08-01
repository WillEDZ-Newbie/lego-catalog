// chief-provider.stub.js — Chief capture, reasoning and approval interface.
// The browser is not the complete Apple Shortcuts implementation, so this is a
// labelled mock. Capture is persisted locally and reasoning is simulated with a
// transparent heuristic; nothing here pretends a live Shortcuts run occurred.

import { generateId } from '../validation.js';

export class ChiefProviderStub {
  constructor(store) {
    this.id = 'chief';
    this.label = 'Chief (local mock — no live Apple Shortcuts connection)';
    this.mode = 'mock';
    this.status = 'mock';
    this.writeCapability = 'none';
    this.store = store;
  }

  // Persist a captured item onto the Chief queue (local metadata only).
  async capture(input) {
    const chief = this.store.getChief();
    const item = {
      id: generateId('capture'),
      text: String(input || '').slice(0, 2000),
      capturedAt: new Date().toISOString(),
      level: this._suggestLevel(input),
      status: 'queued'
    };
    const queue = [...(chief.queue || []), item];
    await this.store.updateChief({ queue });
    return { ok: true, providerConfirmed: true, item, note: 'Captured locally in mock Chief queue.' };
  }

  async getQueue() {
    return this.store.getChief().queue || [];
  }

  // Transparent heuristic for reasoning depth: complexity/risk/consequence words.
  _suggestLevel(input) {
    const t = String(input || '').toLowerCase();
    const oracle = ['decision', 'redesign', 'legal', 'medical', 'major', 'long-term', 'strategy overhaul'];
    const strategy = ['plan', 'schedule', 'travel', 'finance', 'conflict', 'weekly', 'sequence'];
    if (oracle.some(w => t.includes(w))) return 'oracle';
    if (strategy.some(w => t.includes(w))) return 'strategy';
    return 'brain';
  }

  async requestReasoning(job, level) {
    const chosen = level || this._suggestLevel(job && job.text);
    return {
      ok: true,
      providerConfirmed: true,
      level: chosen,
      recommendation: `[mock ${chosen}] Reviewed "${(job && job.text) || ''}". This is a simulated reasoning result — no live model or Shortcuts run was performed.`,
      requiresApproval: chosen !== 'brain'
    };
  }
}
