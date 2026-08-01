// storage-status.js — provider capability and source integrity display.
// Shows truthful provider status and broken-reference warnings at the point of
// action. Never infers access from the presence of a path or URL.

import { esc, formatDate } from '../util.js';
import { availabilityLabel } from '../source-resolver.js';

export function renderStorageStatus(state) {
  const providers = state.settings.providers || [];
  const providerRows = providers.map((p) => {
    const caps = Object.entries(p.capabilities || {}).filter(([, v]) => v).map(([k]) => k);
    return `<tr>
      <td>${esc(p.providerId)}</td>
      <td><span class="tag tag--${statusTag(p.status)}">${esc(p.status)}</span></td>
      <td class="muted">${esc(caps.join(', ') || 'none')}</td>
      <td class="muted">${esc(p.label)}</td>
    </tr>`;
  }).join('');

  const sources = state.sources || [];
  const sourceRows = sources.map((s) => `<tr>
    <td>${esc(s.provider)}</td>
    <td>${esc(s.authority)}</td>
    <td class="muted">${esc(s.repository || s.path || s.url || '—')}</td>
    <td>${esc(availabilityLabel(s))}</td>
    <td class="muted">${s.lastVerifiedAt ? esc(formatDate(s.lastVerifiedAt)) : 'never'}</td>
  </tr>`).join('');

  const conflicts = state.conflicts || [];

  return `
    <div class="panel">
      <h2 class="panel__title">Storage providers</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Provider</th><th>Status</th><th>Capabilities</th><th>Notes</th></tr></thead>
          <tbody>${providerRows}</tbody>
        </table>
      </div>
    </div>
    <div class="panel">
      <h2 class="panel__title">Source registry</h2>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Provider</th><th>Authority</th><th>Reference</th><th>Availability</th><th>Verified</th></tr></thead>
          <tbody>${sourceRows || '<tr><td colspan="5" class="muted">No sources registered.</td></tr>'}</tbody>
        </table>
      </div>
      ${conflicts.length ? `<p class="callout callout--warn">Source conflicts detected: ${conflicts.length}. Conflicting authoritative sources are reported, not auto-resolved.</p>` : ''}
    </div>`;
}

function statusTag(status) {
  if (status === 'connected') return 'low';
  if (status === 'mock') return 'mock';
  return 'high';
}
