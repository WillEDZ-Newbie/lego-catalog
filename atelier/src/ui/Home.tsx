/**
 * Home screen: ways in (from a description / from an image / a preset / a
 * recipe), recent sessions, settings and install.
 */
import { useEffect, useRef, useState } from "react";
import { useRun } from "@/store/run";
import { useProject } from "@/store/project";
import { listSessions, type SessionRecord } from "@/lib/db";
import { BUILTIN_PRESETS, type Preset } from "@/stages";
import { parseRecipe } from "@/lib/export";
import { useInstallPrompt } from "@/lib/pwa";
import { BlobImage } from "./BlobImage";
import { Settings } from "./Settings";

export function Home() {
  const { newFromPrompt, newFromImage, startPreset, startRecipe, setSourceImage } = useRun();
  const presets = useProject((s) => s.presets);
  const [recents, setRecents] = useState<SessionRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingPreset, setPendingPreset] = useState<Preset | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const presetFileRef = useRef<HTMLInputElement>(null);
  const recipeRef = useRef<HTMLInputElement>(null);
  const { canInstall, isIOS, install } = useInstallPrompt();

  useEffect(() => {
    listSessions().then(setRecents);
  }, []);

  const openImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await newFromImage(file);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't open that image.");
    } finally {
      setBusy(false);
    }
  };

  const pickPreset = (preset: Preset) => {
    if (preset.from === "image") {
      setPendingPreset(preset);
      presetFileRef.current?.click();
    } else {
      startPreset(preset);
    }
  };

  const onPresetImage = async (file: File | undefined) => {
    const preset = pendingPreset;
    setPendingPreset(null);
    if (!file || !preset) return;
    setBusy(true);
    try {
      startPreset(preset);
      await setSourceImage(file);
    } finally {
      setBusy(false);
    }
  };

  const openRecipe = async (file: File | undefined) => {
    if (!file) return;
    try {
      startRecipe(parseRecipe(await file.text()));
    } catch (e) {
      alert(e instanceof Error ? e.message : "That isn't a valid recipe file.");
    }
  };

  const allPresets = [...BUILTIN_PRESETS, ...presets];

  return (
    <div className="home">
      <header className="home-head">
        <button className="ghost-btn home-settings" onClick={() => setShowSettings(true)}>Settings</button>
        <h1 className="inscription home-brand">Atelier</h1>
        <p className="home-tag">A workshop for carving images, step by step.</p>
      </header>

      <div className="home-actions">
        <button className="big-action" onClick={newFromPrompt} disabled={busy}>
          <span className="big-action-title">New from a description</span>
          <span className="big-action-sub">Start from words and carve an image.</span>
        </button>
        <button className="big-action" onClick={() => fileRef.current?.click()} disabled={busy}>
          <span className="big-action-title">New from an image</span>
          <span className="big-action-sub">Bring in a statue photo to work on.</span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => openImage(e.target.files?.[0])} />
        <input ref={presetFileRef} type="file" accept="image/*" hidden onChange={(e) => onPresetImage(e.target.files?.[0])} />
        <input ref={recipeRef} type="file" accept="application/json,.json" hidden onChange={(e) => openRecipe(e.target.files?.[0])} />
      </div>

      <section className="presets">
        <h2 className="section-title">Presets</h2>
        <div className="preset-row">
          {allPresets.map((p) => (
            <button key={p.id} className="preset-card" onClick={() => pickPreset(p)} disabled={busy} title={p.blurb}>
              <span className="preset-name">{p.name}</span>
              <span className="preset-blurb">{p.blurb}</span>
              <span className="preset-from">{p.from === "image" ? "needs an image" : "from words"}</span>
            </button>
          ))}
        </div>
      </section>

      {recents.length > 0 && (
        <section className="recents">
          <h2 className="section-title">Recent sessions</h2>
          <div className="recents-row">
            {recents.map((r) => (
              <div key={r.id} className="recent-card" title={r.title}>
                <BlobImage blobKey={r.thumbKey} alt={r.title} className="recent-thumb" />
                <span className="recent-meta">{r.frameCount} step{r.frameCount === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="home-foot">
        <button className="ghost-btn" onClick={() => recipeRef.current?.click()}>Open a recipe</button>
        {canInstall && <button className="ghost-btn" onClick={install}>Install app</button>}
        {isIOS && !canInstall && <span className="foot-note">To install: Share → Add to Home Screen</span>}
      </footer>

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </div>
  );
}
