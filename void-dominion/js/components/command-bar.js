// command-bar.js — Atlas-wide search and quick capture.
// Search queries the SearchIndex; capture routes to the mock Chief provider.
// Keyboard: "/" focuses search, Enter opens the top result.

import { el, clear } from './dom.js';

export function mountCommandBar(app, container) {
  const input = el('input', {
    class: 'command-bar__input', type: 'search',
    attrs: { placeholder: 'Search Atlas  ·  press / to focus', 'aria-label': 'Search Atlas' }
  });
  const results = el('div', { class: 'command-bar__results', attrs: { role: 'listbox', hidden: 'hidden' } });
  const captureBtn = el('button', {
    class: 'btn btn--ghost', type: 'button',
    attrs: { 'aria-label': 'Quick capture to Chief' }, text: '＋ Capture'
  });

  const bar = el('div', { class: 'command-bar', attrs: { role: 'search' } }, [
    el('span', { class: 'command-bar__icon', attrs: { 'aria-hidden': 'true' }, text: '⌕' }),
    input, captureBtn, results
  ]);

  function renderResults(list) {
    clear(results);
    if (!list.length) { results.setAttribute('hidden', 'hidden'); return; }
    results.removeAttribute('hidden');
    for (const r of list) {
      const item = el('a', {
        class: 'command-bar__result', href: r.route, attrs: { role: 'option' }
      }, [
        el('span', { class: 'command-bar__result-kind', text: r.kind }),
        el('span', { class: 'command-bar__result-title', text: r.title })
      ]);
      item.addEventListener('click', () => { results.setAttribute('hidden', 'hidden'); input.value = ''; });
      results.appendChild(item);
    }
  }

  let current = [];
  input.addEventListener('input', () => {
    current = app.search.query(input.value);
    renderResults(current);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && current[0]) { app.router.navigate(current[0].route); results.setAttribute('hidden', 'hidden'); }
    if (e.key === 'Escape') { input.value = ''; renderResults([]); }
  });
  input.addEventListener('blur', () => setTimeout(() => results.setAttribute('hidden', 'hidden'), 150));

  captureBtn.addEventListener('click', async () => {
    const text = input.value.trim() || prompt('Capture to Chief:');
    if (!text) return;
    const res = await app.chief.capture(text);
    await app.store.addActivity({
      actor: 'user', type: 'chief.capture', entityType: 'chief', entityId: 'chief',
      summary: `Captured to Chief queue (${res.item.level}): ${text.slice(0, 60)}`, result: 'success'
    });
    input.value = '';
    renderResults([]);
    app.toast(`Captured to Chief · suggested level: ${res.item.level}`);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== input && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault();
      input.focus();
    }
  });

  clear(container);
  container.appendChild(bar);
  return bar;
}
