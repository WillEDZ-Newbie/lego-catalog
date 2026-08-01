// approval-dialog.js — high-friction approval modal.
// Shows exactly what will happen, every affected entity, reversibility and the
// backup/recovery method. Approve and Reject are separate controls; nothing but
// an explicit Approve click executes the action (§12 / §25.2).

import { el, clear, badge } from './dom.js';

export function openApprovalDialog(app, approval) {
  const root = app.dom.modalRoot;
  clear(root);

  const beforeText = JSON.stringify(approval.before || {}, null, 2);
  const afterText = JSON.stringify(approval.proposedAfter || {}, null, 2);

  const dialog = el('div', { class: 'modal', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Approval required' } }, [
    el('header', { class: 'modal__head' }, [
      el('h2', { class: 'modal__title', text: 'Approval required' }),
      badge(approval.risk.toUpperCase(), approval.risk === 'critical' ? 'critical' : 'attention')
    ]),
    el('p', { class: 'modal__summary', text: approval.summary }),
    el('dl', { class: 'kv' }, [
      kv('Action type', approval.actionType),
      kv('Reason', approval.reason || '—'),
      kv('Reversible', approval.rollbackAvailable ? 'Yes — rollback available' : 'No — irreversible'),
      kv('Backup', approval.requiresBackup ? 'A backup/snapshot will be taken before execution' : 'Not required')
    ]),
    el('div', { class: 'diff' }, [
      el('div', { class: 'diff__col' }, [el('h3', { text: 'Before' }), el('pre', { class: 'code', text: beforeText })]),
      el('div', { class: 'diff__col' }, [el('h3', { text: 'Proposed after' }), el('pre', { class: 'code', text: afterText })])
    ]),
    approval.affectedEntities && approval.affectedEntities.length
      ? el('div', { class: 'affected' }, [
          el('h3', { text: 'Affected entities & paths' }),
          el('ul', {}, approval.affectedEntities.map(e => el('li', { text: typeof e === 'string' ? e : JSON.stringify(e) })))
        ])
      : el('p', { class: 'muted', text: 'No affected entities recorded.' }),
    el('footer', { class: 'modal__foot' }, [
      el('button', { class: 'btn btn--danger', type: 'button', text: 'Reject', onClick: () => resolve('rejected') }),
      el('button', { class: 'btn btn--primary', type: 'button', text: 'Approve & execute', onClick: () => resolve('approved') })
    ])
  ]);

  const overlay = el('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) close(); } }, [dialog]);
  root.appendChild(overlay);
  dialog.querySelector('.btn--primary').focus();

  function close() { clear(root); }

  async function resolve(decision) {
    try {
      const res = await app.safety.resolveApproval(approval.id, decision);
      close();
      if (decision === 'approved') app.toast(res.ok ? 'Approved and executed.' : `Failed: ${res.error}`);
      else app.toast('Rejected. No action was taken.');
      app.rerender();
    } catch (err) {
      app.toast(`Could not resolve: ${err.message}`);
    }
  }

  // Esc closes without approving (silence is never approval).
  const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

function kv(k, v) {
  return el('div', { class: 'kv__row' }, [
    el('dt', { text: k }), el('dd', { text: String(v) })
  ]);
}
