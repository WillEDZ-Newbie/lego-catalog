// location-view.js — one permanent Location and its infrastructure interface.
// The nine Locations provide system infrastructure for the entire environment,
// including Void Dominion itself. Each renders a real functional interface, not
// a themed placeholder page.

import { esc, formatDate } from '../util.js';
import { renderStorageStatus } from './storage-status.js';
import { render as renderSettings } from './settings-view.js';

export function render(params, state) {
  const loc = state.locations.find((l) => l.id === params.locationId);
  if (!loc) return notFound(params.locationId);

  const header = `
    <header class="view__header view__header--location" style="--accent:${esc(loc.theme && loc.theme.accent || '#6fd68a')}">
      <span class="loc-index">${esc(loc.index)}</span>
      <div>
        <h1>${esc(loc.name)}</h1>
        <p class="muted">${esc(loc.function)}</p>
      </div>
    </header>
    <p class="callout callout--boundary">Must not become: ${esc(loc.mustNotBecome)}</p>`;

  return `<section class="view view--location">${header}${bodyFor(loc, state)}</section>`;
}

function bodyFor(loc, state) {
  switch (loc.id) {
    case 'machine-oracle': return machineOracle(state);
    case 'memory-vault': return memoryVault(state);
    case 'astral-greenhouse': return astralGreenhouse(state);
    case 'throne-reactor': return `<div class="panel">${renderSettings({}, state)}</div>`;
    case 'void-railway': return voidRailway(state);
    case 'observatory': return observatory(state);
    case 'cosmic-aquarium': return cosmicAquarium(state);
    case 'leviathan-spine': return leviathanSpine(state);
    case 'eclipse-monastery': return eclipseMonastery(state);
    default: return `<div class="panel"><p>${esc(loc.responsibility)}</p></div>`;
  }
}

function machineOracle(state) {
  const pending = state.approvals.filter((a) => a.status === 'pending');
  const decisions = state.activity.filter((a) => /approval|canon/.test(a.type)).slice(0, 10);
  const levels = (state.chief.reasoningLevels || []);
  return `
    <div class="panel">
      <h2 class="panel__title">Chief status</h2>
      <p><span class="tag tag--mock">${esc(state.chief.status.label)}</span></p>
      <button class="btn btn--primary" data-action="quick-capture">Send to Chief (capture)</button>
    </div>
    <div class="panel">
      <h2 class="panel__title">Reasoning depth</h2>
      <ul class="list">${levels.map((l) => `<li><strong>${esc(l.label)}</strong> — <span class="muted">${esc(l.use)}</span></li>`).join('')}</ul>
    </div>
    <div class="panel">
      <h2 class="panel__title">Pending approvals (${esc(pending.length)})</h2>
      ${pending.length ? `<ul class="list">${pending.map((a) => `<li><a href="#/approvals">${esc(a.summary)}</a> <span class="tag tag--${esc(a.risk)}">${esc(a.risk)}</span></li>`).join('')}</ul>` : '<p class="muted">None.</p>'}
    </div>
    <div class="panel">
      <h2 class="panel__title">Decision history</h2>
      <ul class="timeline timeline--compact">${decisions.map((a) => `<li><span class="timeline__type">${esc(a.type)}</span><span class="timeline__summary">${esc(a.summary)}</span><span class="timeline__time">${esc(formatDate(a.timestamp))}</span></li>`).join('') || '<li class="muted">No decisions recorded yet.</li>'}</ul>
    </div>`;
}

function memoryVault(state) {
  const archivedWorlds = state.worlds.filter((w) => w.status === 'archived');
  const superseded = state.worlds.flatMap((w) => (w.canon || []).filter((c) => c.stage === 'superseded').map((c) => ({ ...c, world: w.name })));
  const backups = state.backups || [];
  return `
    <div class="panel">
      <h2 class="panel__title">Archived Worlds (${esc(archivedWorlds.length)})</h2>
      ${archivedWorlds.length ? `<ul class="list">${archivedWorlds.map((w) => `<li><a href="#/world/${esc(w.id)}">${esc(w.name)}</a> <button class="btn btn--sm" data-action="restore-world" data-id="${esc(w.id)}">Restore</button></li>`).join('')}</ul>` : '<p class="muted">No archived Worlds. Archive precedes deletion wherever practical.</p>'}
    </div>
    <div class="panel">
      <h2 class="panel__title">Superseded decisions</h2>
      ${superseded.length ? `<ul class="list">${superseded.map((c) => `<li>${esc(c.world)}: ${esc(c.title)}</li>`).join('')}</ul>` : '<p class="muted">None.</p>'}
    </div>
    <div class="panel">
      <h2 class="panel__title">Backups &amp; restore</h2>
      <div class="row"><button class="btn" data-action="create-backup">Create backup snapshot</button></div>
      ${backups.length ? `<ul class="list">${backups.map((b) => `<li>${esc(formatDate(b.createdAt))} — ${esc(b.reason)} <button class="btn btn--sm" data-action="restore-backup" data-id="${esc(b.id)}">Restore</button></li>`).join('')}</ul>` : '<p class="muted">No backups yet.</p>'}
    </div>`;
}

