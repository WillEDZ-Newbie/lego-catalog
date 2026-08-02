/**
 * The session + Runner state machine.
 *
 * Undo is trivial by design (CLAUDE.md): every stage output is an immutable
 * Blob in IndexedDB keyed `session/{id}/{stepIndex}-{attempt}`. State is a
 * pointer into that append-only history — never mutate, only append and
 * re-point.
 */
import { create } from "zustand";
import type { GenerateProgress, HordeActiveModel } from "@/horde";
import { HordeUserError } from "@/horde";
import { horde } from "@/horde/instance";
import {
  DEFAULT_HOUSE_STYLE,
  type ParamValue,
  type StageDef,
  defaultsFor,
  getStage,
} from "@/stages";
import { blobToBase64, encodeForHorde } from "@/lib/image";
import { getBlob, putBlob, saveSession } from "@/lib/db";

export type View = "home" | "builder" | "runner";
export type RunPhase = "panel" | "queued" | "judging" | "done" | "error";

export interface PipelineStage {
  instanceId: string;
  stageId: string;
  values: Record<string, ParamValue>;
}

export interface Attempt {
  blobKey: string;
  seed: string;
}

export interface Frame {
  stepIndex: number;
  stageId: string;
  stageName: string;
  blobKey: string;
  seed: string;
}

interface Session {
  id: string;
  createdAt: number;
  title: string;
  sourceImageB64?: string;
  pipeline: PipelineStage[];
  model?: string;
  lockedSeed: string;
  frames: Frame[];
  pointer: number;
}

interface RunState {
  view: View;
  session: Session | null;
  phase: RunPhase;
  progress: GenerateProgress | null;
  kudos: number | null;
  error: string | null;

  // working state for the current step
  currentValues: Record<string, ParamValue>;
  attempts: Attempt[];
  pending: Attempt | null; // output awaiting judgement

  models: HordeActiveModel[];
  modelsLoaded: boolean;

  // navigation
  goHome: () => void;
  newFromPrompt: () => void;
  newFromImage: (file: Blob) => Promise<void>;

  // builder
  addStage: (stageId: string) => void;
  removeStage: (instanceId: string) => void;
  moveStage: (instanceId: string, dir: -1 | 1) => void;
  setModel: (name: string | undefined) => void;
  loadModels: () => Promise<void>;
  canStart: () => boolean;
  beginRun: () => void;

  // runner
  setValue: (key: string, value: ParamValue) => void;
  carve: () => Promise<void>;
  stopCarve: () => void;
  accept: () => Promise<void>;
  retry: () => void;
  undo: () => void;
  stopRun: () => void;
}

/** Non-reactive holder for the in-flight abort controller. */
let inflight: AbortController | null = null;

/** Deterministic-ish id without Date.now()/Math.random dependence at import. */
function makeId(prefix: string): string {
  const t = typeof performance !== "undefined" ? Math.floor(performance.now() * 1000) : 0;
  return `${prefix}-${t.toString(36)}-${idCounter++}`;
}
let idCounter = 0;

function currentStageDef(s: Session): StageDef | undefined {
  const inst = s.pipeline[s.pointer];
  return inst ? getStage(inst.stageId) : undefined;
}

function freshSession(): Session {
  return {
    id: makeId("session"),
    createdAt: Date.now(),
    title: "Untitled session",
    pipeline: [],
    lockedSeed: String(Math.floor(1_000_000 + (performance.now() % 1) * 8_000_000)),
    frames: [],
    pointer: 0,
  };
}

