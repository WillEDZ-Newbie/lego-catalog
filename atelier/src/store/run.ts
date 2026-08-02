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
  type ParamValue,
  type Preset,
  type StageDef,
  defaultsFor,
  getStage,
} from "@/stages";
import { useProject } from "@/store/project";
import { blobToBase64, encodeForHorde } from "@/lib/image";
import { getBlob, putBlob, saveSession } from "@/lib/db";
import type { Recipe } from "@/lib/export";

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
  /** Painted inpainting mask for the current step (bare base64). */
  maskB64: string | null;

  models: HordeActiveModel[];
  modelsLoaded: boolean;

  // navigation
  goHome: () => void;
  newFromPrompt: () => void;
  newFromImage: (file: Blob) => Promise<void>;
  /** Start a session pre-filled from a preset (does not require an image yet). */
  startPreset: (preset: Preset) => void;
  /** Start a session from an imported recipe. */
  startRecipe: (recipe: Recipe) => void;

  // builder
  addStage: (stageId: string) => void;
  /** Set or replace the source image on the current session. */
  setSourceImage: (file: Blob) => Promise<void>;
  /** Save the current pipeline as a named preset (in the project). */
  saveAsPreset: (name: string) => void;
  /** Serialise the current session to a Recipe. */
  toRecipe: () => Recipe | null;
  removeStage: (instanceId: string) => void;
  moveStage: (instanceId: string, dir: -1 | 1) => void;
  setModel: (name: string | undefined) => void;
  loadModels: () => Promise<void>;
  canStart: () => boolean;
  beginRun: () => void;

  // runner
  setValue: (key: string, value: ParamValue) => void;
  setMask: (maskB64: string | null) => void;
  recallSeed: (seed: string) => void;
  /** Ghost Strip: render a small preview of the current stage at a given strength. */
  previewStrength: (strength: number, signal: AbortSignal) => Promise<Blob>;
  /** Resolve the current step's input image (previous frame or source) as base64. */
  resolveInput: () => Promise<string | undefined>;
  carve: () => Promise<void>;
  stopCarve: () => void;
  accept: () => Promise<void>;
  retry: () => void;
  undo: () => void;
  stopRun: () => void;
  /** Fork a new session from an accepted frame, keeping everything up to it. */
  forkFrom: (frameIndex: number) => void;
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
    model: useProject.getState().defaultModel,
    lockedSeed: String(Math.floor(1_000_000 + (performance.now() % 1) * 8_000_000)),
    frames: [],
    pointer: 0,
  };
}

