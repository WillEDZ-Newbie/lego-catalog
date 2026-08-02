/**
 * Builder: tick a list of stages (grouped by category) into an ordered
 * pipeline tray. Reorder / remove within the tray, pick a model, then Start.
 */
import { useRun } from "@/store/run";
import {
  CATEGORY_LABELS,
  getStage,
  stagesByCategory,
} from "@/stages";
import { BlobImage } from "./BlobImage";

export function Builder() {
  const {
    session,
    models,
    addStage,
    removeStage,
    moveStage,
    setModel,
    canStart,
    beginRun,
    goHome,
  } = useRun();

  if (!session) return null;
  const groups = stagesByCategory();
  const hasSource = Boolean(session.sourceImageB64);

  return (
    <div className="builder">
      <header className="bar">
        <button className="ghost-btn" onClick={goHome}>
          ← Home
        </button>
        <span className="inscription bar-title">Build a pipeline</span>
        <span />
      </header>

      <div className="builder-grid">
        <section className="stage-catalog">
          {hasSource && (
            <div className="source-preview">
              <BlobImage blobKey={`${session.id}/source`} alt="Your source image" className="source-thumb" />
              <span>Working from your image.</span>
            </div>
          )}

          {groups.map(({ category, stages }) => (
            <div key={category} className="catalog-group">
              <h3 className="section-title">{CATEGORY_LABELS[category]}</h3>
              <div className="stage-cards">
                {stages.map((stage) => {
                  const gated = Boolean(stage.needsMask);
                  return (
                    <button
                      key={stage.id}
                      className={`stage-card ${gated ? "gated" : ""}`}
                      onClick={() => !gated && addStage(stage.id)}
                      disabled={gated}
                      title={gated ? "Needs the mask painter — coming in the next update" : stage.blurb}
                    >
                      <span className="stage-card-name">{stage.name}</span>
                      <span className="stage-card-blurb">{stage.blurb}</span>
                      {gated && <span className="stage-card-flag">Coming soon</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>

        <aside className="pipeline-tray">
          <h3 className="section-title">Your pipeline</h3>
          {session.pipeline.length === 0 ? (
            <p className="tray-empty">Tap stages on the left to add them here, in order.</p>
          ) : (
            <ol className="tray-list">
              {session.pipeline.map((inst, i) => {
                const def = getStage(inst.stageId);
                return (
                  <li key={inst.instanceId} className="tray-item">
                    <span className="tray-index tnum">{i + 1}</span>
                    <span className="tray-name">{def?.name ?? inst.stageId}</span>
                    <span className="tray-actions">
                      <button className="mini-btn" onClick={() => moveStage(inst.instanceId, -1)} disabled={i === 0} aria-label="Move up">↑</button>
                      <button className="mini-btn" onClick={() => moveStage(inst.instanceId, 1)} disabled={i === session.pipeline.length - 1} aria-label="Move down">↓</button>
                      <button className="mini-btn danger" onClick={() => removeStage(inst.instanceId)} aria-label="Remove">✕</button>
                    </span>
                  </li>
                );
              })}
            </ol>
          )}

          <label className="control-label" htmlFor="model-pick">
            Model
          </label>
          <select
            id="model-pick"
            className="select-input"
            value={session.model ?? ""}
            onChange={(e) => setModel(e.target.value || undefined)}
          >
            <option value="">Any model (let the workshop choose)</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} · {m.count} workers
              </option>
            ))}
          </select>

          {!canStart() && session.pipeline.length > 0 && (
            <p className="tray-hint">
              {getStage(session.pipeline[0].stageId)?.input === "image" && !hasSource
                ? "Your first stage needs an image. Start a session from an image, or begin with a fresh generation."
                : session.pipeline.some((p) => getStage(p.stageId)?.needsMask)
                  ? "Remove the repair stage for now — mask painting arrives in the next update."
                  : ""}
            </p>
          )}

          <button className="primary-btn start-btn" onClick={beginRun} disabled={!canStart()}>
            Start carving →
          </button>
        </aside>
      </div>
    </div>
  );
}
