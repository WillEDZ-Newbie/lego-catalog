/**
 * Runner: step-through execution. For each pipeline step we show the stage's
 * control panel → a "carving" queue card → the judgement screen with
 * Continue / Retry / Undo / Stop. Accepted outputs build the filmstrip.
 *
 * The compare gesture, A/B slider and marble-frieze filmstrip get their polish
 * in Milestone 4; this milestone proves the loop and the four actions.
 */
import { useEffect, useState } from "react";
import { useRun } from "@/store/run";
import { useProject } from "@/store/project";
import { composeHouseStyle, getStage } from "@/stages";
import { getBlob } from "@/lib/db";
import { saveImage, saveRecipe } from "@/lib/export";
import { AutoPanel } from "./controls/AutoPanel";
import type { PanelContext } from "./controls/panelContext";
import { MaskPainter } from "./hero/MaskPainter";
import { CompareView } from "./CompareView";
import { BlobImage } from "./BlobImage";

export function Runner() {
  const { session, phase } = useRun();
  if (!session) return null;
  const stepDef = getStage(session.pipeline[session.pointer]?.stageId ?? "");

  return (
    <div className="runner">
      <RunnerBar />
      <div className="runner-body">
        {phase === "panel" && stepDef && <StagePanel />}
        {phase === "queued" && <QueueCard />}
        {phase === "judging" && <Judgement />}
        {phase === "error" && <ErrorCard />}
        {phase === "done" && <DoneCard />}
      </div>
      <Filmstrip />
    </div>
  );
}

function RunnerBar() {
  const { session, goHome } = useRun();
  if (!session) return null;
  const total = session.pipeline.length;
  const step = Math.min(session.pointer + 1, total);
  const def = getStage(session.pipeline[session.pointer]?.stageId ?? "");
  return (
    <header className="bar">
      <button className="ghost-btn" onClick={goHome}>← Home</button>
      <span className="bar-title">
        <span className="inscription">{def?.name ?? "Finished"}</span>
        <span className="bar-step tnum"> · step {step} of {total}</span>
      </span>
      <span />
    </header>
  );
}

function StagePanel() {
  const {
    session,
    currentValues,
    setValue,
    carve,
    resolveInput,
    previewStrength,
    recallSeed,
    maskB64,
    setMask,
  } = useRun();
  const houseStyle = useProject((s) => s.houseStyle);
  const [inputImageB64, setInputImageB64] = useState<string | undefined>();
  const [painting, setPainting] = useState(false);

  const pointer = session?.pointer ?? 0;
  useEffect(() => {
    let live = true;
    resolveInput().then((b64) => live && setInputImageB64(b64));
    return () => {
      live = false;
    };
  }, [resolveInput, pointer]);

  if (!session) return null;
  const def = getStage(session.pipeline[session.pointer].stageId);
  if (!def) return null;

  const ctx: PanelContext = {
    inputImageB64,
    frames: session.frames.map((f) => ({ blobKey: f.blobKey, seed: f.seed })),
    currentSeed: session.lockedSeed,
    onRecallSeed: recallSeed,
    previewStrength,
  };

  const maskReady = !def.needsMask || Boolean(maskB64);
  const hasPrompt = def.params.some((p) => p.control === "text" || p.control === "textarea");
  const finalPrompt = def.buildPayload(currentValues, {
    houseStyle,
    lockedSeed: session.lockedSeed,
    model: session.model,
  }).prompt;

  return (
    <div className="stage-panel">
      <p className="stage-blurb">{def.blurb}</p>

      {def.needsMask && (
        <div className="mask-row">
          <span className={`mask-status ${maskB64 ? "ready" : ""}`}>
            {maskB64 ? "Area painted ✓" : "Paint the area to work on first."}
          </span>
          <button
            className="ghost-btn"
            onClick={() => setPainting(true)}
            disabled={!inputImageB64}
          >
            {maskB64 ? "Repaint area" : "Paint the area"}
          </button>
        </div>
      )}

      <AutoPanel params={def.params} values={currentValues} onChange={setValue} ctx={ctx} />

      {hasPrompt && (
        <div className="house-layer">
          <span className="house-locked">Locked style: {composeHouseStyle(houseStyle)}</span>
          <details className="prompt-peek">
            <summary>Peek at the final prompt</summary>
            <p className="prompt-text">{finalPrompt}</p>
          </details>
        </div>
      )}

      <button className="primary-btn carve-btn" onClick={() => void carve()} disabled={!maskReady}>
        Carve
      </button>

      {painting && inputImageB64 && (
        <MaskPainter
          imageB64={inputImageB64}
          onDone={(m) => {
            setMask(m);
            setPainting(false);
          }}
          onCancel={() => setPainting(false)}
        />
      )}
    </div>
  );
}

