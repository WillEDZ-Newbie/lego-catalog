// atlas-view.js — Atlas overview and World map (#/atlas).
// Presents Nexus, the nine permanent Locations and the Project Worlds map.

import { el } from './dom.js';

export function renderAtlas(app) {
  const locations = app.store.getLocations();
  const worlds = app.store.getWorlds();

  return el('section', { class: 'view view--atlas' }, [
    el('header', { class: 'view__head' }, [
      el('h1', { text: 'Atlas' }),
      el('p', { class: 'muted', text: 'The visible operating map. Nine permanent Locations provide the infrastructure of the whole system, including Void Dominion.' })
    ]),
    el('a', { class: 'nexus-callout', href: '#/nexus' }, [
      el('span', { class: 'nexus-callout__mark', text: '✦' }),
      el('span', {}, [el('strong', { text: 'Nexus' }), el('span', { class: 'muted', text: ' — central convergence point. What changed, what matters now, what needs approval.' })])
    ]),
    el('h2', { class: 'section-title', text: 'Nine permanent Locations' }),
    el('div', { class: 'grid grid--locations' }, locations.map(l =>
      el('a', { class: 'card card--location', href: `#/location/${l.id}`, attrs: { style: `--accent:${l.accent}` } }, [
        el('span', { class: 'card__icon', attrs: { 'aria-hidden': 'true' }, text: l.icon }),
        el('span', { class: 'card__index', text: `Location ${l.index}` }),
        el('h3', { class: 'card__title', text: l.name }),
        el('p', { class: 'card__desc', text: l.responsibility })
      ])
    )),
    el('div', { class: 'section-title-row' }, [
      el('h2', { class: 'section-title', text: 'Project Worlds' }),
      el('a', { class: 'btn btn--ghost', href: '#/worlds', text: 'Open directory →' })
    ]),
    el('div', { class: 'grid grid--worlds' }, worlds.map(w => worldCard(w)))
  ]);
}

function worldCard(w) {
  return el('a', { class: 'card card--world', href: `#/world/${w.id}`, attrs: { style: `--accent:${w.color}` } }, [
    el('span', { class: 'card__symbol', attrs: { 'aria-hidden': 'true' }, text: w.symbol || '◆' }),
    el('h3', { class: 'card__title', text: w.name }),
    el('p', { class: 'card__desc', text: w.description || '' }),
    el('span', { class: 'card__foot', text: `${w.status} · ${w.priority} priority` })
  ]);
}
