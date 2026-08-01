import { test, assert, truthy, eq } from './harness.mjs';
import { SearchIndex } from '../js/search.js';
import { makeFakeStore } from './fake-store.mjs';

test('search finds a world by name', () => {
  const idx = new SearchIndex(makeFakeStore());
  const r = idx.query('halo');
  truthy(r.some(x => x.kind === 'world'), 'should find Halo world');
});

test('search finds an object by tag', () => {
  const idx = new SearchIndex(makeFakeStore());
  const r = idx.query('widget');
  truthy(r.some(x => x.kind === 'object'), 'should find object by tag');
});

test('scoped search restricts to a world', () => {
  const store = makeFakeStore({
    worlds: [
      { id: 'w1', name: 'Halo', description: 'clock', unresolvedQuestions: [], objectIds: [] },
      { id: 'w2', name: 'Lola', description: 'palace', unresolvedQuestions: [], objectIds: [] }
    ],
    objects: [],
    sources: [],
    locations: []
  });
  const idx = new SearchIndex(store);
  const r = idx.query('a', { scope: 'w1' });
  assert(r.every(x => !x.worldId || x.worldId === 'w1'), 'scope must restrict');
});

test('empty query returns nothing', () => {
  const idx = new SearchIndex(makeFakeStore());
  eq(idx.query('').length, 0);
});
