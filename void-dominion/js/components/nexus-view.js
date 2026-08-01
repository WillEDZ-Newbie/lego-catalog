// nexus-view.js — central operating centre.
// Practical before decorative. Answers: What changed? What matters now?
// What should Yordan do next? What requires approval?

import { esc, formatDate } from '../util.js';

export function render(_params, state) {
  const pending = state.approvals.filter((a) => a.status === 'pending');
  const recent = state.activity.slice(0, 8);
  const attention = state.worlds.filter((w) => w.status === 'blocked' || (w.blockers && w.blockers.length));
  const stale = state.worlds.filter((w) => w.status === 'active' && !w.nextAction);
  const priorityWorld = state.worlds.find((w) => w.priority === 'high' && w.status === 'active');

  const providers = state.settings.providers || [];
  const providerHealth = providers.map((p) => `
    <li class="dot-row">
      <span class="dot dot--${p.status === 'connected' ? 'ok' : p.status === 'mock' ? 'warn' : 'bad'}" aria-hidden="true"></span>
      <span>${esc(p.providerId)}</span>
      <span class="muted">${esc(p.status)}</span>
    </li>`).join('');

  return `
  <section class="view view--nexus">
    <header class="view__header">
      <h1>Nexus</h1>
      <p class="muted">Central convergence point and operating centre.</p>
    </header>

    <div class="nexus-grid">
      <div class="panel panel--focus">
        <h2 class="panel__title">Current priority &amp; next action</h2>
        ${priorityWorld ? `
          <p class="lead"><a href="#/world/${esc(priorityWorld.id)}">${esc(priorityWorld.name)}</a></p>
          <p><strong>Next:</strong> ${esc(priorityWorld.nextAction || 'Not set')}</p>
          <p class="muted"><strong>Future:</strong> ${esc(priorityWorld.futureAction || '—')}</p>
        ` : `<p class="muted">No high-priority active World.</p>`}
        <div class="row">
          <button class="btn btn--primary" data-action="quick-capture">Quick capture</button>
          ${recent[0] ? `<a class="btn" href="${esc(routeForActivity(recent[0]))}">Resume last activity</a>` : ''}
        </div>
      </div>

      <div class="panel">
        <h2 class="panel__title">Pending approvals (${esc(pending.length)})</h2>
        ${pending.length ? `<ul class="list">
          ${pending.slice(0, 5).map((a) => `<li>
            <a href="#/approvals">${esc(a.summary)}</a>
            <span class="tag tag--${esc(a.risk)}">${esc(a.risk)}</span>
          </li>`).join('')}
        </ul>` : `<p class="muted">Nothing awaiting approval.</p>`}
      </div>

      <div class="panel">
        <h2 class="panel__title">Worlds requiring attention</h2>
        ${attention.length ? `<ul class="list">${attention.map((w) => `<li><a href="#/world/${esc(w.id)}">${esc(w.name)}</a> <span class="tag tag--high">blocked</span></li>`).join('')}</ul>` : ''}
        ${stale.length ? `<p class="muted">Stale (no next action): ${stale.map((w) => `<a href="#/world/${esc(w.id)}">${esc(w.name)}</a>`).join(', ')}</p>` : ''}
        ${!attention.length && !stale.length ? `<p class="muted">All active Worlds have a next action.</p>` : ''}
      </div>

      <div class="panel">
        <h2 class="panel__title">Recent activity</h2>
        <ul class="timeline timeline--compact">
          ${recent.map((a) => `<li>
            <span class="timeline__type">${esc(a.type)}</span>
            <span class="timeline__summary">${esc(a.summary)}</span>
            <span class="timeline__time">${esc(formatDate(a.timestamp))}</span>
          </li>`).join('')}
        </ul>
        <a class="link" href="#/activity">Full activity log →</a>
      </div>

      <div class="panel">
        <h2 class="panel__title">Chief status &amp; queue</h2>
        <p><span class="tag tag--mock">${esc(state.chief.status.label)}</span></p>
        <p class="muted">Queued items: ${esc(state.chiefJobs.filter((j) => j.status === 'queued').length)}</p>
        <a class="link" href="#/location/machine-oracle">Open Machine Oracle →</a>
      </div>

      <div class="panel">
        <h2 class="panel__title">Storage &amp; provider health</h2>
        <ul class="list list--dots">${providerHealth}</ul>
        <a class="link" href="#/location/leviathan-spine">Diagnostics →</a>
      </div>
    </div>
  </section>`;
}

function routeForActivity(a) {
  if (a.entityType === 'world' && a.entityId) return `#/world/${a.entityId}`;
  if (a.entityType === 'object' && a.entityId) return `#/object/${a.entityId}`;
  return '#/activity';
}