function QueueCard() {
  const { progress, kudos, stopCarve } = useRun();
  const eta = progress ? etaWords(progress.check.wait_time) : "estimating…";
  const pos = progress?.check.queue_position;
  const frac = progress
    ? Math.max(
        0.03,
        Math.min(0.97, progress.elapsed / (progress.elapsed + Math.max(1, progress.check.wait_time))),
      )
    : 0.05;
  return (
    <div className="queue-card">
      <div className="carving-fill" style={{ width: `${Math.round(frac * 100)}%` }} aria-hidden="true" />
      <div className="queue-text">
        <span className="queue-eta">Carving — {eta}</span>
        {typeof pos === "number" && pos > 0 && <span className="queue-pos">Position {pos} in the queue</span>}
        {typeof kudos === "number" && <span className="queue-kudos">Cost about {Math.round(kudos)} kudos</span>}
      </div>
      <button className="danger-btn" onClick={stopCarve}>Stop</button>
    </div>
  );
}

function Judgement() {
  const { session, pending, attempts, accept, retry, undo, stopRun } = useRun();
  if (!session || !pending) return null;
  const inputKey =
    session.pointer > 0
      ? session.frames[session.pointer - 1]?.blobKey
      : getStage(session.pipeline[session.pointer].stageId)?.input === "image"
        ? `${session.id}/source`
        : undefined;

  return (
    <div className="judgement">
      <CompareView beforeKey={inputKey} afterKey={pending.blobKey} />

      {attempts.length > 1 && (
        <div className="attempt-rail">
          <span className="rail-label">Attempts</span>
          {attempts.map((a, i) => (
            <BlobImage key={a.blobKey} blobKey={a.blobKey} alt={`Attempt ${i + 1}`} className="rail-thumb" />
          ))}
        </div>
      )}

      <div className="judge-actions">
        <button className="primary-btn" onClick={() => void accept()}>Continue →</button>
        <button className="ghost-btn" onClick={retry}>Retry</button>
        <button className="warn-btn" onClick={undo}>Undo</button>
        <button className="ghost-btn" onClick={stopRun}>Stop</button>
      </div>
    </div>
  );
}

function ErrorCard() {
  const { error, retry } = useRun();
  return (
    <div className="error-card">
      <p>{error ?? "Something went wrong."}</p>
      <button className="primary-btn" onClick={retry}>Try again</button>
    </div>
  );
}

function DoneCard() {
  const { session, newFromPrompt, goHome, toRecipe } = useRun();
  const lastFrame = session?.frames[session.frames.length - 1];

  const onSaveImage = async () => {
    if (!lastFrame) return;
    const blob = await getBlob(lastFrame.blobKey);
    if (blob) await saveImage(blob, "atelier-statue.webp");
  };
  const onSaveRecipe = () => {
    const recipe = toRecipe();
    if (recipe) saveRecipe(recipe);
  };

  return (
    <div className="done-card">
      <h2 className="inscription">Carved</h2>
      {lastFrame && <BlobImage blobKey={lastFrame.blobKey} alt="Final result" className="done-image" />}
      <p>Save the image, or save the recipe to run this treatment again later.</p>
      <div className="judge-actions">
        <button className="primary-btn" onClick={() => void onSaveImage()} disabled={!lastFrame}>Save image</button>
        <button className="ghost-btn" onClick={onSaveRecipe}>Save recipe</button>
        <button className="ghost-btn" onClick={goHome}>Home</button>
        <button className="ghost-btn" onClick={newFromPrompt}>New session</button>
      </div>
    </div>
  );
}

function Filmstrip() {
  const { session, forkFrom } = useRun();
  const [selected, setSelected] = useState<number | null>(null);
  if (!session || session.frames.length === 0) return null;
  const currentIndex = session.frames.length - 1;

  return (
    <div className="frieze-wrap">
      {selected !== null && (
        <div className="fork-bar">
          <span>Fork a new session from step {selected + 1}?</span>
          <button
            className="primary-btn"
            onClick={() => {
              forkFrom(selected);
              setSelected(null);
            }}
          >
            Fork from here
          </button>
          <button className="ghost-btn" onClick={() => setSelected(null)}>
            Cancel
          </button>
        </div>
      )}
      <div className="filmstrip" role="list" aria-label="Accepted steps">
        {session.frames.map((f, i) => (
          <button
            key={f.blobKey}
            className={`frieze-frame ${i === currentIndex ? "lit" : ""} ${i === selected ? "picked" : ""}`}
            role="listitem"
            onClick={() => setSelected((s) => (s === i ? null : i))}
            title={`${f.stageName} — tap to fork from here`}
          >
            <BlobImage blobKey={f.blobKey} alt={f.stageName} className="frame-img" />
            <span className="frame-cap">{f.stageName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** ETA in words — never a raw percentage or a spinner. */
function etaWords(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "almost there";
  if (seconds < 20) return "a few seconds";
  if (seconds < 75) return "under a minute";
  const mins = Math.round(seconds / 60);
  if (mins === 1) return "about a minute";
  if (mins === 2) return "about two minutes";
  if (mins <= 5) return `about ${mins} minutes`;
  return "several minutes at current traffic";
}
