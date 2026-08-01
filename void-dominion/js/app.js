// app.js — application bootstrap and interaction wiring.
// Loads seed data, initialises persistence + providers, mounts the shell,
// defines routes and wires global event delegation.

import { on } from './events.js';
import { createIndexedDBAdapter, createMemoryAdapter } from './persistence.js';
import * as store from './store.js';
import { actions, getState } from './store.js';
import { detectConflicts } from './source-resolver.js';
import { validateDataset } from './validation.js';
import { exportToBlob, previewImport } from './import-export.js';
import { esc, makeId, now } from './util.js';
import { initUI, openModal, confirmDialog, toast } from './ui.js';
import * as router from './router.js';

import { register } from './providers/provider-registry.js';
import { LocalProvider } from './providers/local-provider.js';
import { ICloudProviderStub } from './providers/icloud-provider.stub.js';
import { GithubProviderStub } from './providers/github-provider.stub.js';
import { ChiefProviderStub } from './providers/chief-provider.stub.js';
import { AIProviderStub } from './providers/ai-provider.stub.js';

import { renderNav, renderStatusStrip } from './components/app-shell.js';
import * as dominionHome from './components/dominion-home.js';
import * as atlasView from './components/atlas-view.js';
import * as nexusView from './components/nexus-view.js';
import * as locationView from './components/location-view.js';
import * as worldView from './components/world-view.js';
import * as worldGallery from './components/world-gallery.js';
import * as objectViewer from './components/object-viewer.js';
import * as approvalsView from './components/approval-dialog.js';
import * as activityView from './components/activity-timeline.js';
import * as settingsView from './components/settings-view.js';
import { openCommandBar } from './components/command-bar.js';
import { buildIndex, query } from './search.js';

const els = {};
let currentRender = null;

async function loadSeed() {
  // Standalone single-file build embeds the seed on window.__VD_SEED__ so the
  // app runs with no server and no fetch. Hosted build fetches the JSON files.
  if (typeof window !== 'undefined' && window.__VD_SEED__) return window.__VD_SEED__;
  const files = ['system', 'settings', 'safety-policy', 'locations', 'worlds', 'rooms', 'objects', 'sources', 'activity', 'chief'];
  const loaded = {};
  await Promise.all(files.map(async (f) => {
    const res = await fetch(`data/${f}.json`);
    if (!res.ok) throw new Error(`Failed to load data/${f}.json (${res.status})`);
    loaded[f] = await res.json();
  }));
  return {
    system: loaded.system,
    settings: loaded.settings,
    safetyPolicy: loaded['safety-policy'],
    locations: loaded.locations,
    worlds: loaded.worlds,
    rooms: loaded.rooms,
    objects: loaded.objects,
    sources: loaded.sources,
    activity: loaded.activity,
    chief: loaded.chief,
  };
}

function registerProviders() {
  register(new LocalProvider());
  register(new ICloudProviderStub());
  register(new GithubProviderStub());
  register(new ChiefProviderStub());
  register(new AIProviderStub());
}

function defineRoutes() {
  router.defineRoute('#/dominion', dominionHome.render);
  router.defineRoute('#/atlas', atlasView.render);
  router.defineRoute('#/nexus', nexusView.render);
  router.defineRoute('#/worlds', worldView.renderIndex);
  router.defineRoute('#/world/:worldId', worldView.renderWorld);
  router.defineRoute('#/world/:worldId/gallery', worldGallery.render);
  router.defineRoute('#/world/:worldId/room/:roomId', worldView.renderRoom);
  router.defineRoute('#/location/:locationId', locationView.render);
  router.defineRoute('#/object/:objectId', objectViewer.render);
  router.defineRoute('#/approvals', approvalsView.render);
  router.defineRoute('#/activity', activityView.render);
  router.defineRoute('#/settings', settingsView.render);
}

