// run.mjs — Node test entry. `node tests/run.mjs` (from void-dominion/).
import './validation.test.mjs';
import './safety.test.mjs';
import './search.test.mjs';
import './store.test.mjs';
import './router.test.mjs';
import './import-export.test.mjs';
import { run } from './harness.mjs';

const summary = await run();
process.exit(summary.failed > 0 ? 1 : 0);
