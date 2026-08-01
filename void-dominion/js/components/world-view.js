// world-view.js — immersive World home, rooms and control panel
// (#/world/:worldId and #/world/:worldId/room/:roomId).
// A World owns its project experience but cannot alter global infrastructure.

import { el, placeholder, badge, iconStatus } from './dom.js';
import { renderTimeline } from './activity-timeline.js';

export function renderWorld(app, ctx) {
  const world = app.store.getWorld(ctx.params.worldId);
  if (!world) return el('section', { class: 'view' }, [el('h1', { text: 'World not found' }), el('a', { class: 'link', href: '#/worlds', text: '← Directory' })]);

  if (ctx.params.roomId) return renderRoom(app, world, ctx.params.roomId);

  const objects = app.store.getObjectsForWorld(world.id);
  const activity = app.store.getActivity().filter(a => a.entityId === world.id || (world.objectIds || []).includes(a.entityId));
  const src = app.resolver.resolveForWorld(world.id);

  return el('section', { class: 'view view--world', attrs: { style: `--accent:${world.color}` } }, [
    // Entrance
    el('div', { class: 'world-entrance' }, [
      placeholder(`World cover & immersive background — ${world.name} (visual production)`, 'hero'),
      el('div', { class: 'world-entrance__overlay' }, [
        el('span', { class: 'world-entrance__symbol', text: world.symbol || '◆' }),
        el('h1', { text: world.name }),
        el('p', { class: 'muted', text: world.description || '' }),
        el('div', { class: 'row' }, [
          badge(world.status, world.status === 'active' ? 'ok' : 'neutral'),
          badge(`${world.priority} priority`, 'neutral'),
          el('a', { class: 'btn btn--primary', href: `#/world/${world.id}/gallery`, text: 'Enter gallery →' })
        ]),
        world.nextAction ? el('p', { class: 'resume', text: `Resume · next action: ${world.nextAction}` }) : null
      ])
    ]),

    el('div', { class: 'grid grid--two' }, [
      // Control panel
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel__title', text: 'Control panel' }),
        actionRow('Last action', world.lastAction || '—'),
        editableRow(app, world, 'Next action', 'nextAction'),
        editableRow(app, world, 'Future action', 'futureAction'),
        el('div', { class: 'kv__row' }, [el('dt', { text: 'Status' }), el('dd', {}, [statusControl(app, world)])]),
        el('div', { class: 'kv__row' }, [el('dt', { text: 'Source health' }), el('dd', {}, [
          src.authoritative
            ? iconStatus(`${src.authoritative.provider} · ${src.availability}`, src.availability === 'available' ? 'live' : 'stub')
            : el('span', { class: 'muted', text: 'No source linked.' }),
          src.conflict ? badge('SOURCE CONFLICT', 'critical') : null
        ])]),
        (world.blockers || []).length ? el('p', { class: 'note note--boundary', text: `Blockers: ${world.blockers.map(b => b.title || b).join(', ')}` }) : null,
        el('div', { class: 'row' }, [
          el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Archive World', onClick: () => app.archiveWorld(world.id) }),
          el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Delete World', onClick: () => app.deleteWorld(world.id) })
        ])
      ]),

      // Canon chamber
      el('section', { class: 'panel' }, [
        el('h2', { class: 'panel__title', text: 'Canon chamber' }),
        canonList(app, world),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Propose canon change', onClick: () => app.proposeCanonChange(world.id) }),
        (world.unresolvedQuestions || []).length ? el('div', {}, [
          el('h3', { text: 'Unresolved questions' }),
          el('ul', { class: 'list' }, world.unresolvedQuestions.map(q => el('li', { text: q })))
        ]) : null
      ])
    ]),

    // Rooms
    el('section', { class: 'panel' }, [
      el('h2', { class: 'panel__title', text: 'Rooms' }),
      el('div', { class: 'chips' }, (world.rooms || []).map(r =>
        el('a', { class: 'chip chip--link', href: `#/world/${world.id}/room/${r.id}`, text: r.name })))
    ]),

    // Objects / files
    el('section', { class: 'panel' }, [
      el('div', { class: 'section-title-row' }, [
        el('h2', { class: 'panel__title', text: 'Objects & file references' }),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '+ Add object', onClick: () => app.addObject(world.id) })
      ]),
      objects.length
        ? el('ul', { class: 'obj-list' }, objects.map(o => objectRow(o)))
        : el('p', { class: 'muted', text: 'No objects yet.' })
    ]),

    // World-scoped search + timeline
    el('div', { class: 'grid grid--two' }, [
      el('section', { class: 'panel' }, [el('h2', { class: 'panel__title', text: 'Project search' }), worldSearch(app, world.id)]),
      el('section', { class: 'panel' }, [el('h2', { class: 'panel__title', text: 'Timeline' }), renderTimeline(activity, { limit: 8 })])
    ])
  ]);
}

