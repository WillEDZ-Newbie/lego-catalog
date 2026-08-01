// worlds-view.js — Project World directory (#/worlds).

import { el, badge } from './dom.js';

export function renderWorlds(app) {
  const worlds = app.store.getWorlds();
  return el('section', { class: 'view view--worlds' }, [
    el('header', { class: 'view__head' }, [
      el('h1', { text: 'Project Worlds' }),
      el('p', { class: 'muted', text: 'Each significant project is its own immersive World with its own gallery.' }),
      el('button', { class: 'btn btn--primary', type: 'button', text: '+ Propose World', onClick: () => app.proposeWorld() })
    ]),
    el('div', { class: 'grid grid--worlds' }, worlds.map(w =>
      el('a', { class: 'card card--world', href: `#/world/${w.id}`, attrs: { style: `--accent:${w.color}` } }, [
        el('span', { class: 'card__symbol', attrs: { 'aria-hidden': 'true' }, text: w.symbol || '◆' }),
        el('h3', { class: 'card__title', text: w.name }),
        el('p', { class: 'card__desc', text: w.description || '' }),
        el('div', { class: 'card__foot' }, [badge(w.status, w.status === 'active' ? 'ok' : 'neutral'), badge(`${w.priority}`, 'neutral')])
      ])
    ))
  ]);
}
