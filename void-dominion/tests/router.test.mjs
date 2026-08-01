import { test, assert, eq, truthy } from './harness.mjs';
import { Router } from '../js/router.js';

// _parse and _match are pure and need no DOM.
test('parses a simple path', () => {
  const r = new Router();
  const parsed = r._parse('#/nexus');
  eq(parsed.parts, ['nexus']);
});

test('matches a param route', () => {
  const r = new Router();
  r.add('#/world/:worldId', () => {});
  const m = r._match(['world', 'world-halo']);
  truthy(m, 'should match');
  eq(m.params.worldId, 'world-halo');
});

test('matches nested room route', () => {
  const r = new Router();
  r.add('#/world/:worldId/room/:roomId', () => {});
  const m = r._match(['world', 'w1', 'room', 'assets']);
  eq(m.params.roomId, 'assets');
});

test('non-matching length returns null', () => {
  const r = new Router();
  r.add('#/world/:worldId', () => {});
  eq(r._match(['world']), null);
});

test('parses query string', () => {
  const r = new Router();
  const parsed = r._parse('#/activity?actor=user');
  eq(parsed.query.actor, 'user');
});
