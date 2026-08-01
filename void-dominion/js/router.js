// router.js — client-side hash routing with browser history and route guards.

export class Router {
  constructor() {
    this.routes = [];
    this.guards = [];
    this.current = null;
    this._onHash = this._onHash.bind(this);
  }

  // pattern examples: '#/dominion', '#/world/:worldId', '#/world/:worldId/room/:roomId'
  add(pattern, handler, meta = {}) {
    const parts = pattern.replace(/^#/, '').split('/').filter(Boolean);
    this.routes.push({ pattern, parts, handler, meta });
    return this;
  }

  guard(fn) {
    this.guards.push(fn);
    return this;
  }

  start() {
    window.addEventListener('hashchange', this._onHash);
    this._onHash();
  }

  stop() {
    window.removeEventListener('hashchange', this._onHash);
  }

  navigate(path) {
    const target = path.startsWith('#') ? path : `#${path}`;
    if (location.hash === target) this._onHash();
    else location.hash = target;
  }

  _parse(hash) {
    const raw = (hash || '#/dominion').replace(/^#/, '');
    const [pathPart, queryPart] = raw.split('?');
    const parts = pathPart.split('/').filter(Boolean);
    const query = {};
    if (queryPart) {
      for (const pair of queryPart.split('&')) {
        const [k, v] = pair.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      }
    }
    return { parts, query, raw: pathPart };
  }

  _match(parts) {
    for (const route of this.routes) {
      if (route.parts.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < route.parts.length; i++) {
        const seg = route.parts[i];
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) { ok = false; break; }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  _onHash() {
    const { parts, query } = this._parse(location.hash);
    const matched = this._match(parts);
    if (!matched) {
      this.navigate('/dominion');
      return;
    }
    const ctx = { params: matched.params, query, path: location.hash, meta: matched.route.meta };
    for (const g of this.guards) {
      const verdict = g(ctx);
      if (verdict === false) return;
      if (typeof verdict === 'string') { this.navigate(verdict); return; }
    }
    this.current = ctx;
    matched.route.handler(ctx);
  }
}