function renderView(match) {
  const state = getState();
  const hash = match.hash || window.location.hash;
  els.nav.innerHTML = renderNav(state, hash);
  els.status.innerHTML = renderStatusStrip(state);

  if (match.notFound || !match.route) {
    els.view.innerHTML = `<section class="view"><div class="panel"><h1>Route not found</h1><a class="link" href="#/dominion">Return to Void Dominion</a></div></section>`;
    return;
  }
  currentRender = () => renderView({ ...match, hash: window.location.hash });
  els.view.innerHTML = match.route.handler(match.params, state);
  els.view.focus();
  document.title = `Void Dominion — ${hash.replace('#/', '') || 'home'}`;
}

function rerender() {
  if (currentRender) currentRender();
}

// ---- action handlers ----------------------------------------------------

const handlers = {
  'open-command-bar': () => openCommandBar(getState()),
  'new-world': () => formNewWorld(),
  'edit-world': (el) => formEditWorld(el.dataset.id),
  'archive-world': async (el) => { await actions.archiveWorld(el.dataset.id); toast('World archived'); },
  'restore-world': async (el) => { await actions.restoreWorld(el.dataset.id); toast('World restored'); },
  'delete-world': async (el) => {
    const ok = await confirmDialog({ title: 'Delete World', message: 'This is destructive. A backup snapshot is taken and the deletion is routed through approval. Continue?', confirmLabel: 'Propose deletion', danger: true });
    if (!ok) return;
    const r = await actions.deleteWorld(el.dataset.id);
    reportResult(r, 'Deletion');
  },
  'add-room': (el) => formAddRoom(el.dataset.id),
  'add-object': (el) => formAddObject(el.dataset.id, el.dataset.room || null),
  'edit-object': (el) => formEditObject(el.dataset.id),
  'delete-object': async (el) => {
    const ok = await confirmDialog({ title: 'Delete object', message: 'Destructive. Routed through approval with a backup snapshot. Continue?', confirmLabel: 'Propose deletion', danger: true });
    if (!ok) return;
    reportResult(await actions.deleteObject(el.dataset.id), 'Deletion');
  },
  'add-canon': (el) => formAddCanon(el.dataset.id),
  'finalize-canon': async (el) => reportResult(await actions.finalizeCanon(el.dataset.world, el.dataset.canon), 'Finalize canon'),
  'quick-capture': () => formCapture(),
  'approve-approval': async (el) => {
    const ok = await confirmDialog({ title: 'Approve action', message: 'Approve and execute this action immediately? This confirms you intend the exact effect described.', confirmLabel: 'Approve & execute' });
    if (!ok) return;
    const r = await store.resolveApproval(el.dataset.id, 'approve');
    toast(r.ok ? 'Approved and executed' : `Not executed: ${r.reason || r.status}`, { kind: r.ok ? 'ok' : 'warn' });
  },
  'reject-approval': async (el) => { await store.resolveApproval(el.dataset.id, 'reject'); toast('Rejected — no action taken'); },
  'toggle-setting': async (el) => { await actions.updateSettings({ [el.dataset.key]: el.checked }); applyPreferences(); },
  'toggle-flag': async (el) => {
    const flags = { ...getState().settings.featureFlags, [el.dataset.key]: el.checked };
    await actions.updateSettings({ featureFlags: flags });
  },
  'create-backup': async () => { await store.createBackup({ reason: 'Manual snapshot' }); toast('Backup created'); },
  'restore-backup': async (el) => {
    const ok = await confirmDialog({ title: 'Restore backup', message: 'Replace current metadata with this snapshot?', confirmLabel: 'Restore' });
    if (!ok) return;
    await store.restoreBackup(el.dataset.id); toast('Backup restored');
  },
  'export-data': () => exportData(),
  'import-data': () => formImport(),
  'reset-data': async () => {
    const ok = await confirmDialog({ title: 'Reset all data', message: 'This permanently clears all Worlds, Objects and activity. A backup is taken and the reset is routed through approval. Continue?', confirmLabel: 'Propose reset', danger: true });
    if (!ok) return;
    reportResult(await actions.resetData(), 'Reset');
  },
  'run-validation': () => runValidation(),
  'open-source': (el) => toast('Provider is a labelled stub; open is not available. Reference preserved.', { kind: 'warn' }),
};

