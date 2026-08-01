// activity-timeline.js — auditable system activity.
// Append-oriented audit log with actor, timestamp, result and before/after.

import { esc, formatDate } from '../util.js';

export function render(_params, state) {
  const items = state.activity.slice(0, 200);
  return `
  <section class="view view--activity">
    <header class="view__header">
      <h1>Activity</h1>
      <p class="muted">Auditable record of important mutations. Append-oriented; protected from casual editing.</p>
    </header>
    <div class="panel">
      <ul class="timeline">
        ${items.map((a) => `<li class="timeline__item timeline__item--${esc(a.result)}">
          <div class="timeline__meta">
            <span class="timeline__type">${esc(a.type)}</span>
            <span class="tag tag--${a.result === 'success' ? 'low' : a.result === 'failure' ? 'high' : 'mock'}">${esc(a.result)}</span>
            <span class="timeline__actor">${esc(a.actor)}</span>
            <span class="timeline__time">${esc(formatDate(a.timestamp))}</span>
          </div>
          <div class="timeline__summary">${esc(a.summary)}</div>
          ${a.entityId ? `<div class="muted mono">${esc(a.entityType)}:${esc(a.entityId)}</div>` : ''}
        </li>`).join('') || '<li class="muted">No activity yet.</li>'}
      </ul>
    </div>
  </section>`;
}
