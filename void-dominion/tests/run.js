// run.js — Node test entry point. Usage: node tests/run.js
import './suite.js';
import { run } from './framework.js';

const { passed, failed, total, results } = await run();
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  // eslint-disable-next-line no-console
  console.log(`${mark} ${r.name}${r.ok ? '' : `\n    → ${r.error}`}`);
}
// eslint-disable-next-line no-console
console.log(`\n${passed}/${total} passed, ${failed} failed.`);
process.exitCode = failed ? 1 : 0;
