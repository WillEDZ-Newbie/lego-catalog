// object-viewer.js — Object metadata, preview and source references
// (#/object/:objectId). "Open source" is only offered when the provider
// genuinely supports it; otherwise the control is honest about the blocker.

import { el, placeholder, badge, iconStatus } from './dom.js';

export function renderObject(app, ctx) {
  const obj = app.store.getObject(ctx.params.objectId);
  if (!obj) return el('section', { class: 'view' }, [el('h1', { text: 'Object not found' }), el('a', { class: 'link', href: '#/atlas', text: '← Atlas' })]);

  const world = app.store.getWorld(obj.worldId);
  const source = obj.sourceRef ? app.store.getSource(obj.sourceRef) : null;
  const provider = app.providers.get(obj.provider);
  const canOpen = provider && provider.canRead();

  const openBtn = el('button', {
    class: `btn ${canOpen ? 'btn--primary' : 'btn--disabled'}`, type: 'button',
    text: canOpen ? 'Open source' : 'Open source (provider not connected)',
    attrs: canOpen ? {} : { disabled: 'disabled', title: 'The provider for this object is not connected; opening is not possible.' },
    onClick: async () => {
      const res = await provider.read(obj.id);
      app.toast(res.providerConfirmed && res.ok ? 'Opened via provider.' : res.reason || 'Provider did not perform the action.');
    }
  });

  return el('section', { class: 'view view--object' }, [
    el('nav', { class: 'crumbs' }, [
      world ? el('a', { class: 'link', href: `#/world/${world.id}`, text: world.name }) : el('span', { text: 'Unassigned' }),
      ' / ', el('span', { text: obj.title })
    ]),
    el('div', { class: 'grid grid--two' }, [
      el('div', { class: 'object-preview' }, [placeholder(`${obj.type} preview — ${obj.previewRef || 'no preview'}`, 'preview')]),
      el('div', { class: 'panel' }, [
        el('h1', { text: obj.title }),
        el('div', { class: 'row' }, [badge(obj.stage, obj.stage === 'final' ? 'ok' : 'neutral'), obj.canonical ? badge('canonical', 'attention') : null, badge(obj.type, 'neutral')]),
        el('dl', { class: 'kv' }, [
          row('Provider', obj.provider),
          row('Path', obj.path || '—'),
          row('Repository', obj.repositoryUrl || '—'),
          row('External URL', obj.externalUrl || '—'),
          row('Tags', (obj.tags || []).join(', ') || '—')
        ]),
        source ? el('div', { class: 'note' }, [
          el('strong', { text: 'Source: ' }),
          iconStatus(`${source.provider} · ${source.authority} · ${source.availability}`, source.availability === 'available' ? 'live' : 'stub'),
          el('p', { class: 'muted', text: source.notes || '' })
        ]) : el('p', { class: 'muted', text: 'No source record linked.' }),
        el('div', { class: 'row' }, [
          openBtn,
          el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Delete object', onClick: () => app.deleteObject(obj.id) })
        ])
      ])
    ])
  ]);
}

function row(k, v) {
  return el('div', { class: 'kv__row' }, [el('dt', { text: k }), el('dd', { text: String(v) })]);
}
