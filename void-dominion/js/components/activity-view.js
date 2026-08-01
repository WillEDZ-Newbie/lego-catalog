// activity-view.js — auditable system activity (#/activity).

import { el } from './dom.js';
import { renderTimeline } from './activity-timeline.js';
import { filterActivity } from '../activity.js';

export function renderActivity(app) {
  const activity = app.store.getActivity();
  const out = el('div', {});
  const redraw = (list) => out.replaceChildren(renderTimeline(list, { limit: 200 }));

  const actorSel = el('select', { class: 'input input--select' },
    ['', 'user', 'system', 'chief', 'provider'].map(a => el('option', { value: a, text: a || 'all actors' })));
  const resultSel = el('select', { class: 'input input--select' },
    ['', 'success', 'partial', 'failure'].map(r => el('option', { value: r, text: r || 'all results' })));
  const apply = () => redraw(filterActivity(activity, { actor: actorSel.value || undefined, result: resultSel.value || undefined }));
  actorSel.addEventListener('change', apply);
  resultSel.addEventListener('change', apply);

  redraw(activity);

  return el('section', { class: 'view view--activity' }, [
    el('header', { class: 'view__head' }, [el('h1', { text: 'Activity' }), el('p', { class: 'muted', text: 'Every important mutation is recorded with actor, timestamp and result.' })]),
    el('div', { class: 'row filters' }, [actorSel, resultSel]),
    out
  ]);
}
