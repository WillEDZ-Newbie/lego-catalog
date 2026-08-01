// ui.js — lightweight modal, toast and confirm helpers.
// No framework. Builds DOM safely and returns promises for dialogs.

import { esc } from './util.js';

let modalRoot = null;
let toastRoot = null;

export function initUI() {
  modalRoot = document.getElementById('modal-root');
  toastRoot = document.getElementById('toast-root');
}

// Show a modal with arbitrary HTML content. Returns { close }.
export function openModal({ title, bodyHtml, actionsHtml = '', onMount } = {}) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', title || 'Dialog');
  overlay.innerHTML = `
    <div class="modal" role="document">
      <header class="modal__header">
        <h2 class="modal__title">${esc(title || '')}</h2>
        <button class="btn btn--icon" data-modal-close aria-label="Close dialog">✕</button>
      </header>
      <div class="modal__body">${bodyHtml || ''}</div>
      <footer class="modal__actions">${actionsHtml}</footer>
    </div>`;
  modalRoot.appendChild(overlay);
  modalRoot.hidden = false;

  const close = () => {
    overlay.remove();
    if (!modalRoot.children.length) modalRoot.hidden = true;
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-modal-close]')) close();
  });
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
  const focusable = overlay.querySelector('input, textarea, select, button:not([data-modal-close])');
  if (focusable) focusable.focus();
  if (onMount) onMount(overlay, close);
  return { close, overlay };
}

// Confirmation dialog. Resolves true/false. Never treats close as approval.
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false } = {}) {
  return new Promise((resolve) => {
    const { close } = openModal({
      title,
      bodyHtml: `<p>${esc(message)}</p>`,
      actionsHtml: `
        <button class="btn" data-choice="cancel">Cancel</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-choice="confirm">${esc(confirmLabel)}</button>`,
      onMount: (overlay, closeFn) => {
        overlay.addEventListener('click', (e) => {
          const choice = e.target.closest('[data-choice]');
          if (!choice) return;
          const val = choice.dataset.choice === 'confirm';
          closeFn();
          resolve(val);
        });
        // Closing via ✕/overlay/Esc resolves false (not approval).
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay || e.target.closest('[data-modal-close]')) resolve(false);
        });
      },
    });
  });
}

// Transient toast notification.
export function toast(message, { kind = 'info', timeout = 3200 } = {}) {
  const el = document.createElement('div');
  el.className = `toast toast--${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = message;
  toastRoot.appendChild(el);
  setTimeout(() => { el.classList.add('toast--out'); setTimeout(() => el.remove(), 300); }, timeout);
}
