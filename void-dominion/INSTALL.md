# Void Dominion — Install & Run

This is a **local-first** app. Everything runs on your own Mac/iPad in a web
browser. There is **no build step**, no account, no internet required after you
have the files. Your data is stored locally in the browser (IndexedDB).

Because the app uses JavaScript modules, it must be opened through a small local
web server — **not** by double-clicking `index.html` (that uses `file://`, which
browsers block for modules). Pick one of the options below.

---

## Option A — macOS (easiest, nothing to install)

macOS already includes Python 3.

1. Unzip `void-dominion.zip`. You'll get a `void-dominion` folder.
2. Open the **Terminal** app (Applications → Utilities → Terminal).
3. Type `cd ` (with a space), then drag the `void-dominion` folder onto the
   Terminal window and press **Return**. Example:
   ```bash
   cd /Users/you/Downloads/void-dominion
   ```
4. Start the local server:
   ```bash
   python3 -m http.server 8080
   ```
5. Open a browser and go to: **http://localhost:8080/**
6. To stop the server later, click the Terminal and press **Control + C**.

That's it. The app loads, seeds its data on first run, and remembers changes on
that browser between visits.

---

## Option B — Node.js (if you prefer, or on Windows)

1. Install Node.js from https://nodejs.org (LTS version).
2. In a terminal, `cd` into the `void-dominion` folder.
3. Run:
   ```bash
   npx --yes http-server -p 8080 -c-1
   ```
   (or `npm start`, which uses Python under the hood).
4. Open **http://localhost:8080/**.

---

## Using it on an iPad

The app is laid out for iPad too, but iPadOS can't run a local server itself.
Two easy paths:

- **Same-network:** run the server on a Mac (Option A) and, on the iPad's
  browser, visit `http://<your-mac-name>.local:8080/` (find the Mac's name in
  System Settings → General → About). Both devices must be on the same Wi-Fi.
- **Static host:** upload the `void-dominion` folder to any static web host
  (e.g. GitHub Pages, Netlify drop) and open the URL on the iPad. No server code
  is needed — it's all static files.

---

## First-run notes

- **Providers are honest.** "Local metadata provider" is live. **iCloud** and
  **GitHub** show as **(stub)** and **Chief/AI** as **(mock)** until real
  integrations are configured. The app never pretends an external action
  happened when it didn't.
- **Your data is local** to that browser profile. Use **Settings → Export JSON**
  to save a backup file, and **Import JSON** to load it elsewhere.
- **Reset:** Settings → "Reset to seed data" (takes a backup first, and asks for
  approval — like all destructive actions).

---

## Optional: run the tests

Requires Node.js. From inside the `void-dominion` folder:

```bash
node tests/run.mjs
```

You should see `38 passed, 0 failed`.

---

## What's included vs. still to come

Included: the full working structure — Atlas, Nexus, the nine Locations, the ten
seed Project Worlds, per-World galleries, persistence, approvals/safety, activity
history, search, import/export/backup.

Intentionally left as labelled **PLACEHOLDER** slots for the visual team: final
artwork, World covers/backgrounds, the Void Lord & halo composition, Void Railway
transitions and ambient sound/animation. These are swappable without touching the
code — see `assets/placeholders/README.md`.
