// dominion-home.js — Void Dominion home and system status.
// The focal composition (Void Lord, halo) is a labelled placeholder slot for
// later visual production; the surrounding system status is fully functional.

import { esc } from '../util.js';

export function render(_params, state) {
  const pending = state.approvals.filter((a) => a.status === 'pending').length;
  const activeWorlds = state.worlds.filter((w) => w.status === 'active').length;
  const contract = state.system.shortcutsContract || [];

  return `
  <section class="view view--dominion">
    <div class="focal" data-asset-slot="dominion-home" aria-label="Void Dominion focal composition placeholder">
      <div class="focal__halo" aria-hidden="true"></div>
      <div class="focal__caption">
        <span class="badge badge--placeholder">Placeholder slot</span>
        <h1 class="focal__title">Void Dominion</h1>
        <p class="focal__sub">Void Lord &amp; halo focal composition to be supplied during visual production.</p>
      </div>
    </div>

    <div class="cards">
      <a class="card card--link" href="#/atlas">
        <h3>Enter Atlas</h3>
        <p>Operating map, Nexus, nine Locations and Project Worlds.</p>
      </a>
      <a class="card card--link" href="#/nexus">
        <h3>Nexus</h3>
        <p>What changed, what matters now, what needs approval.</p>
      </a>
      <a class="card card--link" href="#/worlds">
        <h3>Project Worlds</h3>
        <p>${esc(activeWorlds)} active of ${esc(state.worlds.length)} total.</p>
      </a>
    </div>

    <div class="panel">
      <h2 class="panel__title">System status</h2>
      <dl class="kv">
        <div><dt>Shell</dt><dd>${esc(state.system.shell)}</dd></div>
        <div><dt>Operating interface</dt><dd>${esc(state.system.operatingInterface)}</dd></div>
        <div><dt>Convergence point</dt><dd>${esc(state.system.convergencePoint)} <span class="muted">(not a tenth Location)</span></dd></div>
        <div><dt>Permanent Locations</dt><dd>${esc(state.locations.length)} <span class="muted">(canonical — no tenth)</span></dd></div>
        <div><dt>Pending approvals</dt><dd>${esc(pending)}</dd></div>
        <div><dt>Document authority</dt><dd>${esc(state.system.documentAuthority)}</dd></div>
      </dl>
    </div>

    <div class="panel">
      <h2 class="panel__title">Locked Chief Shortcuts contract</h2>
      <p class="muted">These components are locked. They must not be renamed, merged or split without explicit approval.</p>
      <ul class="chips">
        ${contract.map((c) => `<li class="chip">${esc(c)}</li>`).join('')}
      </ul>
    </div>
  </section>`;
}
