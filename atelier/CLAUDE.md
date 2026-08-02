# ATELIER — Staged AI Image Pipeline for a Sculptor

## What this is

A browser-only, artist-friendly app that runs staged image-generation pipelines
against the **AI Horde** free API (https://stablehorde.net/api). The user is a
professional artist (not a technical person) working on a MacBook Air 8GB and an
iPad. He makes images of marble statues and needs surgical, repeatable control —
e.g. removing eyelashes/eyebrows that generators wrongly add to carved stone.

The product idea in one sentence: **a tick-list of pipeline stages, each with a
bespoke artist-grade control surface, executed step-by-step with
Continue / Retry / Undo at every stage.**

## Non-negotiable constraints

1. **100% browser-based static SPA.** No backend, no server, no build-time
   secrets. Everything runs client-side and deploys as static files
   (Cloudflare Pages / GitHub Pages). AI Horde's API is CORS-open and designed
   for exactly this (see ArtBot as prior art).
2. **Free forever.** AI Horde only. No paid APIs, no paid hosting, no accounts
   beyond the free Horde API key.
3. **Must work beautifully on iPad Safari** (including Apple Pencil for mask
   painting and PWA install-to-home-screen) and on a MacBook Air. 8GB RAM
   machine: keep memory discipline (revoke object URLs, thumbnail large
   images, cap the in-memory history).
4. **Artist-first language everywhere.** No parameter jargon in the primary UI.
   "cfg_scale" does not appear on screen; "How closely to follow the prompt"
   does. Raw numbers live behind an "Advanced" disclosure only.
5. **The Horde API key is entered once** in Settings, stored in
   `localStorage`, sent as the `apikey` header. Support anonymous mode
   (`apikey: 0000000000`) with a visible note that registered keys queue
   faster and a link to https://stablehorde.net/register.

## Before writing code

1. Fetch and read the live OpenAPI spec: `https://stablehorde.net/api/swagger.json`
   (human-readable at https://stablehorde.net/api). Generate TypeScript types
   from it. **The spec is the source of truth** for payload fields, enum
   values (samplers, control types, post-processors), and limits. Do not
   hard-code values that the spec or the live endpoints can supply.
2. Hit these live endpoints during development to ground the UI in reality:
   - `GET /v2/status/models` — active image models + queue depth per model
   - `GET /v2/status/heartbeat` — connectivity check
3. Read AI Horde's integration README:
   https://github.com/Haidra-Org/AI-Horde/blob/main/README_integration.md
   The core loop is: `POST /v2/generate/async` → poll
   `GET /v2/generate/check/{id}` (max 1/sec; the Horde caches status for 1s)
   → `GET /v2/generate/status/{id}` → download image from the returned R2 URL.
   Always send `r2: true`. Respect `kudos` and `wait_time` fields in check
   responses to drive the progress UI.

## Architecture

- **Stack:** Vite + React + TypeScript. Zustand (or similar minimal store) for
  state. No heavyweight UI kit — hand-rolled components per the design system
  below. PWA via vite-plugin-pwa (offline shell; generations obviously need
  network).
- **Storage:** IndexedDB (via `idb`) for everything binary — session images,
  stage outputs, seed history thumbnails, saved presets. `localStorage` only
  for the API key and small settings. Images are stored as Blobs, displayed
  via object URLs that are revoked when off-screen.
- **Three core modules, cleanly separated:**
  1. `horde/` — typed API client: submit, poll, retrieve, cancel
     (`DELETE /v2/generate/status/{id}` when the user aborts), kudos/queue
     estimation, model list with caching.
  2. `stages/` — the **Stage Registry** (see below): pure data + small
     transform functions, no UI.
  3. `ui/` — Builder, Runner, control components, mask painter.

## The Stage Registry

Every stage is a JSON descriptor plus (optionally) a pure function that maps
its friendly params onto a Horde payload. A pipeline is an ordered array of
stage instances with their param values. **Presets are just saved pipelines.**

```ts
interface StageDef {
  id: string;                 // "marble-pass"
  name: string;               // "Marble material pass"
  blurb: string;              // one artist-friendly sentence
  category: "structure" | "generate" | "material" | "surface" | "repair" | "finish";
  input: "none" | "image";    // txt2img stages take no input image
  params: ParamDef[];         // drives auto-generated control surface
  buildPayload(params, inputImageB64, houseStyle): HordeGenerationInput;
}
```

`ParamDef` carries: key, artist-facing label, control type (see mapping table),
default, range, and `advanced: boolean`. **Any payload field not explicitly
mapped in the table below is auto-rendered in the Advanced drawer from the
OpenAPI spec** — nothing the API offers is unreachable, but nothing technical
pollutes the primary surface.

### Launch stages (v1)

| Stage | Category | Horde mechanics |
|---|---|---|
| Fresh generation | generate | txt2img; structured prompt builder + house style |
| Composition lock (line) | structure | ControlNet `canny`, `image_is_control: false` |
| Composition lock (depth) | structure | ControlNet `depth` |
| Composition lock (pose) | structure | ControlNet `openpose` |
| Marble pass | material | img2img, denoise default 0.45, marble prompt block, locked seed |
| Bronze pass | material | as above, bronze prompt block |
| Weathering / ageing | material | img2img, denoise 0.3, erosion/patina prompt |
| Polish pass | surface | img2img, denoise 0.22, "polished, subsurface glow" prompt |
| Tool-mark texture | surface | img2img, denoise 0.28, "chisel marks, rasp texture" |
| Eye repair (the hero stage) | repair | inpainting: user-painted mask + "smooth blank convex carved eyes, no lashes, no incised brows, unbroken marble" — use `source_processing: "inpainting"` with mask |
| Detail repair (freeform) | repair | inpainting with user mask + user prompt |
| Background cleanup | repair | inpainting, mask = inverted subject (user paints subject, app inverts) |
| Upscale | finish | post-processor `RealESRGAN_x4plus` (verify name against spec) |
| Face fix | finish | post-processor `GFPGAN` / `CodeFormer` |

Prompt blocks for material stages must encode the sculptural-realism rules:
positive descriptions only ("eyes carved as smooth blank convex forms in the
classical Greek style", "brow ridge as a single unbroken sweep of polished
stone", "in the manner of Canova"), never negations like "no eyelashes" in the
positive prompt — put those in the Horde negative prompt (`###` separator or
the payload's negative field per spec).

### The House Style

A per-project locked paragraph (material, finish, lighting, camera, era) that
is composed into every stage's prompt as a read-only base layer, shown greyed
in the prompt panel. Editable only from Project Settings. This is what makes
"the same artist" show up every time, together with seed locking.

## Control-surface mapping (the heart of the app)

Auto-generate each stage's panel from its `ParamDef[]`, using these bespoke
components. **This table is design law:**

- **Denoise strength → Ghost Strip.** Not a bare slider. A slider whose track
  is annotated by five low-res preview thumbnails (0.2 / 0.35 / 0.5 / 0.65 /
  0.8) generated on demand as a single Horde batch (`n: 5`, small dimensions,
  low steps) when the user taps "Preview strengths". Label: "Keep the image ↔
  Reimagine it". This is the single most valuable element in the app — build
  it well. Cache the strip per input-image hash.
- **Seed → The Artist Lock.** A toggle: 🔒 "Same artist" / 🎲 "New artist".
  Beneath it, a horizontal seed history rail: thumbnails of previous results
  with their seeds; tap to recall that seed. Seeds are never shown as numbers
  outside Advanced.
- **Inpaint mask → Mask Painter.** Full-screen canvas overlaying the input
  image. Brush size, softness (feather), eraser, invert, clear, zoom/pan
  (pinch on iPad). **Apple Pencil pressure maps to brush opacity.** Use
  `PointerEvent` (`pointerType === "pen"`, `event.pressure`) and
  `touch-action: none` on the canvas. Export mask as B/W PNG at source
  resolution. Keyboard: `[` `]` for brush size on desktop.
- **ControlNet type → See-It Picker.** Not a dropdown. When an image is
  loaded, render client-side approximations of the control maps as a row of
  selectable cards: Canny via a small JS edge-detection pass (canvas
  convolution is fine — it's a preview, not the real preprocessor), depth and
  pose as labelled illustrative cards if client-side preview is impractical.
  Caption each in plain language: "Follow the outlines" / "Follow the depth" /
  "Follow the pose".
- **Prompt → Structured composer.** Fields: Subject, Material, Finish,
  Lighting, Extra notes. House style shown beneath as the locked base layer.
  A "peek at final prompt" disclosure shows the composed string.
- **cfg_scale → "Interpretation" slider.** "Loose ↔ Literal". Range per spec,
  default 7.
- **Steps → "Effort" slider.** "Quick ↔ Careful", default 25, with an
  estimated wait hint derived from the check endpoint's `wait_time` on recent
  jobs.
- **Model → Model picker.** Card list from `/v2/status/models`, sorted by
  worker count, showing name + queue health dot. Pin AlbedoXL or the current
  best general SDXL-class model as the recommended default (verify live).
- **Everything else** (sampler, karras, clip_skip, hires_fix, tiling, LoRAs,
  n) → Advanced drawer, auto-generated from the spec with sensible defaults.
  LoRA search/browse is out of scope for v1; accept a pasted LoRA name in
  Advanced only.

## The Runner (step-through execution)

1. User picks a preset or ticks stages in the Builder (checkbox list grouped
   by category, drag-to-reorder within the pipeline tray).
2. Runner executes stage 1: shows a queue card (position, kudos cost, ETA from
   `check`), then the result.
3. **Judgement screen:** input left, output right (stacked on portrait iPad),
   with a press-and-hold-to-compare gesture (hold shows input, release shows
   output) and an A/B slider. Four big actions:
   - **Continue** → output becomes next stage's input.
   - **Retry** → reopens this stage's panel with values preserved; previous
     attempt is kept in the stage's attempt rail.
   - **Undo** → discard this output, step back to the previous judgement.
   - **Stop** → end the run, keep everything produced so far.
4. **Filmstrip** along the bottom: every accepted stage output as a frame.
   Tapping an earlier frame offers "Fork from here" — truncates the run state
   forward of that frame (files are kept in IndexedDB; forks create a new
   session referencing the same blobs).
5. Undo is trivial by design: every stage output is an immutable Blob in
   IndexedDB keyed `session/{id}/{stepIndex}-{attempt}`. State is a pointer
   into that history. Never mutate, only append and re-point.
6. Export: "Save image" (share sheet on iPad via `navigator.share` with the
   file; download on desktop) and "Save recipe" (the pipeline JSON with all
   params — re-importable, shareable as a small file).

## Sessions & projects

- A **Project** holds: house style, default model, saved presets.
- A **Session** is one run: source image (uploaded via file picker /
  drag-drop / iPad photo library), pipeline, history, filmstrip.
- Home screen: recent sessions as large thumbnails, "New from image", "New
  from prompt", presets row. Empty state invites action ("Drop an image to
  begin, or start from a description").

## Horde etiquette & resilience

- Poll `check` at 1s minimum interval; back off to 3s after 30s in queue.
- Show kudos cost up front (the async submit response includes it) in plain
  language: "This will take roughly N minutes at current traffic."
- Handle `faulted`, timeouts, and dropped jobs with a plain-language retry
  card, never a raw error string. Errors state what happened and the next
  step ("The volunteer network dropped this job. Try again — nothing was
  lost.").
- Cancel in-flight jobs with DELETE when the user aborts.
- Cap concurrent requests to 1 pipeline job + 1 ghost-strip job.
- If the user has no API key, everything works anonymously but a quiet banner
  explains registered keys queue faster.

## Visual design brief

Follow a **"stonemason's studio"** direction — the app is a workshop for
sculpture, and should feel like one, not like a SaaS dashboard.

- **Palette (dark studio):** near-black warm charcoal ground `#1C1A18`;
  Pentelic marble off-white `#EDE8DF` for primary surfaces/text; limestone
  grey `#8C8578` for secondary; oxidised-bronze green `#6E7F5C` as the sole
  interactive accent (buttons, active states, progress); a dry terracotta
  `#B0603F` reserved **only** for destructive/undo actions. No gradients.
- **Type:** a chiselled/inscriptional display face for stage names and screen
  titles (e.g. Trajan-adjacent open font such as *Cinzel*, used sparingly, in
  caps with wide tracking — carved-inscription energy); a quiet humanist body
  face (e.g. *Source Sans 3*); tabular numerals for anything numeric in
  Advanced.
- **Signature element:** the **filmstrip as a marble frieze** — stage outputs
  sit in a continuous carved band along the bottom edge, each frame with a
  subtle inset bevel, the current frame lit as if by raking workshop light.
  This is the one place to spend boldness; keep everything else disciplined.
- **Motion:** one orchestrated moment — the judgement screen's reveal, where
  the new output slides over the input like a plaster cast being lifted.
  Respect `prefers-reduced-motion`. No scattered hover effects.
- Progress while queued is a slow "carving" fill on the stage card, with the
  ETA in words ("about two minutes"), never a spinner with a raw percentage.
- Quality floor: responsive from iPad portrait to 13" laptop, 44px minimum
  touch targets, visible keyboard focus, dark only in v1.
- All copy in plain artist language, active voice, sentence case. The button
  that says "Carve" produces a result labelled "Carved". Never expose API
  vocabulary ("payload", "denoise", "inference") in the primary UI.

## Build order (do these as separate, verifiable milestones)

1. **Horde client + types** from the live spec, with a tiny test page that
   runs one txt2img and renders it. Prove the submit/check/status/R2 loop.
2. **Stage registry + auto-generated panels** (slider/toggle/text controls
   only), Builder with tick-list, Runner with Continue/Retry/Undo/Stop and
   IndexedDB history. Prove a 3-stage pipeline end-to-end.
3. **Hero controls:** Mask Painter (Pencil support), Ghost Strip, Artist Lock
   + seed rail, See-It Picker.
4. **Judgement screen polish:** compare gestures, filmstrip/frieze, fork.
5. **Projects, presets, house style, export/share, PWA install, design pass.**

Test on iPad Safari at every milestone, not at the end. Pointer events, the
share sheet, canvas memory, and PWA behaviour are where iPad breaks.

## Definition of done for v1

An artist with no technical knowledge can: paste an API key once; drop in a
statue image; run the "Fix the eyes" preset (mask painter → inpaint → judge →
accept); run a full "Statue treatment" preset (structure lock → marble pass →
polish → eye repair → upscale) approving each step; retry any step with
tweaked strength via the Ghost Strip; undo; fork from the filmstrip; and
export both the final image and the recipe — entirely from an iPad, entirely
for free.
