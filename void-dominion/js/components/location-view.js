// location-view.js — one permanent Location and its infrastructure interface
// (#/location/:locationId). Each Location owns real system data, not a themed
// placeholder page. Specialised panels are wired per Location.

import { el, placeholder, iconStatus, badge } from './dom.js';
import { renderTimeline } from './activity-timeline.js';

export function renderLocation(app, ctx) {
  const loc = app.store.getLocation(ctx.params.locationId);
  if (!loc) return notFound('Location');

  const head = el('header', { class: 'view__head', attrs: { style: `--accent:${loc.accent}` } }, [
    el('div', { class: 'view__eyebrow' }, [el('span', { class: 'view__icon', text: loc.icon }), el('span', { text: `Location ${loc.index} of 9` })]),
    el('h1', { text: loc.name }),
    el('p', { class: 'muted', text: loc.responsibility }),
    el('p', { class: 'note note--boundary' }, [el('strong', { text: 'Must not become: ' }), loc.mustNotBecome])
  ]);

  return el('section', { class: 'view view--location' }, [head, specialised(app, loc)]);
}

function specialised(app, loc) {
  switch (loc.id) {
    case 'machine-oracle': return machineOracle(app);
    case 'memory-vault': return memoryVault(app);
    case 'astral-greenhouse': return astralGreenhouse(app);
    case 'throne-reactor': return throneReactor(app);
    case 'void-railway': return voidRailway(app);
    case 'observatory': return observatory(app);
    case 'cosmic-aquarium': return cosmicAquarium(app);
    case 'leviathan-spine': return leviathanSpine(app);
    case 'eclipse-monastery': return eclipseMonastery(app);
    default: return el('p', { class: 'muted', text: loc.requirement });
  }
}

function panel(title, body) {
  return el('section', { class: 'panel' }, [el('h2', { class: 'panel__title', text: title }), body]);
}
function notFound(kind) { return el('section', { class: 'view' }, [el('h1', { text: `${kind} not found` }), el('a', { class: 'link', href: '#/atlas', text: '← Back to Atlas' })]); }

// 1. Machine Oracle — Chief, reasoning, approvals, decisions.
function machineOracle(app) {
  const chief = app.store.getChief();
  const pending = app.store.getPendingApprovals();
  const captureInput = el('input', { class: 'input', attrs: { placeholder: 'Capture an item for Chief…' } });
  return el('div', { class: 'grid grid--two' }, [
    panel('Chief status', el('div', {}, [
      iconStatus(chief.providerLabel, 'mock'),
      el('h3', { text: 'Reasoning levels' }),
      el('ul', { class: 'list' }, chief.reasoningLevels.map(r =>
        el('li', {}, [el('strong', { text: r.layer }), el('span', { class: 'muted', text: ` — ${r.role}` })])))
    ])),
    panel('Capture & queue', el('div', {}, [
      el('div', { class: 'row' }, [
        captureInput,
        el('button', { class: 'btn btn--primary', type: 'button', text: 'Capture', onClick: async () => {
          const v = captureInput.value.trim(); if (!v) return;
          const res = await app.chief.capture(v);
          await app.store.addActivity({ actor: 'user', type: 'chief.capture', entityType: 'chief', entityId: 'chief', summary: `Captured: ${v.slice(0, 60)}`, result: 'success' });
          captureInput.value = '';
          app.toast(`Captured · suggested level: ${res.item.level}`); app.rerender();
        } })
      ]),
      el('ul', { class: 'list' }, (chief.queue || []).length
        ? chief.queue.map(q => el('li', {}, [badge(q.level, 'neutral'), ` ${q.text}`]))
        : [el('li', { class: 'muted', text: 'Queue is empty.' })])
    ])),
    panel('Pending approvals', pending.length
      ? el('ul', { class: 'list' }, pending.map(a => el('li', {}, [
          el('button', { class: 'link', type: 'button', text: `${a.summary} (${a.risk})`, onClick: () => app.openApproval(a.id) })])))
      : el('p', { class: 'muted', text: 'No pending approvals.' })),
    panel('Locked Shortcuts contract', el('div', { class: 'chips' },
      [...chief.lockedShortcutsContract.stars, ...chief.lockedShortcutsContract.exec,
       ...chief.lockedShortcutsContract.ops, ...chief.lockedShortcutsContract.life,
       ...chief.lockedShortcutsContract.sys].map(c => badge(c, 'neutral'))))
  ]);
}

