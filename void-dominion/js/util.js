// util.js — small shared helpers (IDs, timestamps, HTML escaping, formatting).

// Generate a stable unique ID with a semantic prefix.
export function makeId(prefix = 'id') {
  const rand =
    (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().split('-')[0]
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rand}`;
}

// ISO timestamp for the current moment.
export function now() {
  return new Date().toISOString();
}

// Escape a string for safe interpolation into HTML.
// All user-generated / data-driven strings MUST pass through this before
// being placed into innerHTML. Avoids unsafe HTML injection.
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Escape a string for use inside an HTML attribute value in quotes.
export function escAttr(value) {
  return esc(value);
}

// Human-friendly relative/absolute time.
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Deep clone via structured-clone when available, else JSON fallback.
export function clone(obj) {
  if (typeof structuredClone === 'function') return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

// Title-case-ish label from an id or slug.
export function humanize(str) {
  if (!str) return '';
  return String(str)
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
