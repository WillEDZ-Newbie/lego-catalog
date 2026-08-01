// dom.js — minimal safe DOM helpers shared by all views.
// el() builds elements; text is always set via textContent (never innerHTML)
// so user-generated content cannot inject markup (brief §12 / §19).

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') throw new Error('Raw HTML is not allowed; use text.');
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'attrs') for (const [ak, av] of Object.entries(v)) node.setAttribute(ak, av);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function mount(container, node) {
  clear(container);
  container.appendChild(node);
  return container;
}

// A labelled placeholder slot — the handoff seam for visual production (§16/§30).
export function placeholder(label, kind = 'surface') {
  return el('div', { class: `placeholder placeholder--${kind}`, attrs: { 'data-slot': label, role: 'img', 'aria-label': `Placeholder: ${label}` } }, [
    el('span', { class: 'placeholder__tag', text: 'PLACEHOLDER' }),
    el('span', { class: 'placeholder__label', text: label })
  ]);
}

export function badge(text, variant = 'neutral') {
  return el('span', { class: `badge badge--${variant}`, text });
}

export function iconStatus(text, variant) {
  // Non-colour status indicator: symbol + text, not colour alone (§6 a11y).
  const sym = { success: '✓', partial: '◐', failure: '✕', pending: '⧗', mock: '◍', live: '●', stub: '○' }[variant] || '•';
  return el('span', { class: `status status--${variant}` }, [
    el('span', { class: 'status__sym', attrs: { 'aria-hidden': 'true' }, text: sym }),
    el('span', { class: 'status__text', text })
  ]);
}
