// settings-view.js — Throne Reactor technical settings entry (#/settings).
// Providers, feature flags, preferences and honest data controls
// (export / import / backup / restore).

import { el, iconStatus, clear } from './dom.js';
import { exportToBlob } from '../import-export.js';

export function renderSettings(app) {
  const s = app.store.getSettings();

  const themeSel = select(['void', 'obsidian'], s.theme, async v => { await app.store.updateSettings({ theme: v }); app.applyTheme(); });
  const motionSel = select(['auto', 'reduced', 'full'], s.reducedMotion, async v => { await app.store.updateSettings({ reducedMotion: v }); app.applyTheme(); });
  const devToggle = toggle(s.developerMode, async v => { await app.store.updateSettings({ developerMode: v }); app.toast(`Developer mode ${v ? 'on' : 'off'}`); });

  return el('section', { class: 'view view--settings' }, [
    el('header', { class: 'view__head' }, [el('h1', { text: 'Settings — Throne Reactor' }), el('p', { class: 'muted', text: 'System engine, configuration and honest data controls.' })]),
    el('div', { class: 'grid grid--two' }, [
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel__title', text: 'Providers & integration health' }),
        el('ul', { class: 'list' }, app.providers.statuses().map(p =>
          el('li', {}, [iconStatus(`${p.label} — ${p.status} · write: ${p.writeCapability}`, p.mode === 'live' ? 'live' : p.mode === 'mock' ? 'mock' : 'stub')]))),
        el('p', { class: 'note', text: 'iCloud and GitHub are honest stubs until a real integration is configured. No API secrets are ever stored in client code.' })
      ]),
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel__title', text: 'Preferences' }),
        field('Theme', themeSel),
        field('Motion', motionSel),
        field('Developer mode', devToggle)
      ])
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title', text: 'Data — export, import, backup, restore' }),
      el('div', { class: 'row' }, [
        el('button', { class: 'btn btn--primary', type: 'button', text: 'Export JSON', onClick: () => doExport(app) }),
        importControl(app),
        el('button', { class: 'btn btn--ghost', type: 'button', text: 'Create backup', onClick: async () => {
          await app.backup.create('manual');
          await app.store.addActivity({ actor: 'user', type: 'backup.created', summary: 'Manual backup created', result: 'success' });
          app.toast('Backup created.');
        } }),
        el('button', { class: 'btn btn--danger', type: 'button', text: 'Reset to seed data', onClick: () => app.resetSystem() })
      ]),
      el('p', { class: 'note', text: 'Import and reset are destructive; both take a backup first and are routed through the safety evaluator.' })
    ])
  ]);
}

function doExport(app) {
  const blob = exportToBlob(app.store);
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, attrs: { download: `void-dominion-export-${Date.now()}.json` } });
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  app.store.addActivity({ actor: 'user', type: 'data.export', summary: 'Exported system data', result: 'success' });
}

function importControl(app) {
  const input = el('input', { type: 'file', attrs: { accept: 'application/json', hidden: 'hidden' } });
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      app.requestImport(payload);
    } catch (err) { app.toast(`Invalid JSON: ${err.message}`); }
    input.value = '';
  });
  const btn = el('button', { class: 'btn btn--ghost', type: 'button', text: 'Import JSON', onClick: () => input.click() });
  return el('span', {}, [btn, input]);
}

function select(options, value, onChange) {
  const sel = el('select', { class: 'input input--select' }, options.map(o => el('option', { value: o, text: o, attrs: o === value ? { selected: 'selected' } : {} })));
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}
function toggle(value, onChange) {
  const btn = el('button', { class: `toggle ${value ? 'is-on' : ''}`, type: 'button', text: value ? 'On' : 'Off', attrs: { 'aria-pressed': String(!!value) } });
  btn.addEventListener('click', () => { const v = !(btn.getAttribute('aria-pressed') === 'true'); btn.setAttribute('aria-pressed', String(v)); btn.className = `toggle ${v ? 'is-on' : ''}`; btn.textContent = v ? 'On' : 'Off'; onChange(v); });
  return btn;
}
function field(label, control) { return el('div', { class: 'field' }, [el('label', { class: 'field__label', text: label }), control]); }