function renderRoom(app, world, roomId) {
  const room = (world.rooms || []).find(r => r.id === roomId);
  const objects = app.store.getObjectsForWorld(world.id).filter(o => o.roomId === roomId);
  return el('section', { class: 'view view--room', attrs: { style: `--accent:${world.color}` } }, [
    el('nav', { class: 'crumbs' }, [
      el('a', { class: 'link', href: `#/world/${world.id}`, text: world.name }), el('span', { text: ' / ' }),
      el('span', { text: room ? room.name : roomId })
    ]),
    el('h1', { text: room ? room.name : 'Room' }),
    el('p', { class: 'muted', text: room ? room.description : '' }),
    objects.length
      ? el('ul', { class: 'obj-list' }, objects.map(o => objectRow(o)))
      : el('p', { class: 'muted', text: 'No objects in this room.' })
  ]);
}

function objectRow(o) {
  return el('li', { class: 'obj-row' }, [
    el('a', { class: 'obj-row__title link', href: `#/object/${o.id}`, text: o.title }),
    badge(o.stage, o.stage === 'final' ? 'ok' : 'neutral'),
    o.canonical ? badge('canonical', 'attention') : null,
    el('span', { class: 'muted', text: `${o.type} · ${o.provider}` })
  ]);
}

function actionRow(label, value) {
  return el('div', { class: 'kv__row' }, [el('dt', { text: label }), el('dd', { text: value })]);
}

function editableRow(app, world, label, field) {
  const value = world[field] || '';
  const dd = el('dd', {});
  const view = el('span', { class: value ? '' : 'muted', text: value || '(unset)' });
  const editBtn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Edit', onClick: () => {
    const input = el('input', { class: 'input', value });
    const save = el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Save', onClick: async () => {
      await app.editWorldField(world.id, field, input.value, label);
      app.rerender();
    } });
    dd.replaceChildren(input, save);
    input.focus();
  } });
  dd.append(view, ' ', editBtn);
  return el('div', { class: 'kv__row' }, [el('dt', { text: label }), dd]);
}

function statusControl(app, world) {
  const select = el('select', { class: 'input input--select' },
    ['active', 'blocked', 'proposed', 'archived'].map(s =>
      el('option', { value: s, text: s, attrs: s === world.status ? { selected: 'selected' } : {} })));
  select.addEventListener('change', async () => {
    await app.changeWorldStatus(world.id, select.value);
    app.rerender();
  });
  return select;
}

function canonList(app, world) {
  const finals = (world.canon || []).filter(c => c.stage === 'final');
  const superseded = (world.canon || []).filter(c => c.stage === 'superseded');
  return el('div', {}, [
    el('h3', { text: 'Final decisions' }),
    finals.length ? el('ul', { class: 'list' }, finals.map(c => el('li', {}, [iconStatus('final', 'live'), c.text])))
      : el('p', { class: 'muted', text: 'No locked canon yet.' }),
    superseded.length ? el('details', {}, [
      el('summary', { text: `Superseded (${superseded.length})` }),
      el('ul', { class: 'list list--muted' }, superseded.map(c => el('li', { text: c.text })))
    ]) : null
  ]);
}

function worldSearch(app, worldId) {
  const input = el('input', { class: 'input', attrs: { placeholder: 'Search within this World…' } });
  const out = el('ul', { class: 'list' });
  input.addEventListener('input', () => {
    const res = app.search.query(input.value, { scope: worldId });
    out.replaceChildren(...(res.length ? res.map(r => el('li', {}, [el('a', { class: 'link', href: r.route, text: `${r.kind}: ${r.title}` })]))
      : [el('li', { class: 'muted', text: input.value ? 'No matches.' : '' })]));
  });
  return el('div', {}, [input, out]);
}
