# ATELIER

A browser-only, artist-friendly app for running **staged AI image pipelines**
against the free [AI Horde](https://stablehorde.net/api). Built for a sculptor
working on iPad / MacBook Air. See [`CLAUDE.md`](./CLAUDE.md) for the full
product brief — it is the source of truth for scope and design.

100% static SPA · no backend · no paid APIs · free forever.

## Status — Milestone 1

Build order (from the brief), and where we are:

1. **Horde client + types + proof-of-loop test bench** — ✅ this milestone.
2. Stage registry + auto-generated panels + Builder + Runner + IndexedDB history.
3. Hero controls: Mask Painter, Ghost Strip, Artist Lock, See-It Picker.
4. Judgement screen polish: compare gestures, filmstrip/frieze, fork.
5. Projects, presets, house style, export/share, PWA install, design pass.

What Milestone 1 ships:

- `src/horde/` — typed AI Horde v2 client: `submit → check → status → R2`
  download, with etiquette-correct polling (1s floor, 3s backoff after 30s),
  DELETE-on-abort, model list with caching, and plain-language error mapping.
- `src/horde/types.ts` — hand-authored v2 types (see the caveat below).
- `src/store/settings.ts` — API key in `localStorage`, anonymous by default.
- `src/ui/TestBench.tsx` — a utilitarian page that runs one txt2img and renders
  the result, exposing raw mechanics (queue position, kudos, wait_time) to prove
  the loop. **This is scaffolding, not the artist-facing product.**
- The "stonemason's studio" design tokens (`src/styles/tokens.css`).

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
