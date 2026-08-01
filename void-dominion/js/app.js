// app.js — bootstrap and orchestration.
// Wires persistence, store, providers, search, safety and the router, then
// exposes an `app` context to every view. All consequential/destructive
// actions are routed through the safety evaluator here (never directly).

import { bus } from './events.js';
import { Persistence } from './persistence.js';
import { Store } from './store.js';
import { Router } from './router.js';
import { SearchIndex } from './search.js';
import { SafetyEvaluator } from './safety.js';
import { SourceResolver } from './source-resolver.js';
import { ProviderRegistry } from './providers/provider-registry.js';
import { LocalProvider } from './providers/local-provider.js';
import { ICloudProviderStub } from './providers/icloud-provider.stub.js';
import { GitHubProviderStub } from './providers/github-provider.stub.js';
import { ChiefProviderStub } from './providers/chief-provider.stub.js';
import { AIProviderStub } from './providers/ai-provider.stub.js';
import { BackupService } from './import-export.js';
import { validateEntity, validateRelationships, generateId } from './validation.js';

import { buildShell, setActiveNav } from './components/app-shell.js';
import { el, mount } from './components/dom.js';
import { openApprovalDialog } from './components/approval-dialog.js';
import { renderDominionHome } from './components/dominion-home.js';
import { renderAtlas } from './components/atlas-view.js';
import { renderNexus } from './components/nexus-view.js';
import { renderWorlds } from './components/worlds-view.js';
import { renderWorld } from './components/world-view.js';
import { renderGallery } from './components/world-gallery.js';
import { renderLocation } from './components/location-view.js';
import { renderObject } from './components/object-viewer.js';
import { renderApprovals } from './components/approvals-view.js';
import { renderActivity } from './components/activity-view.js';
import { renderSettings } from './components/settings-view.js';

async function boot() {
  const persistence = await new Persistence().open();
  const store = new Store(persistence, { basePath: '' });
  await store.init();

  const providers = new ProviderRegistry();
  const chief = new ChiefProviderStub(store);
  providers
    .register(new LocalProvider(store))
    .register(new ICloudProviderStub())
    .register(new GitHubProviderStub())
    .register(chief)
    .register(new AIProviderStub());

  const app = {
    bus, persistence, store, providers, chief,
    router: new Router(),
    search: new SearchIndex(store),
    safety: new SafetyEvaluator(store),
    resolver: new SourceResolver(store),
    backup: new BackupService(store, persistence),
    ai: new AIProviderStub()
  };

  bindActions(app);
  configureRoutes(app);

  const root = document.getElementById('app');
  mount(root, buildShell(app));
  app.applyTheme();
  app.router.start();

  // Keep search + chrome fresh.
  bus.on('state:changed', () => app.search.rebuild());
  bus.on('state:replaced', () => { app.search.rebuild(); app.rerender(); });

  // Pause expensive ambient loops when the tab is hidden (§16).
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('is-hidden', document.hidden);
  });

  console.info(`[void-dominion] ready · persistence: ${persistence.durable ? 'IndexedDB' : 'in-memory'} · seeded fresh: ${store.seededFresh}`);
}

function configureRoutes(app) {
  const outletRender = (fn) => (ctx) => {
    const node = fn(app, ctx);
    mount(app.dom.outlet, node);
    app.dom.outlet.focus({ preventScroll: true });
    app.dom.outlet.scrollTop = 0;
    setActiveNav();
    app._lastRoute = ctx;
  };

  app.router
    .add('#/dominion', outletRender(renderDominionHome))
    .add('#/atlas', outletRender(renderAtlas))
    .add('#/nexus', outletRender(renderNexus))
    .add('#/worlds', outletRender(renderWorlds))
    .add('#/world/:worldId', outletRender(renderWorld))
    .add('#/world/:worldId/gallery', outletRender(renderGallery))
    .add('#/world/:worldId/room/:roomId', outletRender(renderWorld))
    .add('#/location/:locationId', outletRender(renderLocation))
    .add('#/object/:objectId', outletRender(renderObject))
    .add('#/approvals', outletRender(renderApprovals))
    .add('#/activity', outletRender(renderActivity))
    .add('#/settings', outletRender(renderSettings));
}