// 2. Memory Vault — archive.
function memoryVault(app) {
  const archived = app.store.getWorlds().filter(w => w.status === 'archived');
  const superseded = app.store.getWorlds().flatMap(w => (w.canon || []).filter(c => c.stage === 'superseded').map(c => ({ world: w, c })));
  return el('div', { class: 'grid grid--two' }, [
    panel('Archived Worlds', archived.length
      ? el('ul', { class: 'list' }, archived.map(w => el('li', {}, [el('a', { class: 'link', href: `#/world/${w.id}`, text: w.name })])))
      : el('p', { class: 'muted', text: 'No archived Worlds. Archive from a World, not by deletion.' })),
    panel('Superseded decisions', superseded.length
      ? el('ul', { class: 'list' }, superseded.map(s => el('li', {}, [el('span', { class: 'muted', text: `${s.world.name}: ` }), s.c.text])))
      : el('p', { class: 'muted', text: 'No superseded decisions recorded.' })),
    panel('Backups & restore', backupPanel(app))
  ]);
}

function backupPanel(app) {
  const wrap = el('div', {});
  const list = el('ul', { class: 'list' });
  const refresh = async () => {
    const backups = await app.backup.list();
    list.replaceChildren(...(backups.length
      ? backups.map(b => el('li', {}, [
          el('span', { text: `${b.label} — ${new Date(b.createdAt).toLocaleString()}` }),
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Restore', onClick: () => app.requestRestore(b.id) })]))
      : [el('li', { class: 'muted', text: 'No backups yet.' })]));
  };
  wrap.append(
    el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Create backup', onClick: async () => {
      await app.backup.create('manual');
      await app.store.addActivity({ actor: 'user', type: 'backup.created', summary: 'Manual backup created', result: 'success' });
      refresh(); app.toast('Backup created.');
    } }),
    list
  );
  refresh();
  return wrap;
}

// 3. Astral Greenhouse — cross-World visual discovery.
function astralGreenhouse(app) {
  const objects = app.store.getObjects();
  return el('div', {}, [
    panel('Cross-World visual discovery', el('div', { class: 'gallery gallery--grid' }, objects.length
      ? objects.map(o => el('a', { class: 'tile', href: `#/object/${o.id}` }, [
          placeholder(`${o.type} · ${o.stage}`, 'tile'),
          el('span', { class: 'tile__title', text: o.title }),
          el('span', { class: 'tile__meta', text: `${app.store.getWorld(o.worldId)?.name || ''}` })]))
      : [el('p', { class: 'muted', text: 'No asset candidates yet. Each World also has its own gallery.' })])),
    el('p', { class: 'note', text: 'This is cross-World discovery only. It is not the single gallery — every Project World owns its own immersive gallery.' })
  ]);
}

// 4. Throne Reactor — system engine / settings entry.
function throneReactor(app) {
  const s = app.store.getSettings();
  return el('div', { class: 'grid grid--two' }, [
    panel('Integration health', el('ul', { class: 'list' }, app.providers.statuses().map(p =>
      el('li', {}, [iconStatus(`${p.label} — ${p.status} (write: ${p.writeCapability})`, p.mode === 'live' ? 'live' : p.mode === 'mock' ? 'mock' : 'stub')])))),
    panel('Feature flags', el('ul', { class: 'list' }, Object.entries(s.featureFlags || {}).map(([k, v]) =>
      el('li', {}, [iconStatus(k, v ? 'live' : 'stub')])))),
    panel('System controls', el('div', {}, [
      el('a', { class: 'btn btn--ghost', href: '#/settings', text: 'Open full settings →' })
    ]))
  ]);
}

