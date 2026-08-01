// settings-view.js — Throne Reactor / technical settings entry point.
// System engine: configuration, providers, feature flags, maintenance.
// Consequential changes (e.g. enabling a provider that can read/write private
// data) are routed through approval by the store.

import { esc } from '../util.js';

export function render(_params, state) {
  const s = state.settings;
  const flags = Object.entries(s.featureFlags || {});
  const providers = s.providers || [];

  return `
    <h1>Throne Reactor</h1>
    <p class="muted">System engine, configuration, automation and power controls.</p>

    <div class="panel">
      <h2 class="panel__title">Preferences</h2>
      <label class="toggle">
        <input type="checkbox" data-action="toggle-setting" data-key="reducedMotion" ${s.reducedMotion ? 'checked' : ''}>
        Reduced motion
      </label>
      <label class="toggle">
        <input type="checkbox" data-action="toggle-setting" data-key="developerMode" ${s.developerMode ? 'checked' : ''}>
        Developer mode
      </label>
      <label class="toggle">
        <input type="checkbox" data-action="toggle-setting" data-key="pauseAmbientWhenHidden" ${s.pauseAmbientWhenHidden ? 'checked' : ''}>
        Pause ambient loops when hidden
      </label>
    </div>

    <div class="panel">
      <h2 class="panel__title">Feature flags</h2>
      ${flags.map(([k, v]) => `<label class="toggle">
        <input type="checkbox" data-action="toggle-flag" data-key="${esc(k)}" ${v ? 'checked' : ''}> ${esc(k)}
      </label>`).join('')}
    </div>

    <div class="panel">
      <h2 class="panel__title">Providers &amp; integration health</h2>
      <ul class="list">
        ${providers.map((p) => `<li>
          <strong>${esc(p.providerId)}</strong> — <span class="tag tag--${p.status === 'connected' ? 'low' : p.status === 'mock' ? 'mock' : 'high'}">${esc(p.status)}</span>
          <div class="muted">${esc(p.label)}</div>
        </li>`).join('')}
      </ul>
      <p class="muted">Enabling a new external integration that can read or write private data requires explicit approval.</p>
    </div>

    <div class="panel">
      <h2 class="panel__title">Data &amp; maintenance</h2>
      <div class="row">
        <button class="btn" data-action="export-data">Export metadata</button>
        <button class="btn" data-action="import-data">Import metadata</button>
        <button class="btn" data-action="create-backup">Create backup</button>
        <button class="btn btn--danger" data-action="reset-data">Reset all data</button>
      </div>
    </div>`;
}
