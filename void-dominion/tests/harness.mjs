// harness.mjs — a tiny zero-dependency test harness (Node + browser friendly).
const results = [];
let current = null;

export function test(name, fn) {
  results.push({ name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}
export function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || 'not equal'}: ${A} !== ${B}`);
}
export function truthy(v, msg) { assert(!!v, msg || `expected truthy, got ${v}`); }

export async function run({ log = console.log } = {}) {
  let passed = 0, failed = 0;
  const failures = [];
  for (const t of results) {
    current = t;
    try {
      await t.fn();
      passed++;
      log(`  ✓ ${t.name}`);
    } catch (err) {
      failed++;
      failures.push({ name: t.name, err });
      log(`  ✕ ${t.name}\n      ${err.message}`);
    }
  }
  log(`\n${passed} passed, ${failed} failed, ${results.length} total`);
  return { passed, failed, total: results.length, failures };
}
