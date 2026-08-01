// build-standalone.mjs — produce a single self-contained HTML file that runs
// with no server, no install and no network (double-click to open).
//
// It bundles the ES modules with esbuild, inlines all CSS, and embeds the seed
// data on window.__VD_SEED__ so the app never needs to fetch anything.
//
// Usage: node build-standalone.mjs   (esbuild must be resolvable via npx)

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), 'utf8');
const readJson = (p) => JSON.parse(read(p));

// 1) Bundle the app into a single IIFE.
const tmp = mkdtempSync(join(tmpdir(), 'vd-'));
const bundlePath = join(tmp, 'bundle.js');
execFileSync('npx', ['--yes', 'esbuild', join(root, 'js/app.js'),
  '--bundle', '--format=iife', '--platform=browser', `--outfile=${bundlePath}`],
  { stdio: 'inherit' });
const bundle = readFileSync(bundlePath, 'utf8');

// 2) Concatenate CSS in load order.
const cssFiles = ['tokens', 'reset', 'base', 'layout', 'components', 'animations', 'responsive'];
const css = cssFiles.map((f) => read(`css/${f}.css`)).join('\n');

// 3) Build the embedded seed (matches loadSeed()'s expected shape).
const seed = {
  system: readJson('data/system.json'),
  settings: readJson('data/settings.json'),
  safetyPolicy: readJson('data/safety-policy.json'),
  locations: readJson('data/locations.json'),
  worlds: readJson('data/worlds.json'),
  rooms: readJson('data/rooms.json'),
  objects: readJson('data/objects.json'),
  sources: readJson('data/sources.json'),
  activity: readJson('data/activity.json'),
  chief: readJson('data/chief.json'),
};

// 4) Assemble the single HTML file.
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="Void Dominion — local-first operating environment (standalone build).">
  <meta name="color-scheme" content="dark">
  <title>Void Dominion</title>
  <style>${css}</style>
</head>
<body>
  <a class="skip-link" href="#view-root" style="position:absolute;left:-999px;top:0;">Skip to content</a>
  <div class="app">
    <aside class="nav" id="nav-root" aria-label="Void Dominion navigation"></aside>
    <main class="main">
      <div class="status-root" id="status-root"></div>
      <div class="content" id="view-root" tabindex="-1" role="region" aria-label="Main view"></div>
    </main>
    <footer class="footer">
      Void Dominion · local-first · Atlas operating environment ·
      <span class="muted">Standalone build — visual assets, animation and transitions are configurable placeholders awaiting production.</span>
    </footer>
  </div>
  <div class="modal-root" id="modal-root" hidden></div>
  <div class="toast-root" id="toast-root" aria-live="polite"></div>
  <script>window.__VD_SEED__ = ${JSON.stringify(seed)};</script>
  <script>${bundle}</script>
</body>
</html>
`;

writeFileSync(join(root, 'void-dominion-standalone.html'), html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Wrote void-dominion-standalone.html (${kb} KB)`);
