/**
 * The Stage Registry: pure data + small transform functions, no UI.
 * A pipeline is an ordered array of stage instances with their param values.
 * Presets (Milestone 5) are just saved pipelines.
 */
import type {
  ControlType,
  HordeGenerationInput,
  PostProcessor,
  Sampler,
} from "@/horde";
import { DEFAULT_SAMPLER, LIMITS, SAMPLERS } from "@/horde";
import type { ParamDef, ParamValue } from "./params";
import { type HouseStyle, composeHouseStyle } from "./houseStyle";
import {
  EYE_REPAIR_NEGATIVE,
  EYE_REPAIR_POSITIVE,
  PROMPT_BLOCKS,
  STONE_NEGATIVE,
  withNegative,
} from "./prompts";

export type StageCategory =
  | "generate"
  | "structure"
  | "material"
  | "surface"
  | "repair"
  | "finish";

export const CATEGORY_LABELS: Record<StageCategory, string> = {
  generate: "Start",
  structure: "Lock the composition",
  material: "Give it a material",
  surface: "Work the surface",
  repair: "Repair",
  finish: "Finish",
};

/** Context passed to buildPayload when a stage runs. */
export interface BuildContext {
  /** Previous accepted output (or the source image) as bare base64. */
  inputImageB64?: string;
  /** Painted inpainting mask (bare base64), for stages with `needsMask`. */
  maskB64?: string;
  houseStyle: HouseStyle;
  /** Selected model name, or undefined to let the Horde choose. */
  model?: string;
  /** Stable per-session seed used when the artist locks "same result". */
  lockedSeed: string;
}

export interface StageDef {
  id: string;
  name: string;
  blurb: string;
  category: StageCategory;
  input: "none" | "image";
  params: ParamDef[];
  buildPayload: (values: Record<string, ParamValue>, ctx: BuildContext) => HordeGenerationInput;
  /**
   * Stages that need a painted mask (inpainting). Not runnable until the Mask
   * Painter ships in Milestone 3; the Builder gates these with a note.
   */
  needsMask?: boolean;
}

/* ---- helpers -------------------------------------------------------------- */

const num = (v: ParamValue, fallback: number) => (typeof v === "number" ? v : fallback);
const str = (v: ParamValue) => (typeof v === "string" ? v : "");
const bool = (v: ParamValue) => v === true;

/** Shared "Interpretation" (cfg) + "Effort" (steps) advanced controls. */
const interpretationParam: ParamDef = {
  key: "cfg",
  label: "Interpretation",
  help: "How literally to follow the words.",
  control: "slider",
  default: LIMITS.cfgScale.default,
  min: 1,
  max: 20,
  step: 0.5,
  leftLabel: "Loose",
  rightLabel: "Literal",
  advanced: true,
};

const effortParam: ParamDef = {
  key: "steps",
  label: "Effort",
  help: "More effort is slower but more considered.",
  control: "slider",
  default: 25,
  min: 10,
  max: 60,
  step: 1,
  leftLabel: "Quick",
  rightLabel: "Careful",
  advanced: true,
};

const samplerParam: ParamDef = {
  key: "sampler",
  label: "Method",
  control: "select",
  default: DEFAULT_SAMPLER,
  advanced: true,
  options: SAMPLERS.map((s) => ({ value: s, label: s })),
};

/** Denoise, framed for the artist — rendered as the Ghost Strip (Milestone 3). */
const strengthParam = (def: number): ParamDef => ({
  key: "strength",
  label: "How much to change it",
  control: "ghost-strip",
  default: def,
  min: 0.1,
  max: 0.9,
  step: 0.01,
  leftLabel: "Keep the image",
  rightLabel: "Reimagine it",
});

/** Seed lock, framed for the artist — rendered as the Artist Lock (Milestone 3). */
const keepArtistParam: ParamDef = {
  key: "keepArtist",
  label: "Same artist",
  help: "Keep the same hand and character across steps.",
  control: "artist-lock",
  default: true,
};

function baseParams(values: Record<string, ParamValue>): {
  cfg_scale: number;
  steps: number;
  sampler_name: Sampler;
  karras: boolean;
} {
  return {
    cfg_scale: num(values.cfg, LIMITS.cfgScale.default),
    steps: num(values.steps, 25),
    sampler_name: (str(values.sampler) || DEFAULT_SAMPLER) as Sampler,
    karras: true,
  };
}

function seedFor(values: Record<string, ParamValue>, ctx: BuildContext): string | undefined {
  return bool(values.keepArtist) ? ctx.lockedSeed : undefined;
}

function modelField(ctx: BuildContext): Pick<HordeGenerationInput, "models"> {
  return ctx.model ? { models: [ctx.model] } : {};
}

