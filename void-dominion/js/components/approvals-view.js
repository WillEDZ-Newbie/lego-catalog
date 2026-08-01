// approvals-view.js — pending and resolved consequential actions (#/approvals).

import { el, badge, iconStatus } from './dom.js';

export function renderApprovals(app) {
  const all = app.store.getApprovals();
  const pending = all.filter(a => a.status === 'pending');
  const resolved = all.filter(a => a.status !== 'pending');

  return el('section', { class: 'view view--approvals' }, [
    el('header', { class: 'view__head' }, [
      el('h1', { text: 'Approvals' }),
      el('p', { class: 'muted', text: 'Consequential and destructive actions require explicit approval immediately before execution.' })
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title', text: `Pending (${pending.length})` }),
      pending.length
        ? el('ul', { class: 'list' }, pending.map(a => el('li', { class: 'approval-row' }, [
            badge(a.risk.toUpperCase(), a.risk === 'critical' ? 'critical' : 'attention'),
            el('span', { text: a.summary }),
            el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Review', onClick: () => app.openApproval(a.id) })
          ])))
        : el('p', { class: 'muted', text: 'Nothing awaiting approval.' })
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title', text: 'Resolved' }),
      resolved.length
        ? el('ul', { class: 'list' }, resolved.map(a => el('li', {}, [
            iconStatus(a.status, a.status === 'executed' ? 'success' : a.status === 'rejected' ? 'failure' : 'partial'),
            el('span', { text: ` ${a.summary}` })
          ])))
        : el('p', { class: 'muted', text: 'No resolved approvals yet.' })
    ])
  ]);
}
