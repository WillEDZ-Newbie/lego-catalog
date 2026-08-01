// world-gallery.js — reusable immersive gallery engine, configured per World
// (#/world/:worldId/gallery). Filters, preview and project-specific metadata.
// Placeholders stand in wherever real assets are not yet supplied (§16/§30).

import { el, placeholder, badge, clear } from './dom.js';

export function renderGallery(app, ctx) {
  const world = app.store.getWorld(ctx.params.worldId);
  if (!world) return el('section', { class: 'view' }, [el('h1', { text: 'World not found' })]);

  const cfg = world.galleryConfig || { layout: 'grid', stages: ['final', 'evolving', 'reference'] };
  const objects = app.store.getObjectsForWorld(world.id);
  const stages = cfg.stages || ['final', 'evolving', 'reference'];

  const grid = el('div', { class: `gallery gallery--${cfg.layout || 'grid'}` });
  const filters = el('div', { class: 'chips filters' });

  let active = 'all';
  const draw = () => {
    clear(grid);
    const shown = objects.filter(o => active === 'all' || o.stage === active);
    if (!shown.length) {
      grid.appendChild(el('div', { class: 'empty' }, [
        placeholder(`${world.name} gallery — asset slots ready (visual production)`, 'gallery'),
        el('p', { class: 'muted', text: 'No assets in this stage yet. Slots are ready for Yordan & ChatGPT to populate.' })
      ]));
      return;
    }
    for (const o of shown) {
      grid.appendChild(el('a', { class: 'tile', href: `#/object/${o.id}` }, [
        placeholder(`${o.type}`, 'tile'),
        el('div', { class: 'tile__body' }, [
          el('span', { class: 'tile__title', text: o.title }),
          el('div', { class: 'tile__meta' }, [badge(o.stage, o.stage === 'final' ? 'ok' : 'neutral'), o.canonical ? badge('canonical', 'attention') : null])
        ])
      ]));
    }
  };

  const mkFilter = (label, value) => {
    const b = el('button', { class: 'chip chip--filter', type: 'button', text: label, attrs: value === active ? { 'aria-pressed': 'true' } : {} });
    b.addEventListener('click', () => {
      active = value;
      filters.querySelectorAll('.chip--filter').forEach(c => c.removeAttribute('aria-pressed'));
      b.setAttribute('aria-pressed', 'true');
      draw();
    });
    return b;
  };
  filters.append(mkFilter('All', 'all'), ...stages.map(s => mkFilter(s, s)));
  draw();

  return el('section', { class: 'view view--gallery', attrs: { style: `--accent:${world.color}` } }, [
    el('nav', { class: 'crumbs' }, [el('a', { class: 'link', href: `#/world/${world.id}`, text: world.name }), ' / Gallery']),
    el('header', { class: 'view__head' }, [
      el('h1', { text: `${world.name} — Gallery` }),
      el('p', { class: 'muted', text: 'Project-specific immersive gallery. Each World owns its own; this is not the global layer.' })
    ]),
    filters,
    grid
  ]);
}
