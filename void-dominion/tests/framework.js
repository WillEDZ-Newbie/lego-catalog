// framework.js — minimal zero-dependency test framework (Node + browser).

const registry = [];

export function test(name, fn) {
  registry.push({ name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

export function assertEqual(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg || 'Not equal'} — expected ${e}, got ${a}`);
}

export async function run() {
  const results = [];
  let passed = 0;
  let failed = 0;
  for (const t of registry) {
    try {
      await t.fn();
      results.push({ name: t.name, ok: true });
      passed++;
    } catch (err) {
      results.push({ name: t.name, ok: false, error: err.message });
      failed++;
    }
  }
  return { passed, failed, total: registry.length, results };
}
