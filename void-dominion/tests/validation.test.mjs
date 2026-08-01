import { test, assert, eq, truthy } from './harness.mjs';
import { validateEntity, validateRelationships, validateImport, generateId } from '../js/validation.js';

test('valid world passes', () => {
  const r = validateEntity('world', { schemaVersion: '1.0', id: 'w1', name: 'W', status: 'active', priority: 'high' });
  truthy(r.valid, r.errors.join(', '));
});

test('world missing required fields fails', () => {
  const r = validateEntity('world', { schemaVersion: '1.0', id: '', name: '', status: 'active' });
  assert(!r.valid, 'should be invalid');
});

test('world bad status enum fails', () => {
  const r = validateEntity('world', { schemaVersion: '1.0', id: 'w', name: 'W', status: 'nonsense' });
  assert(!r.valid && r.errors.some(e => e.includes('status')), 'should flag status');
});

test('object requires worldId', () => {
  const r = validateEntity('object', { schemaVersion: '1.0', id: 'o', title: 'x', type: 'image' });
  assert(!r.valid, 'missing worldId should fail');
});

test('relationship validation flags missing world', () => {
  const problems = validateRelationships({
    worlds: [{ id: 'w1', sourceRefs: [] }],
    objects: [{ id: 'o1', worldId: 'ghost', sourceRef: null }],
    sources: []
  });
  truthy(problems.some(p => p.issue.includes('missing world')), 'should flag missing world');
});

test('import envelope validation', () => {
  assert(!validateImport({}).valid, 'empty should fail');
  truthy(validateImport({ kind: 'void-dominion-export', schemaVersion: '1.0', data: {} }).valid, 'good envelope passes');
});

test('generateId is unique', () => {
  const a = generateId('x'), b = generateId('x');
  assert(a !== b, 'ids must differ');
});
