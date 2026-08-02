/**
 * The Artist Lock (seed). A toggle — 🔒 "Same artist" / 🎲 "New artist" — over a
 * rail of previous results; tap one to recall its seed. Seeds are never shown
 * as numbers here (that lives in Advanced).
 */
import type { ParamDef } from "@/stages";
import type { PanelContext } from "../controls/panelContext";
import { BlobImage } from "../BlobImage";

export function ArtistLock({
  def,
  value,
  onChange,
  ctx,
}: {
  def: ParamDef;
  value: boolean;
  onChange: (v: boolean) => void;
  ctx: PanelContext;
}) {
  const locked = value === true;
  return (
    <div className="artist-lock">
      <button
        type="button"
        className={`lock-toggle ${locked ? "on" : ""}`}
        onClick={() => onChange(!locked)}
        aria-pressed={locked}
      >
        <span className="lock-glyph" aria-hidden="true">{locked ? "🔒" : "🎲"}</span>
        <span className="lock-text">
          <span className="lock-title">{locked ? "Same artist" : "New artist"}</span>
          {def.help && <span className="control-help">{def.help}</span>}
        </span>
      </button>

      {ctx.frames.length > 0 && (
        <div className="seed-rail">
          <span className="rail-label">Recall a result</span>
          <div className="seed-rail-row">
            {ctx.frames.map((f) => (
              <button
                key={f.blobKey}
                type="button"
                className={`seed-chip ${f.seed === ctx.currentSeed ? "current" : ""}`}
                title="Use this result's seed"
                onClick={() => ctx.onRecallSeed(f.seed)}
              >
                <BlobImage blobKey={f.blobKey} alt="Previous result" className="seed-thumb" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
