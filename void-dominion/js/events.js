// events.js — meaningful cross-module event bus.
// Small, dependency-free pub/sub used by the store, router and views.

export class EventBus {
  constructor() {
    this._handlers = new Map();
  }

  on(type, handler) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(handler);
    return () => this.off(type, handler);
  }

  off(type, handler) {
    const set = this._handlers.get(type);
    if (set) set.delete(handler);
  }

  emit(type, detail) {
    const set = this._handlers.get(type);
    if (set) {
      for (const handler of [...set]) {
        try {
          handler(detail, type);
        } catch (err) {
          // A listener failure must not break other listeners.
          console.error(`[events] handler for "${type}" threw`, err);
        }
      }
    }
    // Wildcard listeners receive every event.
    const wild = this._handlers.get('*');
    if (wild) {
      for (const handler of [...wild]) {
        try {
          handler(detail, type);
        } catch (err) {
          console.error('[events] wildcard handler threw', err);
        }
      }
    }
  }
}

export const bus = new EventBus();
