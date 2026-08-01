# Void Dominion / Atlas

A **local-first operating environment** built as a no-build-step single-page
application: semantic HTML, modular CSS, vanilla JavaScript ES modules, JSON and
IndexedDB. This is the functional structural foundation described in the
*Void Dominion — Implementation Brief for Claude (v2)*. Visual assets, immersive
animation and final transitions are intentionally left as labelled placeholders
and configurable slots for review and completion after the structural build.

> **Canon:** Void Dominion is the highest shell. **Atlas** is the visible
> operating map. **Nexus** is the central convergence point. **Nine permanent
> Locations** provide the infrastructure of the whole system — *including Void
> Dominion itself*. Each significant project is its own immersive **World** with
> its **own** gallery. There is no separate "system-wide gallery" tier and there
> is no tenth Location.

## Run it

The app requires an HTTP server (ES modules do not load from `file://`). There
is **no build step**.

```bash
cd void-dominion
python3 -m http.server 8080      # or: npm start
# open http://localhost:8080/
```

## Test it

```bash
cd void-dominion
node tests/run.mjs               # or: npm test
```

38 unit tests cover the store, router, validation, search, import/export and the
safety gates. There is also a browser acceptance path (every route renders with
no console errors; seed data persists across reload).

## Architecture

```
void-dominion/
├── index.html                # app shell entry (no build)
├── css/                      # tokens, reset, base, layout, components, animations, responsive
├── js/
│   ├── app.js                # bootstrap + orchestration; routes ALL consequential actions through safety
│   ├── router.js             # hash routing + history + route guards
│   ├── store.js              # central state + mutations (single source of truth)
│   ├── events.js             # event bus
│   ├── persistence.js        # IndexedDB (durable) with in-memory fallback
│   ├── validation.js         # entity + relationship + import validation, stable IDs
│   ├── safety.js             # active evaluator: allow / allow-with-log / require-approval / deny
│   ├── search.js             # Atlas-wide + World-scoped search index
│   ├── activity.js           # audit read-helpers (recording lives in the store)
│   ├── import-export.js      # export/import envelope + backup/restore
│   ├── source-resolver.js    # source authority + conflict detection
│   ├── providers/            # provider-neutral registry + local (live) + honest iCloud/GitHub/Chief/AI stubs
│   └── components/           # app shell + every view/component
├── data/                     # seed JSON: system, locations(9), worlds(10), objects, sources, activity, chief, safety-policy, settings
└── tests/                    # node-runnable unit tests + tiny harness
```

### Routes

`#/dominion` · `#/atlas` · `#/nexus` · `#/worlds` · `#/world/:worldId` ·
`#/world/:worldId/gallery` · `#/world/:worldId/room/:roomId` ·
`#/location/:locationId` · `#/object/:objectId` · `#/approvals` · `#/activity` ·
`#/settings`

## Safety model (implemented as code, not text)

Every mutation passes through `js/safety.js` before execution. The evaluator
returns `allow`, `allow-with-log`, `require-approval` or `deny`:

- **Consequential** (send, publish, move/rename files, GitHub write, create a
  World) → explicit approval required immediately before execution.
- **Destructive/canonical** (permanent delete, reset, restore, import, merge a
  World, change locked canon) → high-friction approval **and a backup first**.
- A rejected approval performs **no** action. Changing a proposal **invalidates**
  the old approval. Approve/Reject are separate controls; silence is never
  approval.
- Providers never report success they did not achieve. An unconfirmed provider
  result is logged as `partial`, never `success`.

## Storage & providers (honest by construction)

Atlas is an **index and reference map**, not the physical file store. The
**local** provider is fully live (metadata + references). **iCloud** and
**GitHub** are honest stubs that report "not performed" until a real integration
is configured — no API secrets ever live in client code. **Chief** and the **AI**
reasoner are labelled mocks (transparent heuristics; no live Apple Shortcuts or
model run).

## What is intentionally left for visual production

Labelled placeholder slots and theme tokens for: the Void Dominion home
composition (Void Lord & halo), World covers/backgrounds, gallery artwork,
Location environments/icons, Void Railway transitions, ambient animation/sound.
See `assets/placeholders/README.md` and `BUILD_STATUS.md`.
