// router.js — client-side hash routing with route guards and history support.
// Routes are matched against a small table; the matched view render function
// receives parsed params. Uses the URL hash so the app runs from file:// or a
// static server with no server-side routing.

const routes = [];

export function defineRoute(pattern, handler, meta = {}) {
  // pattern like '#/world/:worldId/room/:roomId'
  const keys = [];
  const regexStr = '^' + pattern.split('/').map((seg) => {
    if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }).join('/') + '$';
  routes.push({ pattern, regex: new RegExp(regexStr), keys, handler, meta });
}

function match(hash) {
  const clean = hash || '#/dominion';
  for (const route of routes) {
    const m = clean.match(route.regex);
    if (m) {
      const params = {};
      route.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route, params };
    }
  }
  return null;
}

let currentGuard = null;
export function setGuard(fn) { currentGuard = fn; }

let onNavigate = () => {};
export function onRoute(fn) { onNavigate = fn; }

export async function resolve() {
  const hash = window.location.hash || '#/dominion';
  const found = match(hash);
  if (!found) {
    onNavigate({ notFound: true, hash });
    return;
  }
  if (currentGuard) {
    const ok = await currentGuard(found);
    if (!ok) return;
  }
  onNavigate({ ...found, hash });
}

export function navigate(hash) {
  if (window.location.hash === hash) resolve();
  else window.location.hash = hash;
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
