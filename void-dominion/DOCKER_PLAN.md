# Void Dominion — Docker Plan

Goal: make Void Dominion trivial to run as a container — first for **review on a
Mac**, then as a foundation for a real backend when live providers (iCloud /
GitHub / Chief) come online.

Guiding constraint from the brief: the app is local-first and build-step-free.
Containerising must not change that — the container only *serves* the same
static app, and any future backend is additive and provider-neutral.

---

## Phase 0 — Local container ✅ (done)

Already in the repo:
- `Dockerfile` — `nginx:alpine` serving the static app.
- `docker-compose.yml` — one command: `docker compose up` → `http://localhost:8080/`.
- `.dockerignore` — keeps the image lean.

Run:
```bash
cd void-dominion
docker compose up          # open http://localhost:8080/
docker compose down
```
Serving over `http://` restores full IndexedDB persistence (data survives refresh).

**Requires:** Docker Desktop on the Mac. This is the main friction — see Phase 3
for a one-double-click wrapper.

---

## Phase 1 — Publish the image (one command, no clone) ⬅ next

Build and push a public image to **GitHub Container Registry (GHCR)** from CI so
the client needs neither the repo nor a build step:

```bash
docker run --rm -p 8080:80 ghcr.io/willedz-newbie/void-dominion:latest
# open http://localhost:8080/
```

Work items:
1. Add `.github/workflows/docker.yml`:
   - Trigger on push to `main` + version tags (`v*`) + manual dispatch.
   - `docker/build-push-action` with `packages: write` (GHCR).
   - Tags: `latest`, the short SHA, and semver on tag pushes.
2. Make the package public (one-time, in repo → Packages settings) so it pulls
   without a login.
3. Multi-arch build: `linux/amd64` **and** `linux/arm64` (Apple Silicon Macs).

Notes / decisions:
- GHCR push uses the built-in `GITHUB_TOKEN` (unlike Pages, `packages: write` is
  normally allowed), so this should work without an owner-only toggle. First run
  will confirm.
- Image stays tiny (nginx + ~200 KB of assets).

---

## Phase 2 — Versioning & release hygiene

- Tag releases (`v0.1.0`, …); CI publishes matching image tags.
- Attach `void-dominion-standalone.html` to each GitHub Release as a download.
- Pin nginx base image by digest; enable Dependabot for the base image.
- Add a `HEALTHCHECK` (already in the Dockerfile) and a smoke test in CI
  (curl the running container for `index.html` + a data file).

---

## Phase 3 — Make it one action on the Mac (optional)

Reduce Docker friction for a non-technical reviewer:
- Ship a `run-void-dominion.command` file (double-clickable on macOS) that runs
  `docker run … && open http://localhost:8080`.
- Or a short "Getting started on Mac" doc: install Docker Desktop → paste one
  command. (Still heavier than the standalone HTML file, which needs nothing.)

---

## Phase 4 — Backend service (only when live data is needed) — future

The current app is client-only (IndexedDB). A backend becomes worthwhile when we
want shared/server persistence or real provider integrations. Additive, provider
-neutral, and behind the existing `providers/` interfaces:

- New `api` service (Node/Express or similar) in `docker-compose.yml`:
  - `web` (nginx, static app) + `api` (providers, auth, storage) + optional `db`
    (Postgres/SQLite volume).
- Real provider adapters replace the honest stubs one at a time:
  - **GitHub**: server holds the token (never in client JS), exposes read/write
    behind approval — satisfies the brief's "no secrets in frontend" rule.
  - **iCloud**: a local companion / File System Access bridge.
  - **Chief/AI**: server-side reasoning endpoint.
- Secrets via Docker secrets / env files, never baked into the image.
- Persist server data in a named volume; backups cover it too.

**Decision to confirm before Phase 4:** does persistence stay per-device
(client IndexedDB, no server) or move to a shared server store? That choice
drives whether we need `api` + `db` at all.

---

## Risks / open questions

- **Docker Desktop dependency** — fine for a dev/product path, heavy for a quick
  review. Keep the standalone HTML + (optional) hosted link as the low-friction
  review options; use Docker for the "real running app" path.
- **arm64 vs amd64** — must build multi-arch or Apple Silicon users hit slow
  emulation. Handled in Phase 1.
- **GHCR visibility** — package must be set public once for anonymous `docker
  pull`. One-time repo setting.
- **Persistence model** — unresolved until Phase 4 scope is chosen (see above).

---

## Immediate next step

Implement Phase 1: add the GHCR publish workflow (multi-arch), push it, and
confirm the image builds and pulls. Deliverable: a single `docker run` command
that starts Void Dominion on any Mac with Docker installed.
