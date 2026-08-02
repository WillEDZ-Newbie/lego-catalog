# ATELIER

A browser-only, artist-friendly app for running **staged AI image pipelines**
against the free [AI Horde](https://stablehorde.net/api). Built for a sculptor
working on iPad / MacBook Air. See [`CLAUDE.md`](./CLAUDE.md) for the full
product brief — it is the source of truth for scope and design.

100% static SPA · no backend · no paid APIs · free forever.

## Status — Milestone 2

Build order (from the brief), and where we are:

1. **Horde client + types + proof-of-loop test bench** — ✅ done.
2. **Stage registry + auto-generated panels + Builder + Runner + IndexedDB history** — ✅ this milestone.
3. Hero controls: Mask Painter, Ghost Strip, Artist Lock, See-It Picker.
4. Judgement screen polish: compare gestures, filmstrip/frieze, fork.
5. Projects, presets, house style, export/share, PWA install, design pass.

What Milestone 2 ships (the real Home → Builder → Runner flow):

- `src/stages/` — the **Stage Registry**: all 14 launch stages as pure data +
  `buildPayload` transforms, house-style composition, and the sculptural-realism
  prompt blocks (positive-only, negatives via the Horde `###` separator).
- `src/ui/controls/AutoPanel.tsx` — control surface auto-generated from each
  stage's `ParamDef[]` (slider / toggle / text / select) with an Advanced drawer.
- `src/ui/Builder.tsx` — tick-list grouped by category + ordered pipeline tray
  (reorder / remove) + live model picker.
- `src/ui/Runner.tsx` — step-through execution: control panel → "carving" queue
  card (ETA in words) → judgement screen with **Continue / Retry / Undo / Stop**
  → filmstrip of accepted steps.
- `src/store/run.ts` — the session state machine over **append-only, immutable
  IndexedDB history** (`session/{id}/{step}-{attempt}`); undo is a pointer move.
- `src/lib/db.ts` (idb blobs + session recents) and `src/lib/image.ts`
  (downscale/encode uploads to webp for Horde `source_image`).

Milestone-1 pieces still underneath: `src/horde/` (typed client), the
`src/ui/TestBench.tsx` diagnostic page (no longer the entry point), and the
`src/styles/tokens.css` design system.

Not yet (by design): mask-painting repair stages are listed but **gated** in the
Builder until the Mask Painter lands in Milestone 3; the denoise slider, seed
toggle, ControlNet select and model picker are the plain Milestone-2 controls
that Milestone 3 upgrades to the Ghost Strip / Artist Lock / See-It Picker.

## Spec fidelity — how the types were grounded

The brief makes the **live Horde OpenAPI spec the source of truth** and says to
generate types from `https://stablehorde.net/api/swagger.json`. That endpoint
(and the `aihorde.net` mirror) is **blocked from the build environment** by the
organisation's egress policy.

The swagger, however, is *generated* from the open-source AI-Horde server, and
that source **is** reachable (`raw.githubusercontent.com` is allowed). So
`src/horde/types.ts` was reconciled directly against the generator source at
`Haidra-Org/AI-Horde @ main`:

- `horde/apis/models/stable_v2.py` — the flask-restx models that produce the
  swagger (field enums + numeric `min`/`max`/`multiple`/`default`).
- `horde/consts.py` — `KNOWN_SAMPLERS`, `KNOWN_POST_PROCESSORS`,
  `KNOWN_UPSCALERS`, `KNOWN_WORKFLOWS`.

Observed at reconciliation: `HORDE_VERSION 5.1.3`, `HORDE_API_VERSION "2.5"`.
Samplers, control types, and source-processing modes matched exactly; the
newer post-processors and the real numeric limits (now in the `LIMITS` const)
were added. **No `VERIFY` placeholders remain.** When bumping to a newer Horde
release, re-run the reconciliation against those two files (or a freshly
fetched `swagger.json`).

The **deployed app is unaffected** by the egress block regardless: it runs
entirely in the artist's browser, which calls the CORS-open Horde API directly.

## Develop

```bash
cd atelier
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc, no emit
npm run build      # tsc -b && vite build → static files in dist/
```

Deploy `dist/` to any static host (Cloudflare Pages / GitHub Pages).

### Trying the test bench

`npm run dev`, open the page, optionally paste a Horde API key (works
anonymously otherwise), and press **Carve one**. It submits a 512² / 20-step
txt2img, polls the queue, downloads the R2 result, and renders it. Requires a
browser with network access to `stablehorde.net` (not available inside the
CI/build sandbox).

## Icons TODO

`vite.config.ts` references `public/icon-192.png` and `public/icon-512.png` for
the PWA manifest; only `favicon.svg` exists so far. Add raster icons before the
Milestone 5 PWA-install pass.
