// nexus-view.js — central operating centre (#/nexus).
// Practical before decorative: what changed, what matters now, what needs
// approval, and a resume affordance.

import { el, iconStatus } from './dom.js';
import { renderTimeline } from './activity-timeline.js';
import { lastMeaningful } from '../activity.js';

export function renderNexus(app) {
  const worlds = app.store.getWorlds();
  const activity = app.store.getActivity();
  const pending = app.store.getPendingApprovals();
  const chief = app.store.getChief();
  const resume = lastMeaningful(activity);

  const attention = worlds.filter(w => (w.blockers || []).length || w.status === 'blocked' || !w.nextAction);
  const priority = worlds.filter(w => w.priority === 'high' && w.status === 'active');

  return el('section', { class: 'view view--nexus' }, [
    el('header', { class: 'view__head' }, [
      el('h1', { text: 'Nexus' }),
      el('p', { class: 'muted', text: 'Central convergence point and operating centre.' })
    ]),
    el('div', { class: 'grid grid--nexus' }, [
      panel('Current priority & next action', priority.length
        ? el('ul', { class: 'list' }, priority.slice(0, 3).map(w =>
            el('li', {}, [
              el('a', { class: 'link', href: `#/world/${w.id}`, text: w.name }),
              el('span', { class: 'muted', text: ` — next: ${w.nextAction || '(unset)'}` })
            ])))
        : el('p', { class: 'muted', text: 'No high-priority active Worlds.' })),

      panel('Pending approvals', pending.length
        ? el('ul', { class: 'list' }, pending.map(a =>
            el('li', {}, [
              iconStatus(a.risk, a.risk === 'critical' ? 'failure' : 'pending'),
              el('button', { class: 'link', type: 'button', text: a.summary, onClick: () => app.openApproval(a.id) })
            ])))
        : el('p', { class: 'muted', text: 'Nothing awaiting approval.' })),

      panel('Worlds requiring attention', attention.length
        ? el('ul', { class: 'list' }, attention.slice(0, 6).map(w =>
            el('li', {}, [el('a', { class: 'link', href: `#/world/${w.id}`, text: w.name }),
              el('span', { class: 'muted', text: w.status === 'blocked' ? ' — blocked' : ' — no next action set' })])))
        : el('p', { class: 'muted', text: 'All Worlds have a defined next action.' })),

      panel('Chief status & queue', el('div', {}, [
        iconStatus(`${chief.identity} — ${chief.providerLabel}`, 'mock'),
        el('p', { class: 'muted', text: `Queue: ${(chief.queue || []).length} item(s).` }),
        el('a', { class: 'link', href: '#/location/machine-oracle', text: 'Open Machine Oracle →' })
      ])),

      panel('Storage & provider health', el('ul', { class: 'list' }, app.providers.statuses().map(s =>
        el('li', {}, [iconStatus(`${s.label} — ${s.status}`, s.mode === 'live' ? 'live' : s.mode === 'mock' ? 'mock' : 'stub')])
      ))),

      panel('Resume last meaningful activity', resume
        ? el('div', {}, [
            el('p', { text: resume.summary || resume.type }),
            el('p', { class: 'muted', text: new Date(resume.timestamp).toLocaleString() }),
            resume.entityType === 'world' && resume.entityId
              ? el('a', { class: 'btn btn--ghost', href: `#/world/${resume.entityId}`, text: 'Resume →' })
              : el('a', { class: 'btn btn--ghost', href: '#/activity', text: 'Open activity →' })
          ])
        : el('p', { class: 'muted', text: 'No activity yet.' }))
    ]),
    panel('Recent meaningful activity', renderTimeline(activity, { limit: 8 }), 'wide')
  ]);
}

function panel(title, body, extra = '') {
  return el('section', { class: `panel ${extra ? 'panel--' + extra : ''}` }, [
    el('h2', { class: 'panel__title', text: title }), body
  ]);
}
