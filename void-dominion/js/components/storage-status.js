// storage-status.js — provider + persistence status strip.
// Displays provider connection/mode honestly at the point of action (§12).

import { el, clear, iconStatus } from './dom.js';

export function renderStorageStatus(app, container) {
  const draw = () => {
    clear(container);
    const durable = app.persistence.durable;
    container.appendChild(iconStatus(
      durable ? 'IndexedDB (durable)' : 'In-memory (ephemeral)',
      durable ? 'live' : 'partial'
    ));
    for (const s of app.providers.statuses()) {
      const variant = s.mode === 'live' ? 'live' : s.mode === 'mock' ? 'mock' : 'stub';
      container.appendChild(iconStatus(`${s.label}`, variant));
    }
  };
  draw();
  app.bus.on('settings:changed', draw);
  app.bus.on('state:replaced', draw);
  return container;
}
