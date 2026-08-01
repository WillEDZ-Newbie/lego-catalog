# Void Dominion

A **local-first operating environment**. Void Dominion is the shell, **Atlas** is
the visible operating map, **Nexus** is the central operating centre, nine
permanent **Locations** provide the system infrastructure, and each significant
project is an immersive **Project World** with its own gallery.

This is the **foundation build** described in the *Void Dominion Implementation
Brief v3*. It establishes the complete technical skeleton — real navigation,
persistent data, CRUD, safety gates, provider interfaces, diagnostics and
testable views — and leaves clearly labelled slots for the visual assets,
animation and transitions that will be added during visual production.

No control pretends to have performed an action that did not occur. Mock
providers are labelled honestly and cannot fake external success.

---

## Run it

The app requires **no build step**. It uses semantic HTML, modular CSS and
vanilla JavaScript ES modules. Serve the folder over any static HTTP server
(ES modules and `fetch` need `http://`, not `file://`):

```bash
cd void-dominion
python3 -m http.server 8080      # or: npm run serve
# open http://localhost:8080/
```

After the first load the app is offline-capable: seed data is copied into
IndexedDB and served locally.

### Run it with Docker

If you prefer a container (full persistence, always at `localhost:8080`):

```bash
cd void-dominion
docker compose up          # then open http://localhost:8080/
docker compose down        # stop
```

Requires Docker Desktop. The image is just nginx serving the static app.

### Run it with zero setup (standalone file)

`void-dominion-standalone.html` is the whole app bundled into one file — open it
by double-clicking, no server or install required. Regenerate it with
`node build-standalone.mjs`.

## Test it

```bash
npm test                 # Node test runner (tests/run.js)
# or open http://localhost:8080/tests/ in a browser
```

The suite covers hierarchy, validation, the safety evaluator, the store
mutation/approval lifecycle, search, source-conflict detection and
import/export (21 tests).

---

## Canonical hierarchy

```
VOID DOMINION
└── ATLAS
    ├── Nexus                      (central convergence point — NOT a tenth Location)
    ├── 9 Permanent Locations      (global infrastructure & mechanics)
    └── Project Worlds             (each with its own immersive gallery)
```

The nine permanent Locations are canonical — there is **no tenth**. Global
mechanics (archive, discovery, navigation, analytics, diagnostics …) live inside
these Locations, never as a separate hierarchy tier. Each Project World owns its
own gallery, canon, rooms, objects and tools, but cannot alter global routing,
archive rules, provider configuration or other Atlas infrastructure.

### The nine Locations

1. **Machine Oracle** — Chief, reasoning, planning, decisions, control
2. **Memory Vault** — archive, preservation, provenance, version history, restore
3. **Astral Greenhouse / Gardens** — cross-World visual discovery & asset selection
4. **Throne Reactor** — system engine, settings, providers, automation
5. **Void Railway** — navigation & transport between Worlds
6. **Observatory** — overviews, analytics, long-range status
7. **Cosmic Aquarium** — video/sound/media without a dedicated space yet
8. **Leviathan Spine** — structural backbone, providers, schemas, diagnostics
9. **Eclipse Monastery** — life structures & personal development

---

## Architecture

```
index.html                 single-page shell (no build step)
css/                       tokens → reset → base → layout → components → animations → responsive
js/
  app.js                   bootstrap + global event delegation
  router.js                hash routing with route guards
  store.js                 central state, mutations, approval lifecycle, backups
  events.js                pub/sub event bus
  persistence.js           IndexedDB adapter (storage-agnostic contract)
  validation.js            entity + relationship + dataset validation
  safety.js                risk classification & the allow/log/approve/deny evaluator
  activity.js              append-oriented audit records
  search.js                Atlas-wide & World-scoped search index
  source-resolver.js       source authority & conflict detection
  import-export.js         validated import/export
  ui.js                    modal / confirm / toast helpers
  providers/               provider-neutral registry + local provider + honest stubs
  components/              shell + every view (Dominion, Atlas, Nexus, Location, World, Gallery, Object, Approvals, Activity, Settings, Command bar)
data/                      seed JSON (system, settings, safety-policy, locations, worlds, rooms, objects, sources, activity, chief)
assets/placeholders/       labelled placeholder art & asset slots
tests/                     zero-dependency test framework + suite + in-memory adapter
```

**State model** (§37): source files (external), Atlas metadata (IndexedDB),
derived state (indexes/analytics — regenerable), UI state, and append-oriented
audit state are kept separate. Backups include Atlas metadata, settings, audit
state and provider references — never external source bytes they didn't include.

---

## Safety & approvals (implemented as code, not text)

Every mutation flows through the safety evaluator, which returns one of
`allow` / `allow-with-log` / `require-approval` / `deny`:

- **Low** (open, filter, local draft) → executes, logged when meaningful.
- **Moderate** (edit metadata, change status, archive) → executes with before/after log.
- **High** (create/merge a World, change canon, move files, send, enable an
  integration) → **prepared, not executed**; routed to the Approvals queue.
- **Critical** (permanent delete, overwrite authoritative data, reset) → blocked
  from direct execution; requires explicit approval **and a backup snapshot first**.
- **Unsupported/unverifiable** (mock or read-only provider asked to write) →
  **denied**; the proposal is preserved, never faked as success.

Approval is action-specific and time-bounded; opening, ignoring or closing a
request never counts as approval; rejecting performs no destructive action.

---

## Storage providers (honest capabilities)

| Provider | Status | Notes |
|---|---|---|
| `local` | connected | Fully functional metadata/reference provider. |
| `icloud` | mock | No browser integration; requires user-selected files, a local companion, Apple Shortcuts, or a native app. |
| `github` | mock | Repository URLs are **read references only**; writes/commits need an authenticated provider + explicit approval. |
| `chief` | mock | Local mock of the Apple Shortcuts reasoning/dispatch pipeline. |
| `ai` | mock | Deterministic local placeholder; no external model calls. |

Access is never inferred from a path, URL or account name — only from a
provider's declared capabilities and status.

---

## Locked Chief Shortcuts contract

These components are locked and must not be renamed, merged, split or replaced
without explicit approval:

> ⭐ Chief · ⭐ Receptionist · ⭐ Morning · ⭐ Evening · ⭐ Weekly ·
> EXEC • Brain · EXEC • Router · EXEC • Queue ·
> OPS • Calendar · OPS • Reminders · OPS • Health · OPS • Finance · OPS • Home ·
> LIFE • Project & Goals · LIFE • Travel · LIFE • Relationships · LIFE • Shopping ·
> SYS • Files · SYS • JSON · SYS • Messenger · SYS • Logger · SYS • Debug

Three reasoning depths are represented: **Brain** (routine), **Strategy**
(planning) and **Oracle** (deep, advisory by default).

---

## Accessibility & quality

Keyboard navigation, visible focus, reduced-motion support (both the OS
preference and an in-app toggle), non-colour status indicators (tags + dots +
text), semantic landmarks, and Mac/iPad responsive layouts. Ambient loops pause
when the tab is hidden.

---

## Handoff for visual production

The functional system is ready to receive real assets. Yordan and ChatGPT
supply: the Void Dominion home composition, Void Lord & halo, Location
environments and icons, World covers/symbols/colour identities, gallery artwork,
Void Railway transitions, and ambient motion/sound. Every visual surface exposes
a labelled `data-asset-slot`, theme tokens and transition hooks so imagery can be
replaced without rewriting components.

See `BUILD_STATUS.md` for the current completion report and acceptance checklist.