/** Instantiate preset stages into pipeline instances with merged defaults. */
function stagesFromPreset(preset: Preset): PipelineStage[] {
  return preset.stages
    .map((ps) => {
      const def = getStage(ps.stageId);
      if (!def) return null;
      return {
        instanceId: makeId("stg"),
        stageId: ps.stageId,
        values: { ...defaultsFor(def.params), ...(ps.values ?? {}) },
      } satisfies PipelineStage;
    })
    .filter((x): x is PipelineStage => x !== null);
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
  maskB64: null,
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

  startPreset: (preset) => {
    const s = freshSession();
    s.pipeline = stagesFromPreset(preset);
    s.title = preset.name;
    set({ view: "builder", session: s, error: null });
    void get().loadModels();
  },

  startRecipe: (recipe) => {
    const s = freshSession();
    s.pipeline = stagesFromPreset({
      id: "recipe",
      name: "Recipe",
      blurb: "",
      from: recipe.from,
      stages: recipe.stages,
    });
    if (recipe.model) s.model = recipe.model;
    s.title = "From a recipe";
    if (recipe.houseStyle) useProject.getState().setHouseStyle(recipe.houseStyle);
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

  setSourceImage: async (file) => {
    const s = get().session;
    if (!s) return;
    const enc = await encodeForHorde(file);
    await putBlob(`${s.id}/source`, enc.blob);
    set({ session: { ...s, sourceImageB64: enc.b64 } });
  },

  saveAsPreset: (name) => {
    const s = get().session;
    if (!s || s.pipeline.length === 0) return;
    useProject.getState().addPreset({
      id: makeId("preset"),
      name: name.trim() || "My preset",
      blurb: "Saved pipeline.",
      from: s.sourceImageB64 ? "image" : "prompt",
      stages: s.pipeline.map((p) => ({ stageId: p.stageId, values: p.values })),
    });
  },

  toRecipe: () => {
    const s = get().session;
    if (!s) return null;
    return {
      app: "atelier",
      version: 1,
      from: s.sourceImageB64 ? "image" : "prompt",
      model: s.model,
      houseStyle: useProject.getState().houseStyle,
      stages: s.pipeline.map((p) => ({ stageId: p.stageId, values: p.values })),
    };
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
      maskB64: null,
      error: null,
    });
  },

  setValue: (key, value) => set((st) => ({ currentValues: { ...st.currentValues, [key]: value } })),

  setMask: (maskB64) => set({ maskB64 }),

  recallSeed: (seed) => {
    const s = get().session;
    if (!s) return;
    set({
      session: { ...s, lockedSeed: seed },
      currentValues: { ...get().currentValues, keepArtist: true },
    });
  },

  resolveInput: async () => {
    const s = get().session;
    if (!s) return undefined;
    const def = currentStageDef(s);
    if (s.pointer > 0) {
      const prev = s.frames[s.pointer - 1];
      const blob = prev ? await getBlob(prev.blobKey) : undefined;
      return blob ? blobToBase64(blob) : undefined;
    }
    return def?.input === "image" ? s.sourceImageB64 : undefined;
  },

  previewStrength: async (strength, signal) => {
    const s = get().session;
    if (!s) throw new Error("No session");
    const def = currentStageDef(s);
    if (!def) throw new Error("No stage");
    const inputImageB64 = await get().resolveInput();
    const base = def.buildPayload(get().currentValues, {
      inputImageB64,
      maskB64: get().maskB64 ?? undefined,
      houseStyle: useProject.getState().houseStyle,
      model: s.model,
      lockedSeed: s.lockedSeed,
    });
    // Small, cheap preview: fixed strength, low steps/size, single image, no post.
    const preview = {
      ...base,
      params: {
        ...base.params,
        denoising_strength: strength,
        steps: 8,
        n: 1,
        width: 384,
        height: 384,
        post_processing: undefined,
        seed: s.lockedSeed, // stable across the strip so only strength varies
      },
    };
    const { blobs } = await horde.generate(preview, { signal });
    if (!blobs[0]) throw new Error("No preview produced");
    return blobs[0];
  },

  carve: async () => {
    const s = get().session;
    if (!s) return;
    const def = currentStageDef(s);
    if (!def) return;

    // Mask-based stages need a painted mask before they can run.
    if (def.needsMask && !get().maskB64) {
      set({ phase: "error", error: "Paint the area to work on first." });
      return;
    }

    const inputImageB64 = await get().resolveInput();
    const payload = def.buildPayload(get().currentValues, {
      inputImageB64,
      maskB64: get().maskB64 ?? undefined,
      houseStyle: useProject.getState().houseStyle,
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
      set({ phase: "done", pending: null, attempts: [], maskB64: null });
      return;
    }
    const nextDef = getStage(s.pipeline[nextPointer].stageId)!;
    set({
      phase: "panel",
      pending: null,
      attempts: [],
      maskB64: null, // mask is per-step
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

  forkFrom: (frameIndex) => {
    const s = get().session;
    if (!s || frameIndex < 0 || frameIndex >= s.frames.length) return;
    inflight?.abort();
    // Keep frames 0..frameIndex; the new session references the SAME blobs
    // (immutable in IndexedDB) — we never copy image data.
    const kept = s.frames.slice(0, frameIndex + 1);
    const newId = makeId("session");
    const pointer = frameIndex + 1;
    const beyond = pointer >= s.pipeline.length;
    const nextDef = beyond ? undefined : getStage(s.pipeline[pointer].stageId);
    const forked: Session = {
      ...s,
      id: newId,
      createdAt: Date.now(),
      title: `${s.title} (fork)`,
      frames: kept,
      pointer,
    };
    set({
      session: forked,
      view: "runner",
      phase: beyond ? "done" : "panel",
      pending: null,
      attempts: [],
      maskB64: null,
      error: null,
      currentValues: nextDef
        ? { ...s.pipeline[pointer].values, ...defaultsFor(nextDef.params) }
        : {},
    });
    void saveSession({
      id: newId,
      createdAt: forked.createdAt,
      updatedAt: Date.now(),
      title: forked.title,
      thumbKey: kept[kept.length - 1]?.blobKey,
      frameCount: kept.length,
    });
  },
}));
