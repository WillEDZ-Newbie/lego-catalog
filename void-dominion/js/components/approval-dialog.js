// approval-dialog.js — pending consequential actions view.
// Each request shows exactly what will happen, affected entities, whether it is
// reversible and separate Approve/Reject controls. Opening or ignoring a
// request never counts as approval (§25.2).

import { esc, formatDate } from '../util.js';

export function render(_params, state) {
  const pending = state.approvals.filter((a) => a.status === 'pending');
  const resolved = state.approvals.filter((a) => a.status !== 'pending').slice(0, 20);

  return `
  <section class="view view--approvals">
    <header class="view__header">
      <h1>Approvals</h1>
      <p class="muted">Consequential and destructive actions require explicit approval immediately before execution.</p>
    </header>

    <div class="panel">
      <h2 class="panel__title">Pending (${esc(pending.length)})</h2>
      ${pending.length ? pending.map((a) => card(a)).join('') : '<p class="muted">Nothing awaiting approval.</p>'}
    </div>

    <div class="panel">
      <h2 class="panel__title">History</h2>
      ${resolved.length ? `<ul class="list">${resolved.map((a) => `<li>
        <span class="tag tag--${esc(a.status === 'executed' ? 'final' : a.status === 'rejected' ? 'high' : 'mock')}">${esc(a.status)}</span>
        ${esc(a.summary)} <span class="muted">${esc(formatDate(a.resolvedAt))}</span>
      </li>`).join('')}</ul>` : '<p class="muted">No resolved approvals yet.</p>'}
    </div>
  </section>`;
}

function card(a) {
  const affected = (a.affectedEntities || []).map((e) => `<code>${esc(e)}</code>`).join(', ') || '—';
  return `
  <article class="approval">
    <div class="approval__head">
      <span class="tag tag--${esc(a.risk)}">${esc(a.risk)}</span>
      <h3>${esc(a.summary)}</h3>
    </div>
    <p>${esc(a.reason)}</p>
    <dl class="kv kv--tight">
      <div><dt>Action type</dt><dd>${esc(a.actionType)}</dd></div>
      <div><dt>Affected</dt><dd>${affected}</dd></div>
      <div><dt>Reversible</dt><dd>${a.rollbackAvailable ? 'Yes' : 'No'}</dd></div>
      ${a.backupFirst ? '<div><dt>Backup</dt><dd>A snapshot is taken before execution.</dd></div>' : ''}
      <div><dt>Requested</dt><dd>${esc(formatDate(a.createdAt))}</dd></div>
    </dl>
    <div class="row">
      <button class="btn btn--danger" data-action="reject-approval" data-id="${esc(a.id)}">Reject</button>
      <button class="btn btn--primary" data-action="approve-approval" data-id="${esc(a.id)}">Approve &amp; execute</button>
    </div>
  </article>`;
}
