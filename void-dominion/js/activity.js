// activity.js — activity and decision audit recording.
// Builds append-oriented audit records (§37: audit state is append-oriented
// and protected from casual editing). The central store owns persistence.

import { makeId, now } from './util.js';

// Build an activity record. Pure builder — no side effects.
export function makeActivity({
  actor = 'system',
  type,
  entityType = '',
  entityId = '',
  summary = '',
  before = {},
  after = {},
  approvalId = null,
  result = 'success',
} = {}) {
  return {
    schemaVersion: '1.0',
    id: makeId('activity'),
    actor,
    type,
    entityType,
    entityId,
    summary,
    before,
    after,
    approvalId,
    result,
    timestamp: now(),
  };
}
