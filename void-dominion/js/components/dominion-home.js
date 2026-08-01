// dominion-home.js — Void Dominion home and system status (#/dominion).
// The top shell. Establishes the hierarchy visibly and routes into Atlas.

import { el, placeholder, badge } from './dom.js';

export function renderDominionHome(app) {
  const sys = app.store.getSystem();
  const worlds = app.store.getWorlds();
  const locations = app.store.getLocations();
  const pending = app.store.getPendingApprovals().length;

  return el('section', { class: 'view view--dominion' }, [
    el('div', { class: 'hero', attrs: { 'data-slot': 'dominion-home-composition' } }, [
      placeholder('Void Dominion home composition — Void Lord & halo (visual production)', 'hero'),
      el('div', { class: 'hero__overlay' }, [
        el('p', { class: 'eyebrow', text: 'Highest shell' }),
        el('h1', { class: 'hero__title', text: sys ? sys.name : 'Void Dominion' }),
        el('p', { class: 'hero__tagline', text: sys ? sys.tagline : '' }),
        el('a', { class: 'btn btn--primary btn--lg', href: '#/atlas', text: 'Enter Atlas →' })
      ])
    ]),
    el('div', { class: 'grid grid--stats' }, [
      stat('Atlas', 'Operating map', '#/atlas'),
      stat('Nexus', 'Convergence centre', '#/nexus'),
      stat(String(locations.length), 'Permanent Locations', '#/atlas'),
      stat(String(worlds.length), 'Project Worlds', '#/worlds'),
      stat(String(pending), pending === 1 ? 'Pending approval' : 'Pending approvals', '#/approvals')
    ]),
    el('div', { class: 'panel' }, [
      el('h2', { text: 'Canonical hierarchy' }),
      el('pre', { class: 'code code--tree', text:
`VOID DOMINION
└── ATLAS
    ├── Nexus
    ├── 9 Permanent Locations   (global infrastructure — includes Void Dominion)
    └── Project Worlds
        └── World (own immersive gallery, canon, rooms, objects, tools)` }),
      el('p', { class: 'muted', text: sys ? sys.canonNote : '' })
    ])
  ]);
}

function stat(value, label, href) {
  return el('a', { class: 'stat', href }, [
    el('span', { class: 'stat__value', text: value }),
    el('span', { class: 'stat__label', text: label })
  ]);
}
