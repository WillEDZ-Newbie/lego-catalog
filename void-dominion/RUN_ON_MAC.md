# Running Void Dominion on a Mac with Docker Desktop

A complete, non-technical walkthrough. Two ways to run it — pick one.

- **Method A — one command** (recommended): no files to download, just Docker + one line.
- **Method B — from the project folder**: if you already have the repo.

Either way, once it's running you open **http://localhost:8080/** in your browser.
Running it this way (over a real web address instead of a file) means your data
**saves permanently** between sessions.

---

## Step 1 — Install Docker Desktop (one time)

1. Go to **https://www.docker.com/products/docker-desktop/**
2. Download the Mac version that matches your chip:
   - **Apple Silicon** (M1/M2/M3/M4) — most Macs from 2020 onward
   - **Intel** — older Macs
   - *Not sure? Click the Apple menu () → About This Mac. "Chip" = Apple Silicon; "Processor" with Intel = Intel.*
3. Open the downloaded `.dmg` and drag **Docker** into **Applications**.
4. Open **Docker** from Applications. Accept the prompts (it may ask for your
   password once). Wait until the whale icon in the top menu bar stops animating
   — that means Docker is running.

You only ever do Step 1 once.

---

## Step 2 — Run Void Dominion

### Method A — one command (nothing to download)

1. Open **Terminal** (press ⌘ + Space, type "Terminal", press Return).
2. Paste this and press Return:
   ```bash
   docker run --rm -p 8080:80 ghcr.io/willedz-newbie/void-dominion:latest
   ```
   The first time, it downloads the app (a few seconds). Leave this window open —
   it's the app running.
3. Open your browser to **http://localhost:8080/**

To stop it: click the Terminal window and press **Ctrl + C**.

To run it again later, just repeat steps 1–3 (it won't re-download).

### Method B — from the project folder

If you have the `lego-catalog` project on your Mac:

1. Open **Terminal**.
2. Go into the app folder (adjust the path to where you saved it):
   ```bash
   cd ~/Downloads/lego-catalog/void-dominion
   ```
3. Start it:
   ```bash
   docker compose up
   ```
4. Open **http://localhost:8080/**

To stop it: press **Ctrl + C** in Terminal, then run `docker compose down`.

---

## Everyday use

- **Start:** the `docker run` (Method A) or `docker compose up` (Method B) command.
- **Open:** http://localhost:8080/
- **Stop:** Ctrl + C in the Terminal window.
- Docker Desktop also has a dashboard (the whale icon → Dashboard) where you can
  start/stop the container with a button instead of the Terminal.

---

## Troubleshooting

- **"Cannot connect to the Docker daemon"** → Docker Desktop isn't running. Open
  it from Applications and wait for the whale icon to go steady, then retry.
- **The page won't load at localhost:8080** → give it a few seconds after the
  command, then refresh. Make sure the Terminal command is still running.
- **"port is already allocated"** → something else is using 8080. Run it on a
  different port, e.g. `-p 9090:80` (Method A) then open http://localhost:9090/.
- **It's slow to start the very first time** → it's downloading the image once;
  subsequent runs are instant.
- **Want it to keep running after you close Terminal?** Use Docker Desktop's
  dashboard, or Method B's `docker compose up -d` (detached), and stop with
  `docker compose down`.

---

## Which option should I use?

- **Just want to look at it?** The `void-dominion-standalone.html` file is even
  simpler — double-click, no Docker at all. Data may not persist in some browsers.
- **Want it running properly with saved data?** Use Docker (this guide).
- **Want a shareable web link?** Ask for the GitHub Pages link — no install for
  whoever you send it to.
