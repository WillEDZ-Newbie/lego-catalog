// world-view.js — World directory, immersive World home and Rooms.
// A World owns only its project's content. It cannot alter global routing,
// archive rules, provider configuration or other Atlas infrastructure.

import { esc, formatDate } from '../util.js';

export function renderIndex(_params, state) {
  const active = state.worlds.filter((w) => w.status !== 'archived');
  const archived = state.worlds.filter((w) => w.status === 'archived');
  return `
  <section class="view view--worlds">
    <header class="view__header">
      <h1>Project Worlds</h1>
      <button class="btn btn--primary" data-action="new-world">Propose new World</button>
    </header>
    <div class="world-grid">
      ${active.map((w) => worldCard(w, state)).join('')}
    </div>
    ${archived.length ? `<h2 class="tier-label">Archived</h2><div class="world-grid">${archived.map((w) => worldCard(w, state)).join('')}</div>` : ''}
  </section>`;
}

function worldCard(w, state) {
  const objects = state.objects.filter((o) => o.worldId === w.id).length;
  return `
  <article class="world-card" style="--accent:${esc(w.colorIdentity || '#6fd68a')}">
    <a class="world-card__cover" href="#/world/${esc(w.id)}" data-asset-slot="world-cover">
      <span class="world-card__symbol" aria-hidden="true">${esc(w.symbol || '◇')}</span>
      <span class="badge badge--placeholder">Cover placeholder</span>
    </a>
    <div class="world-card__body">
      <h3><a href="#/world/${esc(w.id)}">${esc(w.name)}</a></h3>
      <p class="muted">${esc(w.description || '')}</p>
      <div class="world-card__meta">
        <span class="tag tag--${esc(w.priority)}">${esc(w.priority)}</span>
        <span class="tag">${esc(w.status)}</span>
        <span class="muted">${esc(objects)} objects</span>
      </div>
    </div>
  </article>`;
}

