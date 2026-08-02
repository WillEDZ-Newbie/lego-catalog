# ATELIER

A browser-only, artist-friendly app for running **staged AI image pipelines**
against the free [AI Horde](https://stablehorde.net/api). Built for a sculptor
working on iPad / MacBook Air. See [`CLAUDE.md`](./CLAUDE.md) for the full
product brief — it is the source of truth for scope and design.

100% static SPA · no backend · no paid APIs · free forever.

## Status — Milestone 4

Build order (from the brief), and where we are:

1. **Horde client + types + proof-of-loop test bench** — ✅ done.
2. **Stage registry + auto-generated panels + Builder + Runner + IndexedDB history** — ✅ done.
3. **Hero controls: Mask Painter, Ghost Strip, Artist Lock, See-It Picker** — ✅ done.
4. **Judgement screen polish: compare gestures, filmstrip/frieze, fork** — ✅ this milestone.
5. Projects, presets, house style, export/share, PWA install, design pass.

What Milestone 4 ships:

- **CompareView** (`src/ui/CompareView.tsx`) — the judgement screen now has an
  A/B wipe slider (drag the divider) plus press-and-hold-anywhere to reveal the
  original; the output rises over the input like a plaster cast being lifted
  (respects `prefers-reduced-motion`).
- **Marble-frieze filmstrip** — accepted steps sit in a carved band with inset
  bevels; the current frame is lit as if by raking workshop light.
- **Fork from here** — tap any earlier frame → "Fork from here" starts a new
  session keeping everything up to that frame, **referencing the same immutable
  IndexedDB blobs** (no image data is copied); the run continues from that point.

What Milestone 3 ships (`src/ui/hero/`):

- **Mask Painter** — full-screen canvas over the input image: brush size,
  softness (feather), eraser, invert, clear, pinch zoom/pan, Apple Pencil
  pressure → opacity (`PointerEvent` / `touch-action: none`). Exports a B/W PNG
  mask at source resolution. **Unlocks the repair/inpainting stages** (eye
  repair, detail repair, background cleanup) — no longer gated.
- **Ghost Strip** — denoise as five on-demand preview thumbnails
  (0.2/0.35/0.5/0.65/0.8), generated sequentially and cached per input image;
  tap one to snap the strength.
- **Artist Lock** — 🔒 Same artist / 🎲 New artist, with a rail of previous
  results; tap one to recall its seed. Seeds never shown as numbers.
- **See-It Picker** — ControlNet type as cards; "Follow the outlines" shows a
  live client-side edge (Sobel) preview of the input image. The three
  Milestone-2 composition-lock stages are now **one** "Composition lock" stage
  driven by this picker (catalog is 12 stages; the lock offers 3 modes).

Pointer/pinch/Pencil behaviour is written to spec but can only be tuned on a
real iPad/desktop, not in CI.

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

## Backlog / ideas

- **Prompt library** — the artist has many image prompts written for ChatGPT.
  Import them (paste / file), browse and search, and either drop one straight
  into a Fresh-generation stage to run it through the Horde pipeline, or keep
  them as reusable presets. Fits naturally into the Milestone-5 projects/presets
  work.