function reportResult(r, label) {
  if (!r) return;
  if (r.ok) toast(`${label} executed`, { kind: 'ok' });
  else if (r.requiresApproval) toast(`${label} sent to Approvals for confirmation`, { kind: 'warn' });
  else if (r.denied) toast(`${label} blocked: ${r.reason}`, { kind: 'warn' });
  else toast(`${label} failed: ${r.reason || 'unknown'}`, { kind: 'warn' });
}

// ---- forms --------------------------------------------------------------

function formField(label, name, { value = '', type = 'text', textarea = false, options = null, placeholder = '' } = {}) {
  if (options) {
    return `<label class="field"><span>${esc(label)}</span>
      <select name="${esc(name)}">${options.map((o) => `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>`;
  }
  if (textarea) {
    return `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" placeholder="${esc(placeholder)}">${esc(value)}</textarea></label>`;
  }
  return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`;
}

function collectForm(overlay) {
  const data = {};
  overlay.querySelectorAll('[name]').forEach((el) => { data[el.name] = el.value; });
  return data;
}

function formNewWorld() {
  const body = `
    <p class="muted">Prepare a World proposal. Creation requires explicit approval (§23.3).</p>
    ${formField('Name', 'name', { placeholder: 'Project name' })}
    ${formField('Symbol', 'symbol', { placeholder: '◇' })}
    ${formField('Colour identity', 'colorIdentity', { value: '#6fd68a', type: 'text' })}
    ${formField('Priority', 'priority', { value: 'medium', options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }] })}
    ${formField('Description / reason it cannot belong to an existing World', 'description', { textarea: true })}`;
  openModal({
    title: 'Propose new World',
    bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Propose (requires approval)</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      if (!d.name) { toast('Name is required', { kind: 'warn' }); return false; }
      reportResult(await actions.createWorld(d), 'World creation');
      return true;
    }),
  });
}

function formEditWorld(id) {
  const w = getState().worlds.find((x) => x.id === id);
  if (!w) return;
  const body = `
    ${formField('Name', 'name', { value: w.name })}
    ${formField('Priority', 'priority', { value: w.priority, options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }] })}
    ${formField('Last action', 'lastAction', { value: w.lastAction })}
    ${formField('Next action', 'nextAction', { value: w.nextAction })}
    ${formField('Future action', 'futureAction', { value: w.futureAction })}
    ${formField('Description', 'description', { value: w.description, textarea: true })}`;
  openModal({
    title: `Edit ${w.name}`,
    bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Save</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      reportResult(await actions.updateWorld(id, d), 'World update');
      return true;
    }),
  });
}

function formAddRoom(worldId) {
  const body = `${formField('Room name', 'name', { placeholder: 'e.g. Development' })}
    ${formField('Type', 'type', { value: 'section', options: ['development', 'assets', 'canon', 'animation', 'code', 'research', 'release', 'section'].map((t) => ({ value: t, label: t })) })}`;
  openModal({
    title: 'Add room', bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Add</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      if (!d.name) { toast('Name required', { kind: 'warn' }); return false; }
      reportResult(await actions.createRoom({ ...d, worldId }), 'Add room');
      return true;
    }),
  });
}

function formAddObject(worldId, roomId) {
  const body = `
    ${formField('Title', 'title')}
    ${formField('Type', 'type', { value: 'image', options: ['image', 'video', 'audio', 'document', 'code', 'repository', 'link'].map((t) => ({ value: t, label: t })) })}
    ${formField('Provider', 'provider', { value: 'local', options: getState().settings.providers.map((p) => ({ value: p.providerId, label: `${p.providerId} (${p.status})` })) })}
    ${formField('Path', 'path', { placeholder: 'relative or provider path' })}
    ${formField('Repository / URL', 'repositoryUrl', { placeholder: 'https://…' })}
    ${formField('Tags (comma separated)', 'tags')}`;
  openModal({
    title: 'Add object reference', bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Add</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      if (!d.title) { toast('Title required', { kind: 'warn' }); return false; }
      const payload = { ...d, worldId, roomId: roomId || null, tags: d.tags ? d.tags.split(',').map((t) => t.trim()).filter(Boolean) : [] };
      reportResult(await actions.createObject(payload), 'Add object');
      return true;
    }),
  });
}

function formEditObject(id) {
  const o = getState().objects.find((x) => x.id === id);
  if (!o) return;
  const body = `${formField('Title', 'title', { value: o.title })}
    ${formField('Stage', 'stage', { value: o.stage, options: ['draft', 'final', 'reference', 'superseded'].map((s) => ({ value: s, label: s })) })}
    ${formField('Path', 'path', { value: o.path })}
    ${formField('Repository / URL', 'repositoryUrl', { value: o.repositoryUrl })}`;
  openModal({
    title: 'Edit object', bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Save</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      reportResult(await actions.updateObject(id, d), 'Object update');
      return true;
    }),
  });
}

function formAddCanon(worldId) {
  const body = `<p class="muted">Changing canon requires a recorded proposal and approval.</p>
    ${formField('Title', 'title')}
    ${formField('Decision', 'decision', { textarea: true })}`;
  openModal({
    title: 'Propose canon change', bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Propose (requires approval)</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      if (!d.title) { toast('Title required', { kind: 'warn' }); return false; }
      reportResult(await actions.addCanon(worldId, d), 'Canon change');
      return true;
    }),
  });
}

function formCapture() {
  const body = `${formField('Capture for Chief', 'input', { textarea: true, placeholder: 'What should Chief handle?' })}
    ${formField('Reasoning depth', 'reasoningDepth', { value: 'brain', options: [{ value: 'brain', label: 'Brain (routine)' }, { value: 'strategy', label: 'Strategy (planning)' }, { value: 'oracle', label: 'Oracle (deep, advisory)' }] })}`;
  openModal({
    title: 'Quick capture', bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn btn--primary" data-submit>Capture</button>`,
    onMount: (overlay, close) => wireSubmit(overlay, close, async (d) => {
      if (!d.input) { toast('Nothing to capture', { kind: 'warn' }); return false; }
      reportResult(await actions.capture(d.input, d.reasoningDepth), 'Capture');
      return true;
    }),
  });
}

