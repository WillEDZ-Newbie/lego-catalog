/**
 * MILESTONE 1 — the proof-of-loop test bench.
 *
 * "A tiny test page that runs one txt2img and renders it. Prove the
 *  submit/check/status/R2 loop." (CLAUDE.md, Build order §1)
 *
 * This is deliberately utilitarian: it is scaffolding to verify the Horde
 * client against the live network, NOT the artist-facing product. It shows raw
 * mechanics (queue position, kudos, wait_time) on purpose. The real Runner
 * (Milestone 2+) hides all of this behind the "carving" progress UI.
 *
 * NOTE: this bench cannot be exercised inside the build sandbox (the Horde API
 * is blocked there); it is meant to be run from a browser with network access.
 */
import { useCallback, useRef, useState } from "react";
import { horde } from "@/horde/instance";
import { ANON_KEY, HordeUserError, type GenerateProgress } from "@/horde";
import { useSettings } from "@/store/settings";
import { useObjectUrl } from "@/lib/useObjectUrl";

type Phase = "idle" | "connecting" | "queued" | "downloading" | "done" | "error";

export function TestBench() {
  const { apiKey, hasRealKey, setApiKey } = useSettings();
  const [prompt, setPrompt] = useState(
    "a marble statue of a philosopher, classical Greek, Pentelic marble, museum lighting",
  );
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [kudos, setKudos] = useState<number | null>(null);
  const [seed, setSeed] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [heartbeat, setHeartbeat] = useState<null | boolean>(null);
  const abortRef = useRef<AbortController | null>(null);

  const imageUrl = useObjectUrl(blob);

  const ping = useCallback(async () => {
    setHeartbeat(null);
    setHeartbeat(await horde.heartbeat());
  }, []);

  const run = useCallback(async () => {
    setError(null);
    setBlob(null);
    setSeed(null);
    setKudos(null);
    setProgress(null);
    setPhase("connecting");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const { status, blobs } = await horde.generate(
        {
          prompt,
          params: { width: 512, height: 512, steps: 20, n: 1, karras: true },
          // models omitted → any worker. Real UI picks from /status/models.
        },
        {
          signal: ac.signal,
          onSubmitted: (r) => {
            setKudos(r.kudos ?? null);
            setPhase("queued");
          },
          onProgress: (p) => setProgress(p),
        },
      );
      setPhase("downloading");
      setBlob(blobs[0] ?? null);
      setSeed(status.generations[0]?.seed ?? null);
      setPhase("done");
    } catch (e) {
      if (e instanceof HordeUserError && e.kind === "aborted") {
        setPhase("idle");
        return;
      }
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    } finally {
      abortRef.current = null;
    }
  }, [prompt]);

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const busy = phase === "connecting" || phase === "queued" || phase === "downloading";

  return (
    <div style={s.wrap}>
      <header style={s.header}>
        <div className="inscription" style={s.brand}>
          Atelier
        </div>
        <div style={s.sub}>Milestone 1 · Horde loop test bench</div>
      </header>

      <section style={s.card}>
        <label style={s.label} htmlFor="key">
          Horde API key
          {!hasRealKey() && (
            <span style={s.note}>
              {" "}
              — running anonymously.{" "}
              <a href="https://stablehorde.net/register" target="_blank" rel="noreferrer">
                Registered keys queue faster
              </a>
              .
            </span>
          )}
        </label>
        <input
          id="key"
          style={s.input}
          value={apiKey === ANON_KEY ? "" : apiKey}
          placeholder={ANON_KEY + " (anonymous)"}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </section>

      <section style={s.card}>
        <label style={s.label} htmlFor="prompt">
          Prompt
        </label>
        <textarea
          id="prompt"
          style={{ ...s.input, minHeight: 72, resize: "vertical" }}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div style={s.row}>
          {!busy ? (
            <button style={s.primary} onClick={run}>
              Carve one (512², 20 steps)
            </button>
          ) : (
            <button style={s.danger} onClick={stop}>
              Stop
            </button>
          )}
          <button style={s.ghost} onClick={ping}>
            Ping network
          </button>
          {heartbeat !== null && (
            <span style={s.status}>
              {heartbeat ? "● network alive" : "○ network unreachable"}
            </span>
          )}
        </div>
      </section>

      <section style={s.card}>
        <div style={s.metaGrid}>
          <Meta label="Phase" value={phase} />
          <Meta label="Kudos cost" value={kudos ?? "—"} />
          <Meta
            label="Queue pos."
            value={progress ? progress.check.queue_position : "—"}
          />
          <Meta
            label="ETA"
            value={progress ? `${Math.max(0, Math.round(progress.check.wait_time))}s` : "—"}
          />
          <Meta label="Seed" value={seed ?? "—"} />
        </div>
        {error && <div style={s.error}>{error}</div>}
      </section>

      <section style={{ ...s.card, ...s.stage }}>
        {imageUrl ? (
          <img src={imageUrl} alt="Generated result" style={s.image} />
        ) : (
          <div style={s.placeholder}>
            {busy ? "Carving…" : "The result will appear here."}
          </div>
        )}
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div style={s.metaLabel}>{label}</div>
      <div className="tnum" style={s.metaValue}>
        {value}
      </div>
    </div>
  );
}

/* Inline styles here only because this is throwaway M1 scaffolding; the real
   product uses the CSS design system. */
const s: Record<string, React.CSSProperties> = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "24px 16px 64px", display: "grid", gap: 16 },
  header: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 },
  brand: { fontSize: 28 },
  sub: { color: "var(--limestone)", fontSize: 13 },
  card: {
    background: "var(--ground-raised)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius)",
    padding: 16,
    display: "grid",
    gap: 10,
  },
  label: { color: "var(--marble-dim)", fontSize: 14 },
  note: { color: "var(--limestone)", fontSize: 13, fontWeight: 400 },
  input: {
    width: "100%",
    background: "var(--ground-sunken)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-sm)",
    color: "var(--marble)",
    padding: "10px 12px",
    minHeight: 44,
  },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  primary: {
    minHeight: 44,
    padding: "0 18px",
    background: "var(--bronze)",
    color: "#12140f",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontWeight: 600,
  },
  danger: {
    minHeight: 44,
    padding: "0 18px",
    background: "var(--terracotta)",
    color: "#1b0f0a",
    border: "none",
    borderRadius: "var(--radius-sm)",
    fontWeight: 600,
  },
  ghost: {
    minHeight: 44,
    padding: "0 14px",
    background: "transparent",
    color: "var(--marble-dim)",
    border: "1px solid var(--hairline)",
    borderRadius: "var(--radius-sm)",
  },
  status: { color: "var(--limestone)", fontSize: 13 },
  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
    gap: 12,
  },
  metaLabel: { color: "var(--limestone)", fontSize: 12, marginBottom: 2 },
  metaValue: { color: "var(--marble)", fontSize: 15 },
  error: { color: "var(--terracotta-bright)", fontSize: 14, lineHeight: 1.4 },
  stage: { minHeight: 320, alignItems: "center", justifyItems: "center" },
  image: { maxWidth: "100%", borderRadius: "var(--radius-sm)", boxShadow: "var(--bevel)" },
  placeholder: { color: "var(--limestone)", fontSize: 14, textAlign: "center" },
};
