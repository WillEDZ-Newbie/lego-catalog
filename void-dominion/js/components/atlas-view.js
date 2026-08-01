// atlas-view.js — Atlas overview and World map.
// Presents the whole system: Nexus, the nine permanent Locations and the
// Project Worlds. Global mechanics live in the Locations, not a separate tier.

import { esc } from '../util.js';

export function render(_params, state) {
  const locations = state.locations.map((l) => `
    <a class="map-node map-node--location" href="#/location/${esc(l.id)}" style="--accent:${esc(l.theme && l.theme.accent || '#6fd68a')}">
      <span class="map-node__index">${esc(l.index)}</span>
      <span class="map-node__name">${esc(l.name)}</span>
      <span class="map-node__fn">${esc(l.function)}</span>
    </a>`).join('');

  const worlds = state.worlds.filter((w) => w.status !== 'archived').map((w) => `
    <a class="map-node map-node--world" href="#/world/${esc(w.id)}" style="--accent:${esc(w.colorIdentity || '#6fd68a')}">
      <span class="map-node__symbol" aria-hidden="true">${esc(w.symbol || '◇')}</span>
      <span class="map-node__name">${esc(w.name)}</span>
      <span class="map-node__fn">${esc(w.status)} · ${esc(w.priority)}</span>
    </a>`).join('');

  return `
  <section class="view view--atlas">
    <header class="view__header">
      <h1>Atlas</h1>
      <p class="muted">The visible operating map and interface for the whole system.</p>
    </header>

    <div class="map-tier">
      <a class="map-node map-node--nexus" href="#/nexus">
        <span class="map-node__name">Nexus</span>
        <span class="map-node__fn">Central convergence &amp; operating centre</span>
      </a>
    </div>

    <h2 class="tier-label">Nine permanent Locations — system infrastructure</h2>
    <div class="map-grid">${locations}</div>

    <h2 class="tier-label">Project Worlds</h2>
    <div class="map-grid">${worlds}
      <button class="map-node map-node--add" data-action="new-world">
        <span class="map-node__symbol" aria-hidden="true">＋</span>
        <span class="map-node__name">Propose new World</span>
        <span class="map-node__fn">Requires approval</span>
      </button>
    </div>
  </section>`;
}