function astralGreenhouse(state) {
  const candidates = state.objects.filter((o) => o.type === 'image' || o.stage === 'draft');
  return `
    <div class="panel">
      <h2 class="panel__title">Cross-World visual discovery</h2>
      <p class="muted">References assets across Worlds. Each World still owns its own immersive gallery.</p>
      <div class="gallery-grid">
        ${candidates.map((o) => {
          const world = state.worlds.find((w) => w.id === o.worldId);
          return `<a class="tile" href="#/object/${esc(o.id)}">
            <span class="tile__thumb" data-asset-slot="thumb"><span class="badge badge--placeholder">${esc(o.type)}</span></span>
            <span class="tile__title">${esc(o.title)}</span>
            <span class="tile__meta">${esc(world ? world.name : 'Unknown World')} · ${esc(o.stage)}</span>
          </a>`;
        }).join('') || '<p class="muted">No asset candidates yet.</p>'}
      </div>
    </div>`;
}

function voidRailway(state) {
  const worlds = state.worlds.filter((w) => w.status !== 'archived');
  return `
    <div class="panel">
      <h2 class="panel__title">World directory</h2>
      <ul class="list">${worlds.map((w) => `<li><a href="#/world/${esc(w.id)}">${esc(w.symbol || '◇')} ${esc(w.name)}</a> <span class="muted">${esc(w.priority)}</span></li>`).join('')}</ul>
      <button class="btn btn--primary" data-action="new-world">Propose new World</button>
      <p class="muted">World creation is a proposal that requires explicit approval before a World is created.</p>
    </div>`;
}

function observatory(state) {
  const byStatus = groupCount(state.worlds, 'status');
  const byPriority = groupCount(state.worlds, 'priority');
  const stale = state.worlds.filter((w) => w.status === 'active' && !w.nextAction);
  return `
    <div class="panel">
      <h2 class="panel__title">Project inventory</h2>
      <dl class="kv">
        <div><dt>Total Worlds</dt><dd>${esc(state.worlds.length)}</dd></div>
        <div><dt>By status</dt><dd>${esc(JSON.stringify(byStatus))}</dd></div>
        <div><dt>By priority</dt><dd>${esc(JSON.stringify(byPriority))}</dd></div>
        <div><dt>Objects</dt><dd>${esc(state.objects.length)}</dd></div>
        <div><dt>Activity records</dt><dd>${esc(state.activity.length)}</dd></div>
      </dl>
    </div>
    <div class="panel">
      <h2 class="panel__title">Risks, blockers &amp; stale work</h2>
      ${stale.length ? `<ul class="list">${stale.map((w) => `<li><a href="#/world/${esc(w.id)}">${esc(w.name)}</a> — no next action</li>`).join('')}</ul>` : '<p class="muted">No stale active Worlds.</p>'}
    </div>`;
}

function cosmicAquarium(state) {
  const media = state.objects.filter((o) => o.type === 'video' || o.type === 'audio');
  const unplaced = media.filter((o) => !o.worldId);
  return `
    <div class="panel">
      <h2 class="panel__title">Media index</h2>
      ${media.length ? `<ul class="list">${media.map((o) => `<li><a href="#/object/${esc(o.id)}">${esc(o.title)}</a> <span class="muted">${esc(o.type)}</span></li>`).join('')}</ul>` : '<p class="muted">No media indexed. This Location holds media that has no correct dedicated World yet.</p>'}
    </div>
    <div class="panel">
      <h2 class="panel__title">Unplaced media queue (${esc(unplaced.length)})</h2>
      <p class="muted">Reassignment into a correct World preserves original provenance.</p>
    </div>`;
}

function leviathanSpine(state) {
  return `
    ${renderStorageStatus(state)}
    <div class="panel">
      <h2 class="panel__title">Diagnostics</h2>
      <div class="row">
        <button class="btn" data-action="run-validation">Run validation</button>
        <button class="btn" data-action="create-backup">Create backup</button>
        <button class="btn" data-action="export-data">Export metadata</button>
        <button class="btn" data-action="import-data">Import metadata</button>
      </div>
      <div id="diagnostics-output" class="code-out" aria-live="polite"></div>
    </div>`;
}

function eclipseMonastery(state) {
  return `
    <div class="panel">
      <h2 class="panel__title">Life structures &amp; personal development</h2>
      <p class="muted">Personal systems, reflection, routines and development plans. This Location organises records and questions; it must not diagnose, prescribe or override medical advice.</p>
      <div class="focal focal--sm" data-asset-slot="monastery" aria-label="Eclipse Monastery environment placeholder">
        <span class="badge badge--placeholder">Environment placeholder</span>
      </div>
    </div>`;
}

function groupCount(list, key) {
  const out = {};
  for (const item of list) out[item[key]] = (out[item[key]] || 0) + 1;
  return out;
}

function notFound(id) {
  return `<section class="view"><div class="panel"><h1>Location not found</h1><p class="muted">No permanent Location with id "${esc(id)}". There are exactly nine.</p><a class="link" href="#/atlas">Back to Atlas</a></div></section>`;
}
