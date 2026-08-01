// app-shell.js — Void Dominion shell: primary navigation + status strip.
// The shell frames the whole system. Void Dominion is the top shell; Atlas is
// the operating map; Nexus is the centre; the nine Locations are infrastructure.

import { esc } from '../util.js';

const PRIMARY_NAV = [
  { hash: '#/dominion', label: 'Void Dominion', hint: 'Shell & system status' },
  { hash: '#/atlas', label: 'Atlas', hint: 'Operating map' },
  { hash: '#/nexus', label: 'Nexus', hint: 'Operating centre' },
  { hash: '#/worlds', label: 'Worlds', hint: 'Project directory' },
  { hash: '#/approvals', label: 'Approvals', hint: 'Pending actions' },
  { hash: '#/activity', label: 'Activity', hint: 'Audit log' },
  { hash: '#/settings', label: 'Throne Reactor', hint: 'Settings' },
];

export function renderNav(state, activeHash) {
  const locations = state.locations.map((l) => `
    <a class="nav__loc" href="#/location/${esc(l.id)}"
       ${activeHash === `#/location/${l.id}` ? 'aria-current="page"' : ''}>
      <span class="nav__loc-index" aria-hidden="true">${esc(l.index)}</span>
      <span class="nav__loc-name">${esc(l.name)}</span>
    </a>`).join('');

  const primary = PRIMARY_NAV.map((n) => `
    <a class="nav__link" href="${esc(n.hash)}"
       ${activeHash === n.hash ? 'aria-current="page"' : ''}>
      <span class="nav__link-label">${esc(n.label)}</span>
      <span class="nav__link-hint">${esc(n.hint)}</span>
    </a>`).join('');

  return `
    <div class="nav__brand">
      <span class="nav__glyph" aria-hidden="true">◇</span>
      <span class="nav__title">Void Dominion</span>
    </div>
    <nav class="nav__primary" aria-label="Primary">${primary}</nav>
    <div class="nav__section-label">Nine Permanent Locations</div>
    <nav class="nav__locations" aria-label="Permanent Locations">${locations}</nav>
    <button class="btn btn--ghost nav__command" data-action="open-command-bar" title="Command bar (Ctrl/Cmd+K)">
      ⌘ Command bar
    </button>`;
}

export function renderStatusStrip(state) {
  const pending = state.approvals.filter((a) => a.status === 'pending').length;
  const providers = (state.settings.providers || []);
  const live = providers.filter((p) => p.status === 'connected').length;
  const mock = providers.filter((p) => p.status === 'mock').length;
  return `
    <div class="status-strip" role="status">
      <span class="status-pill status-pill--ok" title="Persistence layer">● IndexedDB persistence</span>
      <span class="status-pill">Worlds: ${esc(state.worlds.length)}</span>
      <span class="status-pill ${pending ? 'status-pill--warn' : ''}">Pending approvals: ${esc(pending)}</span>
      <span class="status-pill">Providers: ${esc(live)} live / ${esc(mock)} mock</span>
      <span class="status-pill status-pill--muted">Local-first · offline-capable</span>
    </div>`;
}