function formImport() {
  const body = `<p class="muted">Paste an exported Atlas metadata JSON. It is validated and a backup is taken before applying.</p>
    <textarea name="payload" class="input" rows="10" placeholder='{"worlds":[…]}'></textarea>
    <div id="import-preview" class="code-out"></div>`;
  openModal({
    title: 'Import metadata', bodyHtml: body,
    actionsHtml: `<button class="btn" data-modal-close>Cancel</button><button class="btn" data-preview>Validate</button><button class="btn btn--primary" data-submit disabled>Apply import</button>`,
    onMount: (overlay, close) => {
      const preview = overlay.querySelector('#import-preview');
      const applyBtn = overlay.querySelector('[data-submit]');
      let parsed = null;
      overlay.querySelector('[data-preview]').addEventListener('click', () => {
        try {
          parsed = JSON.parse(overlay.querySelector('[name=payload]').value);
        } catch (e) { preview.textContent = `Invalid JSON: ${e.message}`; applyBtn.disabled = true; return; }
        const res = previewImport(parsed);
        preview.textContent = res.valid
          ? `Valid. Worlds: ${res.counts.worlds}, Rooms: ${res.counts.rooms}, Objects: ${res.counts.objects}, Sources: ${res.counts.sources}.`
          : `Invalid:\n- ${res.errors.join('\n- ')}`;
        applyBtn.disabled = !res.valid;
      });
      applyBtn.addEventListener('click', async () => {
        if (!parsed) return;
        await store.importDataset(parsed);
        recomputeConflicts();
        toast('Import applied'); close();
      });
    },
  });
}

function wireSubmit(overlay, close, onSubmit) {
  const submit = overlay.querySelector('[data-submit]');
  if (!submit) return;
  submit.addEventListener('click', async () => {
    const ok = await onSubmit(collectForm(overlay));
    if (ok !== false) close();
  });
}