// 5. Void Railway — navigation between Worlds.
function voidRailway(app) {
  const worlds = app.store.getWorlds();
  return el('div', {}, [
    panel('World directory', el('div', { class: 'grid grid--worlds' }, worlds.map(w =>
      el('a', { class: 'card card--world', href: `#/world/${w.id}`, attrs: { style: `--accent:${w.color}` } }, [
        el('span', { class: 'card__symbol', text: w.symbol || '◆' }),
        el('h3', { class: 'card__title', text: w.name }),
        el('span', { class: 'card__foot', text: `${w.status} · ${w.priority}` })])))),
    el('p', { class: 'note', text: 'World creation is a proposal subject to approval. This is transport, not a file browser.' }),
    el('button', { class: 'btn btn--primary', type: 'button', text: 'Propose new World', onClick: () => app.proposeWorld() })
  ]);
}

// 6. Observatory — Atlas-wide oversight.
function observatory(app) {
  const worlds = app.store.getWorlds();
  const byStatus = worlds.reduce((m, w) => (m[w.status] = (m[w.status] || 0) + 1, m), {});
  const stale = worlds.filter(w => !w.nextAction || w.status === 'blocked');
  return el('div', { class: 'grid grid--two' }, [
    panel('Project inventory', el('ul', { class: 'list' }, [
      el('li', { text: `Total Worlds: ${worlds.length}` }),
      ...Object.entries(byStatus).map(([k, v]) => el('li', { text: `${k}: ${v}` }))
    ])),
    panel('Blocked & stale', stale.length
      ? el('ul', { class: 'list' }, stale.map(w => el('li', {}, [el('a', { class: 'link', href: `#/world/${w.id}`, text: w.name })])))
      : el('p', { class: 'muted', text: 'No blocked or stale Worlds.' })),
    panel('Deadlines', el('ul', { class: 'list' }, (() => {
      const d = worlds.flatMap(w => (w.deadlines || []).map(x => ({ w, x })));
      return d.length ? d.map(({ w, x }) => el('li', { text: `${w.name}: ${x.title || x}` })) : [el('li', { class: 'muted', text: 'No deadlines recorded.' })];
    })()))
  ]);
}

// 7. Cosmic Aquarium — unplaced media.
function cosmicAquarium(app) {
  const media = app.store.getObjects().filter(o => ['video', 'audio'].includes(o.type));
  return el('div', {}, [
    panel('Unplaced media queue', media.length
      ? el('ul', { class: 'list' }, media.map(o => el('li', {}, [el('a', { class: 'link', href: `#/object/${o.id}`, text: o.title })])))
      : el('p', { class: 'muted', text: 'No unplaced media. Media with a correct home lives in its World.' }))
  ]);
}

// 8. Leviathan Spine — backbone, diagnostics.
function leviathanSpine(app) {
  const diagnostics = app.resolver.diagnostics();
  const sources = app.store.getSources();
  return el('div', { class: 'grid grid--two' }, [
    panel('Storage providers & sources', el('ul', { class: 'list' }, sources.map(s =>
      el('li', {}, [iconStatus(`${s.provider} · ${s.authority} — ${s.availability}`, s.availability === 'available' ? 'live' : 'stub'),
        el('span', { class: 'muted', text: ` ${s.repository || s.path || s.url || ''}` })])))),
    panel('Diagnostics', diagnostics.length
      ? el('ul', { class: 'list' }, diagnostics.map(d => el('li', {}, [iconStatus(`${d.kind} ${d.id}: ${d.issue}`, 'failure')])))
      : el('p', { class: 'muted', text: 'No structural problems detected.' })),
    panel('Validation', el('button', { class: 'btn btn--ghost', type: 'button', text: 'Run relationship validation', onClick: () => app.runValidation() }))
  ]);
}

// 9. Eclipse Monastery — life structures.
function eclipseMonastery(app) {
  return el('div', {}, [
    panel('Life structures & routines', el('div', {}, [
      placeholder('Personal development interface (visual production)', 'panel'),
      el('p', { class: 'note', text: 'Experiential interface to relevant Chief outputs. This is not Chief itself and never a medical decision-maker.' })
    ]))
  ]);
}
