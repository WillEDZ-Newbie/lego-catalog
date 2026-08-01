// object-viewer.js — Object metadata, preview and source references.
// A source file can be opened/revealed only when the provider capability
// genuinely supports it (§28.4). Otherwise the control is disabled/labelled.

import { esc, formatDate } from '../util.js';
import { resolveAuthority } from '../source-resolver.js';
import { can } from '../providers/provider-registry.js';

export function render(params, state) {
  const o = state.objects.find((x) => x.id === params.objectId);
  if (!o) return `<section class="view"><div class="panel"><h1>Object not found</h1><a class="link" href="#/worlds">Back</a></div></section>`;
  const world = state.worlds.find((w) => w.id === o.worldId);
  const authority = resolveAuthority(o, state.sources);
  const provider = (state.settings.providers || []).find((p) => p.providerId === o.provider);
  const canOpen = can(o.provider, 'read');

  return `
  <section class="view view--object">
    <header class="view__header">
      ${world ? `<p class="crumb"><a href="#/world/${esc(world.id)}">${esc(world.name)}</a> / Object</p>` : ''}
      <h1>${esc(o.title)}</h1>
    </header>
    <div class="object-grid">
      <div class="panel">
        <div class="object-preview" data-asset-slot="object-preview">
          <span class="badge badge--placeholder">${esc(o.type)} preview</span>
        </div>
      </div>
      <div class="panel">
        <h2 class="panel__title">Source references</h2>
        <dl class="kv">
          <div><dt>Provider</dt><dd><span class="tag tag--mock">${esc(o.provider)}</span> ${provider ? `<span class="muted">${esc(provider.status)}</span>` : ''}</dd></div>
          <div><dt>Canonical</dt><dd>${o.canonical ? 'Yes' : 'No'}</dd></div>
          <div><dt>Authority</dt><dd>${esc(authority.authority)}</dd></div>
          <div><dt>Path</dt><dd class="mono">${esc(o.path || '—')}</dd></div>
          <div><dt>Repository</dt><dd class="mono">${o.repositoryUrl ? `<a href="${esc(o.repositoryUrl)}" target="_blank" rel="noopener">${esc(o.repositoryUrl)}</a>` : '—'}</dd></div>
          <div><dt>Stage</dt><dd>${esc(o.stage)}</dd></div>
          <div><dt>Tags</dt><dd>${(o.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join(' ') || '—'}</dd></div>
          <div><dt>Updated</dt><dd>${esc(formatDate(o.updatedAt))}</dd></div>
        </dl>
        <div class="row">
          <button class="btn" data-action="open-source" data-id="${esc(o.id)}" ${canOpen ? '' : 'disabled'} title="${canOpen ? 'Open via provider' : 'Provider cannot open this reference'}">
            ${canOpen ? 'Open source' : 'Open source (unavailable)'}
          </button>
          <button class="btn" data-action="edit-object" data-id="${esc(o.id)}">Edit metadata</button>
          <button class="btn btn--danger" data-action="delete-object" data-id="${esc(o.id)}">Delete</button>
        </div>
        ${!canOpen ? `<p class="callout callout--warn">This provider is a labelled stub and cannot open the file. The reference is preserved; the action is not faked.</p>` : ''}
      </div>
    </div>
  </section>`;
}
