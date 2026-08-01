import { test, assert, eq, truthy } from './harness.mjs';
import { SafetyEvaluator } from '../js/safety.js';
import { makeFakeStore } from './fake-store.mjs';

test('low-risk action executes with log', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  let ran = false;
  const res = await s.run({ actionType: 'view_pref', summary: 'toggle', risk: 'low' }, async () => { ran = true; return { providerConfirmed: true }; });
  truthy(ran, 'perform should run');
  eq(res.status, 'executed');
});

test('high-risk action requires approval and does NOT execute', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  let ran = false;
  const res = await s.run({ actionType: 'send', summary: 'send msg' }, async () => { ran = true; return { providerConfirmed: true }; });
  eq(res.status, 'pending-approval');
  assert(!ran, 'perform must NOT run before approval');
});

test('permanent deletion impossible without approval', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  let deleted = false;
  const res = await s.run({ actionType: 'delete', summary: 'delete obj' }, async () => { deleted = true; return { providerConfirmed: true }; });
  eq(res.status, 'pending-approval');
  assert(!deleted, 'delete must be gated');
});

test('approving executes the stashed performer', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  let ran = false;
  const res = await s.run({ actionType: 'delete', summary: 'delete obj' }, async () => { ran = true; return { providerConfirmed: true }; });
  const r2 = await s.resolveApproval(res.approvalId, 'approved');
  truthy(ran, 'perform should run after approval');
  eq(r2.status, 'executed');
});

test('rejecting performs no action', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  let ran = false;
  const res = await s.run({ actionType: 'delete', summary: 'delete obj' }, async () => { ran = true; });
  await s.resolveApproval(res.approvalId, 'rejected');
  assert(!ran, 'rejected action must not run');
  const appr = store.getApprovals().find(a => a.id === res.approvalId);
  eq(appr.status, 'rejected');
});

test('provider failure is not reported as success', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  await s.run({ actionType: 'view_pref', risk: 'low', summary: 'x' }, async () => ({ providerConfirmed: false }));
  const last = store.state.activity.at(-1);
  eq(last.result, 'partial', 'unconfirmed provider must not be success');
});

test('blocked action is denied', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  const res = await s.run({ actionType: 'move', summary: 'move file', blocked: true, blockedReason: 'provider offline' }, async () => ({ providerConfirmed: true }));
  eq(res.status, 'blocked');
});

test('changing a proposal invalidates the old approval', async () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  const res = await s.run({ actionType: 'send', summary: 'v1' }, async () => ({ providerConfirmed: true }));
  await s.invalidateApproval(res.approvalId, 'proposal changed');
  const appr = store.getApprovals().find(a => a.id === res.approvalId);
  eq(appr.status, 'expired');
});

test('critical action flags backup requirement', () => {
  const store = makeFakeStore();
  const s = new SafetyEvaluator(store);
  const v = s.evaluate({ actionType: 'world_delete', risk: 'critical' });
  truthy(v.requiresBackup, 'critical should require backup');
  eq(v.decision, 'require-approval');
});