/** Compose house style + a stage's positive block + optional user notes. */
function composePrompt(ctx: BuildContext, block: string, notes?: string): string {
  return [composeHouseStyle(ctx.houseStyle), block, (notes ?? "").trim()]
    .filter(Boolean)
    .join(", ");
}

/* ---- img2img material / surface stages ----------------------------------- */

function materialStage(
  id: string,
  name: string,
  blurb: string,
  category: StageCategory,
  denoiseDefault: number,
): StageDef {
  return {
    id,
    name,
    blurb,
    category,
    input: "image",
    params: [
      strengthParam(denoiseDefault),
      { key: "notes", label: "Extra notes", control: "text", default: "" },
      keepArtistParam,
      interpretationParam,
      effortParam,
      samplerParam,
    ],
    buildPayload: (values, ctx) => ({
      prompt: withNegative(composePrompt(ctx, PROMPT_BLOCKS[id] ?? "", str(values.notes)), STONE_NEGATIVE),
      source_image: ctx.inputImageB64,
      source_processing: "img2img",
      params: {
        ...baseParams(values),
        denoising_strength: num(values.strength, denoiseDefault),
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  };
}

/* ---- structure (ControlNet) stage ---------------------------------------- */

/**
 * One "Composition lock" stage whose control type is chosen with the See-It
 * Picker (outlines / depth / pose shown as visual cards) — the hero control
 * subsumes what were three separate stages in Milestone 2.
 */
const compLockStage: StageDef = {
  id: "comp-lock",
  name: "Composition lock",
  blurb: "Keep the shape of your image while everything else is re-carved.",
  category: "structure",
  input: "image",
  params: [
    {
      key: "controlType",
      label: "What to follow",
      control: "see-it",
      default: "canny",
      options: [
        { value: "canny", label: "Follow the outlines" },
        { value: "depth", label: "Follow the depth" },
        { value: "openpose", label: "Follow the pose" },
      ],
    },
    { key: "notes", label: "Describe the result", control: "textarea", default: "" },
    strengthParam(0.7),
    keepArtistParam,
    interpretationParam,
    effortParam,
    samplerParam,
  ],
  buildPayload: (values, ctx) => ({
    prompt: withNegative(composePrompt(ctx, "", str(values.notes)), STONE_NEGATIVE),
    source_image: ctx.inputImageB64,
    source_processing: "img2img",
    params: {
      ...baseParams(values),
      denoising_strength: num(values.strength, 0.7),
      control_type: (str(values.controlType) || "canny") as ControlType,
      image_is_control: false,
      seed: seedFor(values, ctx),
    },
    ...modelField(ctx),
  }),
};

/* ---- the registry --------------------------------------------------------- */

export const STAGES: StageDef[] = [
  // generate
  {
    id: "fresh-generation",
    name: "Fresh generation",
    blurb: "Start a brand-new image from a description.",
    category: "generate",
    input: "none",
    params: [
      { key: "notes", label: "Describe the statue", control: "textarea", default: "a standing figure, three-quarter view" },
      // Defaults stay inside the Horde free allowance (<=576) so anonymous
      // users aren't rejected for lacking kudos; larger sizes need a free key.
      { key: "width", label: "Width", control: "select", default: "512", advanced: true,
        options: [
          { value: "512", label: "512px" },
          { value: "576", label: "576px" },
          { value: "640", label: "640px (needs a key)" },
          { value: "768", label: "768px (needs a key)" },
          { value: "1024", label: "1024px (needs a key)" },
        ] },
      { key: "height", label: "Height", control: "select", default: "576", advanced: true,
        options: [
          { value: "512", label: "512px" },
          { value: "576", label: "576px" },
          { value: "640", label: "640px (needs a key)" },
          { value: "768", label: "768px (needs a key)" },
          { value: "1024", label: "1024px (needs a key)" },
        ] },
      keepArtistParam,
      interpretationParam,
      effortParam,
      samplerParam,
    ],
    buildPayload: (values, ctx) => ({
      prompt: withNegative(composePrompt(ctx, "a marble sculpture", str(values.notes)), STONE_NEGATIVE),
      params: {
        ...baseParams(values),
        width: Number(str(values.width) || "512"),
        height: Number(str(values.height) || "576"),
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  },

  // structure
  compLockStage,

  // material
  materialStage("marble-pass", "Marble pass", "Turn it into carved marble.", "material", 0.45),
  materialStage("bronze-pass", "Bronze pass", "Turn it into patinated bronze.", "material", 0.45),
  materialStage("weathering-pass", "Weathering / ageing", "Add erosion, patina and the softness of age.", "material", 0.3),

  // surface
  materialStage("polish-pass", "Polish pass", "Bring up a polished, glowing stone surface.", "surface", 0.22),
  materialStage("toolmark-pass", "Tool-mark texture", "Add chisel and rasp marks — the sculptor's hand.", "surface", 0.28),

  // repair (inpainting — gated until the Mask Painter ships)
  {
    id: "eye-repair",
    name: "Eye repair",
    blurb: "Paint over the eyes to carve smooth, blank classical eyes with no lashes.",
    category: "repair",
    input: "image",
    needsMask: true,
    params: [strengthParam(0.6), interpretationParam, effortParam],
    buildPayload: (values, ctx) => ({
      prompt: withNegative(composePrompt(ctx, EYE_REPAIR_POSITIVE), EYE_REPAIR_NEGATIVE),
      source_image: ctx.inputImageB64,
      source_mask: ctx.maskB64,
      source_processing: "inpainting",
      params: {
        ...baseParams(values),
        denoising_strength: num(values.strength, 0.6),
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  },
  {
    id: "detail-repair",
    name: "Detail repair",
    blurb: "Paint over any area and describe how it should be re-carved.",
    category: "repair",
    input: "image",
    needsMask: true,
    params: [
      { key: "notes", label: "How should it look?", control: "textarea", default: "" },
      strengthParam(0.6),
      interpretationParam,
      effortParam,
    ],
    buildPayload: (values, ctx) => ({
      prompt: withNegative(composePrompt(ctx, "", str(values.notes)), STONE_NEGATIVE),
      source_image: ctx.inputImageB64,
      source_mask: ctx.maskB64,
      source_processing: "inpainting",
      params: {
        ...baseParams(values),
        denoising_strength: num(values.strength, 0.6),
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  },
  {
    id: "background-cleanup",
    name: "Background cleanup",
    blurb: "Paint over the statue; the plain background around it is redrawn.",
    category: "repair",
    input: "image",
    needsMask: true,
    params: [
      { key: "notes", label: "Background", control: "text", default: "a plain neutral studio background" },
      strengthParam(0.7),
      effortParam,
    ],
    buildPayload: (values, ctx) => ({
      prompt: withNegative(composePrompt(ctx, str(values.notes)), STONE_NEGATIVE),
      source_image: ctx.inputImageB64,
      source_mask: ctx.maskB64,
      source_processing: "inpainting",
      params: {
        ...baseParams(values),
        denoising_strength: num(values.strength, 0.7),
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  },

  // finish (post-processors)
  {
    id: "upscale",
    name: "Upscale",
    blurb: "Enlarge and sharpen the image.",
    category: "finish",
    input: "image",
    params: [
      { key: "upscaler", label: "Upscaler", control: "select", default: "RealESRGAN_x4plus",
        options: (["RealESRGAN_x4plus", "RealESRGAN_x2plus", "4xNomos8kSC", "NMKD_Siax"] as PostProcessor[])
          .map((v) => ({ value: v, label: v })) },
    ],
    buildPayload: (values, ctx) => ({
      // Post-processors act on the source image; a minimal prompt is still required.
      prompt: composeHouseStyle(ctx.houseStyle),
      source_image: ctx.inputImageB64,
      source_processing: "img2img",
      params: {
        denoising_strength: 0.1,
        steps: 10,
        post_processing: [(str(values.upscaler) || "RealESRGAN_x4plus") as PostProcessor],
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  },
  {
    id: "face-fix",
    name: "Face fix",
    blurb: "Restore facial features that came out muddy.",
    category: "finish",
    input: "image",
    params: [
      { key: "fixer", label: "Method", control: "select", default: "GFPGAN",
        options: (["GFPGAN", "CodeFormers", "GFPGANv1.3", "RestoreFormer"] as PostProcessor[])
          .map((v) => ({ value: v, label: v })) },
      { key: "strength", label: "Strength", control: "slider", default: 0.5, min: 0, max: 1, step: 0.05,
        leftLabel: "Gentle", rightLabel: "Strong", advanced: true },
    ],
    buildPayload: (values, ctx) => ({
      prompt: composeHouseStyle(ctx.houseStyle),
      source_image: ctx.inputImageB64,
      source_processing: "img2img",
      params: {
        denoising_strength: 0.1,
        steps: 10,
        post_processing: [(str(values.fixer) || "GFPGAN") as PostProcessor],
        facefixer_strength: num(values.strength, 0.5),
        seed: seedFor(values, ctx),
      },
      ...modelField(ctx),
    }),
  },
];

export const STAGES_BY_ID: Record<string, StageDef> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export function getStage(id: string): StageDef | undefined {
  return STAGES_BY_ID[id];
}

/** Category → stages, in registry order, for the Builder tick-list. */
export function stagesByCategory(): Array<{ category: StageCategory; stages: StageDef[] }> {
  const order: StageCategory[] = ["generate", "structure", "material", "surface", "repair", "finish"];
  return order.map((category) => ({ category, stages: STAGES.filter((s) => s.category === category) }));
}
