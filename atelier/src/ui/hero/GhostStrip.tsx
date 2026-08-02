/**
 * The Ghost Strip (denoise strength) — the single most valuable control.
 * A slider ("Keep the image ↔ Reimagine it") annotated by five low-res preview
 * thumbnails at fixed strengths, generated on demand and cached per input image.
 * Tap a thumbnail to snap the strength to it.
 */
import { useEffect, useRef, useState } from "react";
import type { ParamDef } from "@/stages";
import type { PanelContext } from "../controls/panelContext";
import { hashString } from "@/lib/hash";
import { useObjectUrl } from "@/lib/useObjectUrl";

const STRENGTHS = [0.2, 0.35, 0.5, 0.65, 0.8];

/** Module-level cache: previews survive re-opening a stage panel. */
const previewCache = new Map<string, Blob>();

export function GhostStrip({
  def,
  value,
  onChange,
  ctx,
}: {
  def: ParamDef;
  value: number;
  onChange: (v: number) => void;
  ctx: PanelContext;
}) {
  const [previews, setPreviews] = useState<Record<number, Blob>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const baseKey = hashString(ctx.inputImageB64 ?? "txt");

  useEffect(() => {
    // Rehydrate any cached previews for this input image.
    const found: Record<number, Blob> = {};
    for (const s of STRENGTHS) {
      const c = previewCache.get(`${baseKey}-${s}`);
      if (c) found[s] = c;
    }
    setPreviews(found);
    return () => abortRef.current?.abort();
  }, [baseKey]);

  const preview = async () => {
    setError(null);
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      // Sequential — one ghost-strip job at a time (Horde etiquette).
      for (const s of STRENGTHS) {
        if (ac.signal.aborted) break;
        if (previewCache.has(`${baseKey}-${s}`)) continue;
        const blob = await ctx.previewStrength(s, ac.signal);
        previewCache.set(`${baseKey}-${s}`, blob);
        setPreviews((p) => ({ ...p, [s]: blob }));
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError(e instanceof Error ? e.message : "Preview failed.");
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  const nearest = STRENGTHS.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a));

  return (
    <div className="ghost-strip">
      <div className="ghost-thumbs">
        {STRENGTHS.map((s) => (
          <GhostThumb
            key={s}
            strength={s}
            blob={previews[s]}
            active={s === nearest}
            busy={busy && !previews[s]}
            onPick={() => onChange(s)}
          />
        ))}
      </div>

      <input
        type="range"
        className="ghost-slider"
        min={def.min ?? 0.1}
        max={def.max ?? 0.9}
        step={def.step ?? 0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <div className="slider-ends">
        <span>{def.leftLabel ?? "Keep"}</span>
        <span className="tnum">{value.toFixed(2)}</span>
        <span>{def.rightLabel ?? "Reimagine"}</span>
      </div>

      <button type="button" className="advanced-toggle" onClick={preview} disabled={busy || !ctx.inputImageB64}>
        {busy ? "Previewing strengths…" : "Preview strengths"}
      </button>
      {error && <div className="control-help" style={{ color: "var(--terracotta-bright)" }}>{error}</div>}
    </div>
  );
}

function GhostThumb({
  strength,
  blob,
  active,
  busy,
  onPick,
}: {
  strength: number;
  blob?: Blob;
  active: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const url = useObjectUrl(blob ?? null);
  return (
    <button type="button" className={`ghost-thumb ${active ? "active" : ""}`} onClick={onPick} title={`Strength ${strength}`}>
      {url ? <img src={url} alt={`Preview at ${strength}`} /> : <span className={`ghost-empty ${busy ? "loading" : ""}`} />}
      <span className="ghost-label tnum">{strength}</span>
    </button>
  );
}