// ---- data ops -----------------------------------------------------------

function exportData() {
  const blob = exportToBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `void-dominion-export-${now().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export downloaded');
}

function runValidation() {
  const state = getState();
  const res = validateDataset({ worlds: state.worlds, rooms: state.rooms, objects: state.objects, sources: state.sources });
  const out = document.getElementById('diagnostics-output');
  if (out) {
    out.textContent = res.valid
      ? `Validation passed. ${state.worlds.length} worlds, ${state.rooms.length} rooms, ${state.objects.length} objects.`
      : `Validation errors:\n- ${res.errors.join('\n- ')}`;
  }
}

function recomputeConflicts() {
  store.setConflicts(detectConflicts(getState().objects));
}

// ---- world-scoped search (delegated input) ------------------------------

function handleWorldSearch(el) {
  const state = getState();
  const index = buildIndex(state);
  const results = query(index, el.value, { worldId: el.dataset.world, limit: 10 });
  const box = document.getElementById('world-search-results');
  if (box) {
    box.innerHTML = results.map((r) => `<a class="search-result" href="${esc(r.route)}">${esc(r.title)} <span class="muted">${esc(r.kind)}</span></a>`).join('') || '<p class="muted">No matches.</p>';
  }
}

// ---- preferences --------------------------------------------------------

function applyPreferences() {
  const s = getState().settings;
  document.documentElement.classList.toggle('reduced-motion', !!s.reducedMotion);
  document.documentElement.classList.toggle('dev-mode', !!s.developerMode);
  try { localStorage.setItem('vd:reducedMotion', s.reducedMotion ? '1' : '0'); } catch (_) {}
}

// ---- bootstrap ----------------------------------------------------------

async function boot() {
  els.nav = document.getElementById('nav-root');
  els.status = document.getElementById('status-root');
  els.view = document.getElementById('view-root');
  initUI();

  els.view.innerHTML = '<div class="panel"><p>Loading Void Dominion…</p></div>';

  try {
    registerProviders();
    const seed = await loadSeed();
    // Prefer durable IndexedDB; fall back to in-memory if it is unavailable
    // (e.g. blocked in some file:// contexts) so the app always runs.
    let adapter = createIndexedDBAdapter();
    try {
      await store.initStore(adapter, seed);
    } catch (dbErr) {
      // eslint-disable-next-line no-console
      console.warn('[boot] IndexedDB unavailable, using in-memory storage', dbErr);
      adapter = createMemoryAdapter();
      await store.initStore(adapter, seed);
      setTimeout(() => toast('Running in memory-only mode — changes will not persist across reloads in this browser.', { kind: 'warn', timeout: 6000 }), 800);
    }
    recomputeConflicts();
    applyPreferences();

    defineRoutes();
    router.onRoute(renderView);

    // Re-render on any state change.
    on('state.changed', rerender);
    on('approval.requested', rerender);
    on('approval.resolved', rerender);

    // Global event delegation for data-action controls.
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.tagName === 'INPUT') return;
      const handler = handlers[el.dataset.action];
      if (handler) { e.preventDefault(); handler(el); }
    });
    document.body.addEventListener('change', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || el.tagName !== 'INPUT') return;
      const handler = handlers[el.dataset.action];
      if (handler) handler(el);
    });
    document.body.addEventListener('input', (e) => {
      const el = e.target.closest('[data-action="world-search"]');
      if (el) handleWorldSearch(el);
    });

    // Command bar shortcut.
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openCommandBar(getState());
      }
    });

    // Pause ambient loops when hidden (§16).
    document.addEventListener('visibilitychange', () => {
      document.documentElement.classList.toggle('is-hidden', document.hidden && getState().settings.pauseAmbientWhenHidden);
    });

    router.start();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[boot] failed', err);
    els.view.innerHTML = `<div class="panel"><h1>Startup error</h1><p class="callout callout--warn">${esc(err.message)}</p><p class="muted">Serve the app over a local HTTP server (see README) so data files and ES modules load correctly.</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
