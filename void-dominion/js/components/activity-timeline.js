// activity-timeline.js — reusable auditable activity list.
// Renders records with non-colour status glyphs and before/after affordance.

import { el, iconStatus } from './dom.js';

export function renderTimeline(entries, { limit = 50 } = {}) {
  const list = el('ol', { class: 'timeline' });
  const slice = entries.slice(0, limit);
  if (!slice.length) list.appendChild(el('li', { class: 'muted', text: 'No activity recorded yet.' }));
  for (const a of slice) {
    const when = a.timestamp ? new Date(a.timestamp).toLocaleString() : '';
    list.appendChild(el('li', { class: 'timeline__item' }, [
      el('div', { class: 'timeline__meta' }, [
        iconStatus(a.result, a.result),
        el('time', { class: 'timeline__time', text: when })
      ]),
      el('div', { class: 'timeline__body' }, [
        el('span', { class: 'timeline__type', text: a.type }),
        el('span', { class: 'timeline__summary', text: a.summary || '' }),
        el('span', { class: 'timeline__actor', text: `actor: ${a.actor}${a.approvalId ? ` · approval: ${a.approvalId}` : ''}` })
      ])
    ]));
  }
  return list;
}
