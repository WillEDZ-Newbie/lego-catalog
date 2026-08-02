/**
 * Home screen: two ways in ("from a description" / "from an image") and a row
 * of recent sessions. Empty state invites action.
 */
import { useEffect, useRef, useState } from "react";
import { useRun } from "@/store/run";
import { listSessions, type SessionRecord } from "@/lib/db";
import { BlobImage } from "./BlobImage";
import { useSettings } from "@/store/settings";

export function Home() {
  const { newFromPrompt, newFromImage } = useRun();
  const { hasRealKey } = useSettings();
  const [recents, setRecents] = useState<SessionRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listSessions().then(setRecents);
  }, []);

  const onPick = async (file: File | undefined) => {
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

  return (
    <div className="home">
      <header className="home-head">
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
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onPick(e.target.files?.[0])}
        />
      </div>

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
        {!hasRealKey() && (
          <span>
            Running free and anonymously.{" "}
            <a href="https://stablehorde.net/register" target="_blank" rel="noreferrer">
              A free key
            </a>{" "}
            makes it faster.
          </span>
        )}
      </footer>
    </div>
  );
}
