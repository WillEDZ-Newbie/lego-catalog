// events.js — meaningful cross-module event bus.
// Small pub/sub used for decoupled communication between the store,
// router and components. Not a replacement for the central store.

const listeners = new Map();

export function on(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => off(type, handler);
}

export function off(type, handler) {
  const set = listeners.get(type);
  if (set) set.delete(handler);
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (set) {
    for (const handler of Array.from(set)) {
      try {
        handler(payload);
      } catch (err) {
        // A failing listener must not break the emitter.
        // eslint-disable-next-line no-console
        console.error(`[events] listener for "${type}" threw`, err);
      }
    }
  }
  // Wildcard listeners receive every event.
  const wild = listeners.get('*');
  if (wild) {
    for (const handler of Array.from(wild)) {
      try {
        handler({ type, payload });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[events] wildcard listener threw', err);
      }
    }
  }
}

export function clearAll() {
  listeners.clear();
}
