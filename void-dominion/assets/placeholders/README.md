# Placeholder assets

Every visual surface in Void Dominion renders through a **labelled placeholder
slot** until a real asset is supplied. This is the handoff seam described in the
brief (§16 and §30): Yordan and ChatGPT replace these without touching component
code.

Asset slots currently exposed (all show a `PLACEHOLDER` tag in the UI):

- Void Dominion home composition — Void Lord & halo
- Per-World covers and immersive backgrounds
- Gallery tiles and object previews
- Location environments and icons
- Void Railway transition scenes (hooks only; no transitions embedded yet)
- Ambient loops, sound and weather behaviour

Replace a slot by supplying a real asset and pointing the relevant
`galleryConfig.background` / `previewRef` / cover field (in `data/*.json` or via
the app) at it. Nothing here is a final visual decision.
