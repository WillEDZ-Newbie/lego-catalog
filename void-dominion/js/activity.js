// activity.js — activity/decision audit helpers.
// Recording lives in store.addActivity(); this module provides read-side
// helpers: labels, grouping and filtering for the timeline views.

export const RESULT_LABEL = {
  success: 'Success',
  failure: 'Failure',
  partial: 'Partial'
};

export function describeActivity(entry) {
  const when = entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '';
  return `${when} — ${entry.actor} — ${entry.summary || entry.type}`;
}

export function filterActivity(activity, { entityId, actor, result, type } = {}) {
  return activity.filter(a =>
    (!entityId || a.entityId === entityId) &&
    (!actor || a.actor === actor) &&
    (!result || a.result === result) &&
    (!type || a.type.startsWith(type))
  );
}

// The most recent meaningful activity for the Nexus "resume" panel.
export function lastMeaningful(activity) {
  return activity.find(a => a.result !== 'failure' && !a.type.endsWith('.blocked')) || activity[0] || null;
}