export const useRun = create<RunState>((set, get) => ({
  view: "home",
  session: null,
  phase: "panel",
  progress: null,
  kudos: null,
  error: null,
  currentValues: {},
  attempts: [],
  pending: null,
  models: [],
  modelsLoaded: false,

  goHome: () => {
    inflight?.abort();
    set({ view: "home", session: null, phase: "panel", progress: null, error: null, pending: null, attempts: [] });
  },

  newFromPrompt: () => {
    set({ view: "builder", session: freshSession(), error: null });
    void get().loadModels();
  },

  newFromImage: async (file) => {
    const enc = await encodeForHorde(file);
    const s = freshSession();
    s.sourceImageB64 = enc.b64;
    const key = `${s.id}/source`;
    await putBlob(key, enc.blob);
    set({ view: "builder", session: s, error: null });
    void get().loadModels();
  },

  addStage: (stageId) => {
    const s = get().session;
    const def = getStage(stageId);
    if (!s || !def) return;
    const inst: PipelineStage = { instanceId: makeId("stg"), stageId, values: defaultsFor(def.params) };
    set({ session: { ...s, pipeline: [...s.pipeline, inst] } });
  },

  removeStage: (instanceId) => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, pipeline: s.pipeline.filter((p) => p.instanceId !== instanceId) } });
  },

  moveStage: (instanceId, dir) => {
    const s = get().session;
    if (!s) return;
    const i = s.pipeline.findIndex((p) => p.instanceId === instanceId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.pipeline.length) return;
    const pipeline = [...s.pipeline];
    [pipeline[i], pipeline[j]] = [pipeline[j], pipeline[i]];
    set({ session: { ...s, pipeline } });
  },

  setModel: (name) => {
    const s = get().session;
    if (!s) return;
    set({ session: { ...s, model: name } });
  },

  loadModels: async () => {
    if (get().modelsLoaded) return;
    try {
      const models = await horde.getImageModels();
      set({ models, modelsLoaded: true });
    } catch {
      set({ modelsLoaded: true }); // graceful: "Any model"
    }
  },

  canStart: () => {
    const s = get().session;
    if (!s || s.pipeline.length === 0) return false;
    const first = getStage(s.pipeline[0].stageId);
    if (!first) return false;
    // First stage must either generate from scratch or have a source image.
    if (first.input === "image" && !s.sourceImageB64) return false;
    // Mask-only stages can't run yet (no Mask Painter until Milestone 3).
    if (s.pipeline.some((p) => getStage(p.stageId)?.needsMask)) return false;
    return true;
  },

  beginRun: () => {
    const s = get().session;
    if (!s || !get().canStart()) return;
    const def = getStage(s.pipeline[0].stageId)!;
    set({
      view: "runner",
      phase: "panel",
      session: { ...s, pointer: 0, frames: [] },
      currentValues: { ...s.pipeline[0].values, ...defaultsFor(def.params) },
      attempts: [],
      pending: null,
      error: null,
    });
  },

  setValue: (key, value) => set((st) => ({ currentValues: { ...st.currentValues, [key]: value } })),

  carve: async () => {
    const s = get().session;
    if (!s) return;
    const def = currentStageDef(s);
    if (!def) return;

    // Resolve the input image: previous accepted frame, or the source image.
    let inputImageB64: string | undefined;
    if (s.pointer > 0) {
      const prev = s.frames[s.pointer - 1];
      const blob = prev ? await getBlob(prev.blobKey) : undefined;
      if (blob) inputImageB64 = await blobToBase64(blob);
    } else if (def.input === "image") {
      inputImageB64 = s.sourceImageB64;
    }

    const payload = def.buildPayload(get().currentValues, {
      inputImageB64,
      houseStyle: DEFAULT_HOUSE_STYLE,
      model: s.model,
      lockedSeed: s.lockedSeed,
    });

    inflight = new AbortController();
    set({ phase: "queued", progress: null, error: null });
    try {
      const { status, blobs } = await horde.generate(payload, {
        signal: inflight.signal,
        onSubmitted: (r) => set({ kudos: r.kudos ?? null }),
        onProgress: (p) => set({ progress: p }),
      });
      const blob = blobs[0];
      const seed = status.generations[0]?.seed ?? s.lockedSeed;
      const attemptIndex = get().attempts.length;
      const blobKey = `${s.id}/${s.pointer}-${attemptIndex}`;
      if (blob) await putBlob(blobKey, blob);
      const attempt: Attempt = { blobKey, seed };
      set((st) => ({ phase: "judging", pending: attempt, attempts: [...st.attempts, attempt] }));
    } catch (e) {
      if (e instanceof HordeUserError && e.kind === "aborted") {
        set({ phase: "panel", progress: null });
        return;
      }
      set({ phase: "error", error: e instanceof Error ? e.message : String(e) });
    } finally {
      inflight = null;
    }
  },

  stopCarve: () => inflight?.abort(),

  accept: async () => {
    const s = get().session;
    const pending = get().pending;
    if (!s || !pending) return;
    const def = currentStageDef(s)!;
    const frame: Frame = {
      stepIndex: s.pointer,
      stageId: def.id,
      stageName: def.name,
      blobKey: pending.blobKey,
      seed: pending.seed,
    };
    const frames = [...s.frames.slice(0, s.pointer), frame];
    const nextPointer = s.pointer + 1;
    const next = { ...s, frames, pointer: nextPointer };
    set({ session: next });

    // Persist a lightweight session record for the Home recents row.
    void saveSession({
      id: s.id,
      createdAt: s.createdAt,
      updatedAt: Date.now(),
      title: s.title,
      thumbKey: frame.blobKey,
      frameCount: frames.length,
    });

    if (nextPointer >= s.pipeline.length) {
      set({ phase: "done", pending: null, attempts: [] });
      return;
    }
    const nextDef = getStage(s.pipeline[nextPointer].stageId)!;
    set({
      phase: "panel",
      pending: null,
      attempts: [],
      currentValues: { ...s.pipeline[nextPointer].values, ...defaultsFor(nextDef.params) },
    });
  },

  retry: () => {
    // Keep attempts in the rail; reopen the panel with values preserved.
    set({ phase: "panel", pending: null });
  },

  undo: () => {
    const s = get().session;
    if (!s) return;
    // Discard the current output; step back to the previous judgement if any.
    if (s.pointer > 0 && s.frames.length >= s.pointer) {
      const prevFrame = s.frames[s.pointer - 1];
      const frames = s.frames.slice(0, s.pointer - 1);
      set({
        session: { ...s, frames, pointer: s.pointer - 1 },
        phase: "judging",
        pending: prevFrame ? { blobKey: prevFrame.blobKey, seed: prevFrame.seed } : null,
        attempts: prevFrame ? [{ blobKey: prevFrame.blobKey, seed: prevFrame.seed }] : [],
      });
    } else {
      set({ phase: "panel", pending: null });
    }
  },

  stopRun: () => {
    inflight?.abort();
    set({ phase: "done", pending: null });
  },
}));
