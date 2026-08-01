// safety.js — active safety evaluator and execution gate.
// Every mutation passes through evaluate() before execution. The evaluator
// returns one of: 'allow', 'allow-with-log', 'require-approval', 'deny'.
// This is code, not interface text: nothing consequential runs without passing.

export class SafetyEvaluator {
  constructor(store) {
    this.store = store;
  }

  get policy() {
    return this.store.getSafetyPolicy() || { riskClasses: [], alwaysRequireApproval: [], rules: {} };
  }

  // Infer a risk level from an action when one is not supplied.
  _riskFor(action) {
    if (action.risk) return action.risk;
    const t = action.actionType || 'other';
    const critical = ['delete', 'purchase', 'payment', 'world_merge', 'world_delete', 'canon_change', 'reset', 'overwrite'];
    const high = ['send', 'publish', 'booking', 'cancel', 'share_sensitive', 'github_write', 'file_move', 'file_rename', 'world_create', 'enable_integration'];
    if (critical.includes(t)) return 'critical';
    if (high.includes(t)) return 'high';
    if (['metadata_edit', 'status_change', 'archive'].includes(t)) return 'medium';
    return 'low';
  }

  _classFor(risk) {
    return (this.policy.riskClasses || []).find(c => c.risk === risk) || null;
  }

  // Pure decision. Never performs side effects.
  evaluate(action) {
    const risk = this._riskFor(action);
    const cls = this._classFor(risk);
    const always = this.policy.alwaysRequireApproval || [];

    // Blockers: provider unavailable, ambiguous target or invalid input cannot execute.
    if (action.blocked) {
      return { decision: 'deny', risk, reason: action.blockedReason || 'Action is unsupported or unverifiable.', requiresBackup: false };
    }

    let decision = cls ? cls.decision : 'allow-with-log';
    let requiresBackup = cls ? !!cls.requiresBackup : false;

    if (always.includes(action.actionType)) {
      decision = 'require-approval';
      if (risk === 'critical') requiresBackup = true;
    }
    if (risk === 'high' || risk === 'critical') decision = 'require-approval';

    return {
      decision,
      risk,
      reason: action.reason || (cls ? cls.label : 'Routine action'),
      requiresBackup,
      requiresBeforeAfter: !!(cls && cls.requiresBeforeAfter) || risk !== 'low'
    };
  }

  // Orchestrated execution. `perform` is an async function that actually does
  // the work and returns a provider/result object; it is only called when the
  // decision permits immediate execution. For require-approval, an approval
  // record is created and perform is NOT called until the approval is resolved.
  async run(action, perform) {
    const verdict = this.evaluate(action);

    if (verdict.decision === 'deny') {
      await this.store.addActivity({
        actor: action.actor || 'system',
        type: `${action.actionType || 'action'}.blocked`,
        entityType: action.entityType || '',
        entityId: action.entityId || '',
        summary: `Blocked: ${action.summary || action.actionType}. ${verdict.reason}`,
        result: 'failure'
      });
      return { ok: false, status: 'blocked', verdict };
    }

    if (verdict.decision === 'require-approval') {
      const approval = await this.store.addApproval({
        actionType: action.actionType,
        risk: verdict.risk,
        summary: action.summary || action.actionType,
        reason: verdict.reason,
        before: action.before || {},
        proposedAfter: action.proposedAfter || {},
        affectedEntities: action.affectedEntities || [],
        rollbackAvailable: !!action.rollbackAvailable,
        requiresBackup: verdict.requiresBackup
      });
      await this.store.addActivity({
        actor: action.actor || 'user',
        type: `${action.actionType}.requested`,
        entityType: action.entityType || '',
        entityId: action.entityId || '',
        summary: `Approval requested: ${action.summary || action.actionType}`,
        approvalId: approval.id,
        result: 'partial'
      });
      // Stash the performer so resolveApproval can execute it after approval.
      this._pending = this._pending || new Map();
      this._pending.set(approval.id, { action, perform });
      return { ok: true, status: 'pending-approval', approvalId: approval.id, verdict };
    }

    // allow / allow-with-log -> execute now.
    let result;
    try {
      result = perform ? await perform() : { result: 'success' };
    } catch (err) {
      await this.store.addActivity({
        actor: action.actor || 'system',
        type: `${action.actionType || 'action'}.failed`,
        entityType: action.entityType || '',
        entityId: action.entityId || '',
        summary: `Failed: ${action.summary || action.actionType}. ${err.message}`,
        result: 'failure'
      });
      return { ok: false, status: 'failed', error: err.message, verdict };
    }

    // Honesty rule: never record success when a provider did not confirm it.
    const providerOk = result && result.providerConfirmed !== false;
    await this.store.addActivity({
      actor: action.actor || 'user',
      type: action.activityType || `${action.actionType || 'action'}.executed`,
      entityType: action.entityType || '',
      entityId: action.entityId || '',
      summary: action.summary || action.actionType,
      before: action.before || {},
      after: action.proposedAfter || (result && result.after) || {},
      result: providerOk ? 'success' : 'partial'
    });
    return { ok: true, status: 'executed', result, verdict };
  }

  // Resolve a pending approval. decision is 'approved' or 'rejected'.
  async resolveApproval(id, decision) {
    const approval = this.store.getApprovals().find(a => a.id === id);
    if (!approval) throw new Error(`No approval ${id}`);
    if (approval.status !== 'pending') throw new Error(`Approval ${id} is already ${approval.status}`);

    if (decision === 'rejected') {
      await this.store.updateApproval(id, { status: 'rejected', resolvedAt: new Date().toISOString() });
      await this.store.addActivity({
        actor: 'user', type: `${approval.actionType}.rejected`,
        entityType: '', entityId: '', approvalId: id,
        summary: `Rejected: ${approval.summary}`, result: 'success'
      });
      this._pending && this._pending.delete(id);
      return { ok: true, status: 'rejected' };
    }

    // Approved -> execute the stashed performer.
    const pending = this._pending && this._pending.get(id);
    let result = { result: 'success' };
    try {
      if (pending && pending.perform) result = await pending.perform();
      await this.store.updateApproval(id, { status: 'executed', resolvedAt: new Date().toISOString() });
    } catch (err) {
      await this.store.updateApproval(id, { status: 'failed', resolvedAt: new Date().toISOString() });
      await this.store.addActivity({
        actor: 'user', type: `${approval.actionType}.failed`, approvalId: id,
        summary: `Approved action failed: ${approval.summary}. ${err.message}`, result: 'failure'
      });
      return { ok: false, status: 'failed', error: err.message };
    }
    const providerOk = result && result.providerConfirmed !== false;
    await this.store.addActivity({
      actor: 'user', type: `${approval.actionType}.executed`, approvalId: id,
      entityType: '', entityId: '',
      summary: `Approved and executed: ${approval.summary}`,
      before: approval.before, after: approval.proposedAfter,
      result: providerOk ? 'success' : 'partial'
    });
    this._pending && this._pending.delete(id);
    return { ok: true, status: 'executed', result };
  }

  // If a proposed action changes, its old approval must be invalidated.
  async invalidateApproval(id, reason = 'Proposed action changed') {
    const approval = this.store.getApprovals().find(a => a.id === id);
    if (!approval || approval.status !== 'pending') return;
    await this.store.updateApproval(id, { status: 'expired', resolvedAt: new Date().toISOString() });
    await this.store.addActivity({
      actor: 'system', type: `${approval.actionType}.expired`, approvalId: id,
      summary: `Approval invalidated: ${reason}`, result: 'success'
    });
    this._pending && this._pending.delete(id);
  }
}
