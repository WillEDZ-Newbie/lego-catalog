// world-gallery.js — reusable immersive gallery engine, configured per World.
// Every World owns its own gallery (§33). Placeholders render gracefully where
// final assets are absent; asset slots are configurable for later production.

import { esc } from '../util.js';

export function render(params, state) {
  const w = state.worlds.find((x) => x.id === params.worldId);
  if (!w) return `<section class="view"><div class="panel"><h1>World not found</h1></div></section>`;
  const objects = state.objects.filter((o) => o.worldId === w.id);
  const cfg = w.galleryConfig || { layout: 'grid', assetSlots: ['cover'] };

  const slots = (cfg.assetSlots || []).map((slot) => `
    <div class="tile tile--slot" data-asset-slot="${esc(slot)}">
      <span class="tile__thumb"><span class="badge badge--placeholder">${esc(slot)} slot</span></span>
      <span class="tile__title">${esc(slot)}</span>
      <span class="tile__meta muted">Awaiting asset</span>
    </div>`).join('');

  const tiles = objects.map((o) => `
    <a class="tile" href="#/object/${esc(o.id)}">
      <span class="tile__thumb" data-asset-slot="thumb"><span class="badge badge--placeholder">${esc(o.type)}</span></span>
      <span class="tile__title">${esc(o.title)}</span>
      <span class="tile__meta muted">${esc(o.stage)} · ${esc(o.provider)}</span>
    </a>`).join('');

  return `
  <section class="view view--gallery" style="--accent:${esc(w.colorIdentity || '#6fd68a')}">
    <header class="view__header">
      <p class="crumb"><a href="#/world/${esc(w.id)}">${esc(w.name)}</a> / Gallery</p>
      <h1>${esc(w.name)} — Immersive gallery</h1>
      <p class="muted">Layout: ${esc(cfg.layout)}. Project-specific gallery; not a global gallery.</p>
    </header>
    <div class="gallery-grid gallery-grid--${esc(cfg.layout)}">
      ${tiles}
      ${slots}
    </div>
    <p class="muted">Transition hooks, ambient loops and curated sequences are configurable and left for visual production.</p>
  </section>`;
}