function bindActions(app) {
  const { store, safety } = app;

  app.rerender = () => { if (app._lastRoute) app.router._onHash(); };

  app.toast = (msg) => {
    let region = document.getElementById('toast-region');
    if (!region) {
      region = el('div', { id: 'toast-region', class: 'toast-region', attrs: { role: 'status', 'aria-live': 'polite' } });
      document.body.appendChild(region);
    }
    const t = el('div', { class: 'toast', text: msg });
    region.appendChild(t);
    setTimeout(() => t.classList.add('is-in'), 10);
    setTimeout(() => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 300); }, 3600);
  };

  app.applyTheme = () => {
    const s = store.getSettings();
    const rootEl = document.documentElement;
    rootEl.dataset.theme = s.theme || 'void';
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reduced = s.reducedMotion === 'reduced' || (s.reducedMotion === 'auto' && prefersReduced);
    rootEl.dataset.motion = reduced ? 'reduced' : 'full';
    rootEl.dataset.dev = s.developerMode ? 'on' : 'off';
  };

  app.openApproval = (id) => {
    const approval = store.getApprovals().find(a => a.id === id);
    if (approval) openApprovalDialog(app, approval);
  };

  // --- World field edits (medium risk, reversible) -----------------------
  app.editWorldField = async (worldId, field, value, label) => {
    const world = store.getWorld(worldId);
    const before = { [field]: world[field] };
    await safety.run({
      actionType: 'metadata_edit', entityType: 'world', entityId: worldId,
      summary: `Update ${label} on ${world.name}`, before, proposedAfter: { [field]: value }
    }, async () => { await store.upsertWorld({ id: worldId, [field]: value }); return { providerConfirmed: true }; });
    app.toast(`${label} updated.`);
  };

  app.changeWorldStatus = async (worldId, status) => {
    const world = store.getWorld(worldId);
    await safety.run({
      actionType: 'status_change', entityType: 'world', entityId: worldId,
      summary: `Change status of ${world.name} to ${status}`, before: { status: world.status }, proposedAfter: { status }
    }, async () => { await store.upsertWorld({ id: worldId, status }); return { providerConfirmed: true }; });
    app.toast(`Status set to ${status}.`);
  };

  // --- Archive (meaningful, reversible) ----------------------------------
  app.archiveWorld = async (worldId) => {
    const world = store.getWorld(worldId);
    const res = await safety.run({
      actionType: 'archive', entityType: 'world', entityId: worldId,
      summary: `Archive World ${world.name}`, before: { status: world.status }, proposedAfter: { status: 'archived' },
      rollbackAvailable: true
    }, async () => { await store.upsertWorld({ id: worldId, status: 'archived' }); return { providerConfirmed: true }; });
    if (res.ok) app.toast('World archived (recoverable from Memory Vault).');
    app.rerender();
  };

  // --- Delete World (critical, backup + approval) ------------------------
  app.deleteWorld = async (worldId) => {
    const world = store.getWorld(worldId);
    const res = await safety.run({
      actionType: 'world_delete', risk: 'critical', entityType: 'world', entityId: worldId,
      summary: `Permanently delete World ${world.name}`,
      reason: 'Destructive, canonical removal of a World and its objects.',
      before: { id: world.id, name: world.name, objects: (world.objectIds || []).length },
      proposedAfter: { deleted: true }, affectedEntities: [world.id, ...(world.objectIds || [])],
      rollbackAvailable: true
    }, async () => {
      await app.backup.create('pre-delete-world');    // archive/backup before deletion
      await store.removeWorld(worldId);
      return { providerConfirmed: true };
    });
    if (res.status === 'pending-approval') app.toast('Deletion requires approval — review it in Approvals.');
    app.rerender();
  };

  // --- Canon change (critical, approval) ---------------------------------
  app.proposeCanonChange = async (worldId) => {
    const world = store.getWorld(worldId);
    const text = prompt(`New canon decision for ${world.name}:`);
    if (!text) return;
    await safety.run({
      actionType: 'canon_change', risk: 'critical', entityType: 'world', entityId: worldId,
      summary: `Add canon to ${world.name}: ${text.slice(0, 60)}`,
      reason: 'Changing established canon requires a recorded proposal and approval.',
      before: { canonCount: (world.canon || []).length }, proposedAfter: { newCanon: text },
      rollbackAvailable: true
    }, async () => {
      const canon = [...(world.canon || []), { id: generateId('canon'), text, stage: 'final', supersedes: null, createdAt: new Date().toISOString() }];
      await store.upsertWorld({ id: worldId, canon });
      return { providerConfirmed: true };
    });
    app.toast('Canon change proposed — approve it in Approvals.');
    app.rerender();
  };

  // --- Add object (medium) ------------------------------------------------
  app.addObject = async (worldId) => {
    const title = prompt('Object title:');
    if (!title) return;
    const id = generateId('object');
    await safety.run({
      actionType: 'metadata_edit', entityType: 'object', entityId: id,
      summary: `Add object "${title}" to World`, proposedAfter: { title, worldId }
    }, async () => {
      await store.upsertObject({ id, worldId, title, type: 'document', stage: 'evolving', canonical: false, provider: 'local', tags: [], provenance: { origin: 'user' } });
      return { providerConfirmed: true };
    });
    app.toast('Object added.');
    app.rerender();
  };

  // --- Delete object (critical) ------------------------------------------
  app.deleteObject = async (objectId) => {
    const obj = store.getObject(objectId);
    const res = await safety.run({
      actionType: 'delete', risk: 'critical', entityType: 'object', entityId: objectId,
      summary: `Permanently delete object "${obj.title}"`,
      reason: 'Permanent deletion.', before: { id: obj.id, title: obj.title }, proposedAfter: { deleted: true },
      affectedEntities: [obj.id], rollbackAvailable: true
    }, async () => { await app.backup.create('pre-delete-object'); await store.removeObject(objectId); return { providerConfirmed: true }; });
    if (res.status === 'pending-approval') app.toast('Deletion requires approval.');
    else { app.toast('Object deleted.'); app.router.navigate(`#/world/${obj.worldId}`); }
  };

  // --- Propose World (creation gate: high risk, approval) ----------------
  app.proposeWorld = async () => {
    const name = prompt('Proposed World name:');
    if (!name) return;
    const id = `world-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString(36)}`;
    await safety.run({
      actionType: 'world_create', risk: 'high', entityType: 'world', entityId: id,
      summary: `Create World "${name}"`, reason: 'World creation requires explicit approval.',
      proposedAfter: { id, name }, rollbackAvailable: true
    }, async () => {
      await store.upsertWorld({ id, name, symbol: '◆', color: '#8fe3c2', description: '', status: 'proposed', priority: 'medium', canon: [], unresolvedQuestions: [], lastAction: 'Proposed.', nextAction: 'Define identity and first source.', futureAction: '', rooms: [], objectIds: [], galleryConfig: { layout: 'grid', stages: ['final', 'evolving', 'reference'] }, sourceRefs: [], milestones: [], blockers: [], deadlines: [] });
      return { providerConfirmed: true };
    });
    app.toast('World proposed — approve it in Approvals.');
    app.rerender();
  };

  // --- Restore backup (critical) -----------------------------------------
  app.requestRestore = async (backupId) => {
    await safety.run({
      actionType: 'reset', risk: 'critical', summary: `Restore backup ${backupId}`,
      reason: 'Restore replaces all current data.', proposedAfter: { restored: backupId }, rollbackAvailable: true
    }, async () => { await app.backup.create('pre-restore'); await app.backup.restore(backupId); return { providerConfirmed: true }; });
    app.toast('Restore requires approval — review it in Approvals.');
    app.rerender();
  };

  // --- Import (critical) --------------------------------------------------
  app.requestImport = async (payload) => {
    await safety.run({
      actionType: 'reset', risk: 'critical', summary: 'Import data (replaces current data)',
      reason: 'Import replaces all current data.', proposedAfter: { import: true }, rollbackAvailable: true
    }, async () => { await app.backup.importData(payload); return { providerConfirmed: true }; });
    app.toast('Import requires approval — review it in Approvals.');
    app.rerender();
  };

  // --- Reset to seed (critical) ------------------------------------------
  app.resetSystem = async () => {
    await safety.run({
      actionType: 'reset', risk: 'critical', summary: 'Reset all data to seed',
      reason: 'Destructive reset of system data.', proposedAfter: { reset: true }, rollbackAvailable: true
    }, async () => {
      await app.backup.create('pre-reset');
      await app.persistence.clear('meta');            // drop seeded flag + backups
      for (const s of ['system', 'locations', 'worlds', 'objects', 'sources', 'activity', 'approvals', 'chief', 'settings', 'safety']) await app.persistence.clear(s);
      const fresh = new Store(app.persistence, { basePath: '' });
      await fresh.init();
      await store._hydrate();
      return { providerConfirmed: true };
    });
    app.toast('Reset requires approval — review it in Approvals.');
    app.rerender();
  };

  // --- Validation ---------------------------------------------------------
  app.runValidation = async () => {
    const problems = validateRelationships(store.state);
    let entityErrors = 0;
    for (const w of store.getWorlds()) if (!validateEntity('world', w).valid) entityErrors++;
    for (const o of store.getObjects()) if (!validateEntity('object', o).valid) entityErrors++;
    await store.addActivity({ actor: 'system', type: 'validation.run', summary: `Validation: ${problems.length} relationship issue(s), ${entityErrors} entity error(s).`, result: problems.length || entityErrors ? 'partial' : 'success' });
    app.toast(`Validation: ${problems.length} relationship issue(s), ${entityErrors} entity error(s).`);
    app.rerender();
  };
}

boot().catch(err => {
  console.error('[void-dominion] failed to start', err);
  const root = document.getElementById('app');
  if (root) root.textContent = `Void Dominion failed to start: ${err.message}. Serve this folder over HTTP (ES modules require a server).`;
});