export function renderWorld(params, state) {
  const w = state.worlds.find((x) => x.id === params.worldId);
  if (!w) return notFound(params.worldId);
  const rooms = state.rooms.filter((r) => r.worldId === w.id);
  const objects = state.objects.filter((o) => o.worldId === w.id);
  const finalCanon = (w.canon || []).filter((c) => c.stage === 'final');
  const draftCanon = (w.canon || []).filter((c) => c.stage !== 'final' && c.stage !== 'superseded');

  return `
  <section class="view view--world" style="--accent:${esc(w.colorIdentity || '#6fd68a')}">
    <header class="world-hero" data-asset-slot="world-background">
      <div class="world-hero__id">
        <span class="world-hero__symbol" aria-hidden="true">${esc(w.symbol || '◇')}</span>
        <div>
          <h1>${esc(w.name)}</h1>
          <p class="muted">${esc(w.description || '')}</p>
        </div>
      </div>
      <div class="world-hero__actions">
        <a class="btn btn--primary" href="#/world/${esc(w.id)}/gallery">Immersive gallery</a>
        <button class="btn" data-action="edit-world" data-id="${esc(w.id)}">Edit</button>
        ${w.status === 'archived'
          ? `<button class="btn" data-action="restore-world" data-id="${esc(w.id)}">Restore</button>`
          : `<button class="btn" data-action="archive-world" data-id="${esc(w.id)}">Archive</button>`}
        <button class="btn btn--danger" data-action="delete-world" data-id="${esc(w.id)}">Delete</button>
      </div>
    </header>

    <div class="world-body">
      <div class="panel">
        <h2 class="panel__title">Control panel</h2>
        <dl class="kv">
          <div><dt>Status</dt><dd>${esc(w.status)}</dd></div>
          <div><dt>Priority</dt><dd>${esc(w.priority)}</dd></div>
          <div><dt>Last action</dt><dd>${esc(w.lastAction || '—')}</dd></div>
          <div><dt>Next action</dt><dd>${esc(w.nextAction || '—')}</dd></div>
          <div><dt>Future action</dt><dd>${esc(w.futureAction || '—')}</dd></div>
          <div><dt>Updated</dt><dd>${esc(formatDate(w.updatedAt))}</dd></div>
        </dl>
      </div>

      <div class="panel">
        <h2 class="panel__title">Canon chamber</h2>
        <div class="row"><button class="btn btn--sm" data-action="add-canon" data-id="${esc(w.id)}">Propose canon change</button></div>
        <h3 class="sub">Final decisions</h3>
        ${finalCanon.length ? `<ul class="list">${finalCanon.map((c) => `<li><span class="tag tag--final">final</span> ${esc(c.title)} — <span class="muted">${esc(c.decision)}</span></li>`).join('')}</ul>` : '<p class="muted">No final decisions yet.</p>'}
        <h3 class="sub">Drafts &amp; proposals</h3>
        ${draftCanon.length ? `<ul class="list">${draftCanon.map((c) => `<li><span class="tag">draft</span> ${esc(c.title)} <button class="btn btn--sm" data-action="finalize-canon" data-world="${esc(w.id)}" data-canon="${esc(c.id)}">Finalize</button></li>`).join('')}</ul>` : '<p class="muted">No drafts.</p>'}
        ${(w.unresolvedQuestions || []).length ? `<h3 class="sub">Unresolved questions</h3><ul class="list">${w.unresolvedQuestions.map((q) => `<li class="muted">${esc(q)}</li>`).join('')}</ul>` : ''}
      </div>

      <div class="panel">
        <h2 class="panel__title">Rooms</h2>
        <div class="row"><button class="btn btn--sm" data-action="add-room" data-id="${esc(w.id)}">Add room</button></div>
        ${rooms.length ? `<ul class="list">${rooms.map((r) => `<li><a href="#/world/${esc(w.id)}/room/${esc(r.id)}">${esc(r.name)}</a> <span class="muted">${esc(r.type)}</span></li>`).join('')}</ul>` : '<p class="muted">No rooms yet.</p>'}
      </div>

      <div class="panel">
        <h2 class="panel__title">Files &amp; objects (${esc(objects.length)})</h2>
        <div class="row"><button class="btn btn--sm" data-action="add-object" data-id="${esc(w.id)}">Add object reference</button></div>
        ${objects.length ? `<ul class="list">${objects.map((o) => `<li><a href="#/object/${esc(o.id)}">${esc(o.title)}</a> <span class="tag tag--mock">${esc(o.provider)}</span> <span class="muted">${esc(o.stage)}</span></li>`).join('')}</ul>` : '<p class="muted">No object references.</p>'}
      </div>

      <div class="panel">
        <h2 class="panel__title">Project search</h2>
        <input class="input" type="search" placeholder="Search within this World…" data-action="world-search" data-world="${esc(w.id)}" aria-label="Search within this World">
        <div id="world-search-results" class="search-results"></div>
      </div>
    </div>
  </section>`;
}

export function renderRoom(params, state) {
  const w = state.worlds.find((x) => x.id === params.worldId);
  const r = state.rooms.find((x) => x.id === params.roomId);
  if (!w || !r) return notFound(params.roomId);
  const objects = state.objects.filter((o) => o.roomId === r.id);
  return `
  <section class="view view--room" style="--accent:${esc(w.colorIdentity || '#6fd68a')}">
    <header class="view__header">
      <p class="crumb"><a href="#/world/${esc(w.id)}">${esc(w.name)}</a> / Room</p>
      <h1>${esc(r.name)}</h1>
      <p class="muted">${esc(r.type)} — ${esc(r.notes || '')}</p>
    </header>
    <div class="panel">
      <h2 class="panel__title">Objects in this room (${esc(objects.length)})</h2>
      <button class="btn btn--sm" data-action="add-object" data-id="${esc(w.id)}" data-room="${esc(r.id)}">Add object</button>
      ${objects.length ? `<ul class="list">${objects.map((o) => `<li><a href="#/object/${esc(o.id)}">${esc(o.title)}</a></li>`).join('')}</ul>` : '<p class="muted">No objects in this room.</p>'}
    </div>
  </section>`;
}

function notFound(id) {
  return `<section class="view"><div class="panel"><h1>Not found</h1><p class="muted">No record for "${esc(id)}".</p><a class="link" href="#/worlds">Back to Worlds</a></div></section>`;
}
