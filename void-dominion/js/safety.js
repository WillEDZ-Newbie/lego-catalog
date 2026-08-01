// safety.js — risk classification, approval rules and execution gates.
// Implements the safety evaluator required by the brief (§12, §25, §39):
// every mutation must pass through evaluate() before execution. The evaluator
// returns one of: allow | allow-with-log | require-approval | deny.
//
// Pure logic (no DOM / storage) so it is unit-testable in Node.

export const DECISIONS = {
  ALLOW: 'allow',
  ALLOW_WITH_LOG: 'allow-with-log',
  REQUIRE_APPROVAL: 'require-approval',
  DENY: 'deny',
};

// Normalise the various risk vocabularies to a canonical scale.
function normaliseRisk(risk) {
  if (risk === 'medium') return 'moderate';
  return risk;
}

// Classify an action type into a risk level using the policy.
export function classify(actionType, policy) {
  const map = (policy && policy.actionRisk) || {};
  return normaliseRisk(map[actionType] || 'moderate');
}

// Evaluate a proposed action.
// action: { type, actor, entityType, entityId, context }
// policy: safety-policy.json contents
// providerState: optional { [providerId]: { status, capabilities } }
//
// Returns: { decision, risk, requiresApproval, backupFirst, reason }
export function evaluate(action, policy, providerState = {}) {
  const type = action && action.type;
  if (!type) {
    return {
      decision: DECISIONS.DENY,
      risk: 'critical',
      requiresApproval: false,
      backupFirst: false,
      reason: 'No action type supplied; cannot evaluate safety.',
    };
  }

  const risk = classify(type, policy);
  const riskClass = (policy && policy.riskClasses && policy.riskClasses[risk]) || {};

  // Unsupported / unverifiable: provider missing or read-only for a write.
  const providerId = action.context && action.context.provider;
  if (providerId && providerState[providerId]) {
    const ps = providerState[providerId];
    const writeIntent = /\.(create|update|move|delete|write|commit)$|^file\.|^message\.|purchase|booking/.test(type);
    if (writeIntent) {
      const caps = ps.capabilities || {};
      const canWrite = caps.create || caps.update || caps.move || caps.delete || caps.commit;
      if (ps.status === 'mock' || ps.status === 'unavailable' || ps.status === 'disconnected' || !canWrite) {
        return {
          decision: DECISIONS.DENY,
          risk,
          requiresApproval: false,
          backupFirst: false,
          reason: `Provider "${providerId}" cannot perform "${type}" (status: ${ps.status}). ` +
            'The action is preserved as a proposal rather than executed.',
        };
      }
    }
  }

  const requiresApproval = !!riskClass.requiresApproval;
  const backupFirst = !!riskClass.backupFirst;

  let decision;
  if (requiresApproval) {
    decision = DECISIONS.REQUIRE_APPROVAL;
  } else if (risk === 'low') {
    decision = DECISIONS.ALLOW_WITH_LOG;
  } else {
    decision = DECISIONS.ALLOW_WITH_LOG;
  }

  return {
    decision,
    risk,
    requiresApproval,
    backupFirst,
    reason: riskClass.label
      ? `Classified as ${risk} (${riskClass.label}).`
      : `Classified as ${risk}.`,
  };
}

// Build an approval request object from a proposed action + evaluation.
export function buildApprovalRequest(action, evaluation, { makeId, now }) {
  return {
    schemaVersion: '1.0',
    id: makeId('approval'),
    actionType: mapToApprovalActionType(action.type),
    risk: evaluation.risk,
    summary: action.summary || `Proposed ${action.type}`,
    reason: action.reason || evaluation.reason,
    before: action.before || {},
    proposedAfter: action.proposedAfter || {},
    affectedEntities: action.affectedEntities || (action.entityId ? [action.entityId] : []),
    rollbackAvailable: action.rollbackAvailable !== undefined ? action.rollbackAvailable : !evaluation.backupFirst ? true : false,
    backupFirst: evaluation.backupFirst,
    status: 'pending',
    createdAt: now(),
    resolvedAt: null,
    // Preserve the original proposed action so it can be executed on approval.
    _action: action,
  };
}

function mapToApprovalActionType(type) {
  if (/delete/.test(type)) return 'delete';
  if (/move|rename/.test(type)) return 'move';
  if (/message|send/.test(type)) return 'send';
  if (/purchase|payment/.test(type)) return 'purchase';
  if (/booking|book/.test(type)) return 'book';
  if (/canon/.test(type)) return 'canon_change';
  return 'other';
}
