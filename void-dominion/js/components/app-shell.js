// app-shell.js — persistent chrome: brand, primary navigation, status strip,
// command bar mount, main outlet and modal root. Builds the operating shell
// that every route renders into.

import { el, clear, badge } from './dom.js';
import { renderStorageStatus } from './storage-status.js';
import { mountCommandBar } from './command-bar.js';

export function buildShell(app) {
  const outlet = el('main', { class: 'outlet', id: 'outlet', attrs: { 'aria-live': 'polite', tabindex: '-1' } });
  const modalRoot = el('div', { class: 'modal-root', id: 'modal-root' });
  const statusStrip = el('div', { class: 'status-strip', id: 'status-strip' });

  const nav = el('nav', { class: 'sidenav', attrs: { 'aria-label': 'Primary' } }, [
    el('div', { class: 'brand' }, [
      el('span', { class: 'brand__mark', attrs: { 'aria-hidden': 'true' }, text: '◆' }),
      el('span', { class: 'brand__name', text: 'VOID DOMINION' })
    ]),
    navGroup('Shell', [
      navLink('#/dominion', 'Void Dominion'),
      navLink('#/atlas', 'Atlas'),
      navLink('#/nexus', 'Nexus'),
      navLink('#/worlds', 'Project Worlds')
    ]),
    navGroup('Nine Locations', app.store.getLocations().map(l =>
      navLink(`#/location/${l.id}`, `${l.icon} ${l.name}`)
    )),
    navGroup('System', [
      navLink('#/approvals', 'Approvals', app.store.getPendingApprovals().length),
      navLink('#/activity', 'Activity'),
      navLink('#/settings', 'Settings')
    ])
  ]);

  const commandBarMount = el('div', { class: 'command-bar-mount', id: 'command-bar-mount' });

  const shell = el('div', { class: 'shell' }, [
    nav,
    el('div', { class: 'workspace' }, [
      el('header', { class: 'topbar' }, [commandBarMount, statusStrip]),
      outlet
    ]),
    modalRoot
  ]);

  app.dom = { outlet, modalRoot, statusStrip, nav, shell };

  mountCommandBar(app, commandBarMount);
  renderStorageStatus(app, statusStrip);

  // Keep nav badges + status strip fresh on state changes.
  app.bus.on('state:changed', () => {
    refreshApprovalBadge(app);
  });
  app.bus.on('approval:added', () => refreshApprovalBadge(app));

  return shell;
}

function navGroup(title, links) {
  return el('div', { class: 'navgroup' }, [
    el('h2', { class: 'navgroup__title', text: title }),
    el('ul', { class: 'navgroup__list' }, links.map(l => el('li', {}, [l])))
  ]);
}

function navLink(href, label, count = 0) {
  const children = [el('span', { class: 'navlink__label', text: label })];
  if (count > 0) children.push(badge(String(count), 'attention'));
  return el('a', { class: 'navlink', href, dataset: { route: href } }, children);
}

function refreshApprovalBadge(app) {
  const pending = app.store.getPendingApprovals().length;
  const link = app.dom.nav.querySelector('a[data-route="#/approvals"]');
  if (!link) return;
  clear(link);
  link.appendChild(el('span', { class: 'navlink__label', text: 'Approvals' }));
  if (pending > 0) link.appendChild(badge(String(pending), 'attention'));
}

export function setActiveNav() {
  document.querySelectorAll('.navlink').forEach(a => {
    const isActive = a.getAttribute('href') === location.hash ||
      (location.hash.startsWith(a.getAttribute('href')) && a.getAttribute('href') !== '#/');
    a.classList.toggle('is-active', isActive);
  });
}
