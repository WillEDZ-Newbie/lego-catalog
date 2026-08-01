// command-bar.js — global search + quick navigation (Ctrl/Cmd+K).
// Searches the Atlas index across Worlds, Objects, Rooms and Locations.

import { esc } from '../util.js';
import { openModal } from '../ui.js';
import { buildIndex, query } from '../search.js';
import { navigate } from '../router.js';

export function openCommandBar(state) {
  const index = buildIndex(state);
  const { overlay, close } = openModal({
    title: 'Command bar',
    bodyHtml: `
      <input class="input input--lg" type="search" id="command-input" placeholder="Search Worlds, Objects, Rooms, Locations…" aria-label="Search" autocomplete="off">
      <ul class="command-results" id="command-results"></ul>
      <p class="muted">Tip: press Enter to open the top result.</p>`,
  });

  const input = overlay.querySelector('#command-input');
  const results = overlay.querySelector('#command-results');
  let current = [];

  function renderResults(list) {
    current = list;
    results.innerHTML = list.map((r, i) => `
      <li class="command-result ${i === 0 ? 'is-active' : ''}">
        <a href="${esc(r.route)}" data-close-command>
          <span class="command-result__title">${esc(r.title)}</span>
          <span class="command-result__kind">${esc(r.kind)}</span>
          <span class="command-result__sub muted">${esc(r.subtitle)}</span>
        </a>
      </li>`).join('') || '<li class="muted">No matches.</li>';
  }

  input.addEventListener('input', () => renderResults(query(index, input.value, { limit: 12 })));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && current[0]) {
      close();
      navigate(current[0].route);
    }
  });
  overlay.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-command]')) close();
  });
  input.focus();
}
