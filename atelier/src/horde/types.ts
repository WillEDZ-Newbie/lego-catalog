/**
 * AI Horde v2 API types.
 *
 * SOURCE OF TRUTH: https://stablehorde.net/api/swagger.json
 * (human-readable at https://stablehorde.net/api).
 *
 * ── Provenance ────────────────────────────────────────────────────────────
 * The live swagger endpoint is blocked from the build environment (org egress
 * policy denies stablehorde.net / aihorde.net). However, the swagger is
 * *generated* from the open-source AI-Horde server, which IS reachable via
 * raw.githubusercontent.com. These types were therefore reconciled directly
 * against the generator source at:
 *   Haidra-Org/AI-Horde @ main
 *     · horde/apis/models/stable_v2.py  (the flask-restx models → swagger)
 *     · horde/consts.py                 (KNOWN_SAMPLERS / KNOWN_POST_PROCESSORS)
 * pinned observation: HORDE_VERSION 5.1.3, HORDE_API_VERSION "2.5".
 *
 * Every enum and numeric bound below is CONFIRMED against that source. The one
 * genuinely dynamic value — the *model list* — is not hard-coded here; it comes
 * from GET /v2/status/models at runtime. Re-run the reconciliation (or point at
 * a freshly fetched swagger.json) when bumping to a newer Horde release.
 */

/* -------------------------------------------------------------------------- */
/*  Enumerations — CONFIRMED against AI-Horde stable_v2.py / consts.py.        */
/* -------------------------------------------------------------------------- */

/** CONFIRMED: `KNOWN_SAMPLERS`. API default is `k_euler_a`. */
export const SAMPLERS = [
  "k_lms",
  "k_heun",
  "k_euler",
  "k_euler_a",
  "k_dpm_2",
  "k_dpm_2_a",
  "k_dpm_fast",
  "k_dpm_adaptive",
  "k_dpmpp_2s_a",
  "k_dpmpp_2m",
  "dpmsolver",
  "k_dpmpp_sde",
  "DDIM",
  "lcm",
] as const;
export type Sampler = (typeof SAMPLERS)[number];
export const DEFAULT_SAMPLER: Sampler = "k_euler_a";

/**
 * CONFIRMED: keys of `KNOWN_POST_PROCESSORS`. Order preserved from source.
 * Note the plurals the API actually uses: `CodeFormers` (not "CodeFormer"),
 * `GFPGAN` (+ newer `GFPGANv1.3`). The brief's "CodeFormer" == `CodeFormers`.
 */
export const POST_PROCESSORS = [
  "GFPGAN",
  "RealESRGAN_x4plus",
  "RealESRGAN_x2plus",
  "RealESRGAN_x4plus_anime_6B",
  "NMKD_Siax",
  "4x_AnimeSharp",
  "CodeFormers",
  "strip_background",
  // modern permissively-licensed upscalers
  "4xNomos8kSC",
  "4xLSDIRplus",
  "4xNomosWebPhoto_RealPLKSR",
  "4xNomos2_realplksr_dysample",
  "4xNomos2_hq_dat2",
  "2xModernSpanimationV1",
  // modern permissively-licensed face restorers
  "GFPGANv1.3",
  "RestoreFormer",
] as const;
export type PostProcessor = (typeof POST_PROCESSORS)[number];

/** CONFIRMED: `KNOWN_UPSCALERS` — the subset used by the Upscale (finish) stage. */
export const UPSCALERS = [
  "RealESRGAN_x4plus",
  "RealESRGAN_x2plus",
  "RealESRGAN_x4plus_anime_6B",
  "NMKD_Siax",
  "4x_AnimeSharp",
  "4xNomos8kSC",
  "4xLSDIRplus",
  "4xNomosWebPhoto_RealPLKSR",
  "4xNomos2_realplksr_dysample",
  "4xNomos2_hq_dat2",
  "2xModernSpanimationV1",
] as const;
export type Upscaler = (typeof UPSCALERS)[number];

/** CONFIRMED: face-restorer post-processors (for the "Face fix" finish stage). */
export const FACE_FIXERS = ["GFPGAN", "GFPGANv1.3", "CodeFormers", "RestoreFormer"] as const;

/** CONFIRMED: `control_type` enum. Drives the "See-It Picker". */
export const CONTROL_TYPES = [
  "canny",
  "hed",
  "depth",
  "normal",
  "openpose",
  "seg",
  "scribble",
  "fakescribbles",
  "hough",
] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

/** CONFIRMED: `source_processing` enum. API default is `img2img`. */
export const SOURCE_PROCESSING = [
  "img2img",
  "inpainting",
  "outpainting",
  "remix",
] as const;
export type SourceProcessing = (typeof SOURCE_PROCESSING)[number];

/** CONFIRMED: `KNOWN_WORKFLOWS`. Advanced-only in this app. */
export const WORKFLOWS = ["qr_code"] as const;
export type Workflow = (typeof WORKFLOWS)[number];

/* -------------------------------------------------------------------------- */
/*  Numeric bounds & defaults — CONFIRMED from the field declarations.        */
/*  These are what the artist-facing sliders should clamp to; do NOT invent    */
/*  ranges the spec already defines.                                           */
/* -------------------------------------------------------------------------- */

export const LIMITS = {
  /** cfg_scale → "Interpretation" slider. Spec default 7.5. */
  cfgScale: { min: 0, max: 100, default: 7.5 },
  /** denoising_strength → Ghost Strip. */
  denoise: { min: 0.01, max: 1.0, example: 0.75 },
  hiresFixDenoise: { min: 0.01, max: 1.0, example: 0.75 },
  /** steps → "Effort" slider. */
  steps: { min: 1, max: 500, default: 30 },
  /** width/height — must be multiples of 64. */
  width: { min: 64, max: 3072, multiple: 64, default: 512 },
  height: { min: 64, max: 3072, multiple: 64, default: 512 },
  /** n → batch size (Ghost Strip uses 5). */
  n: { min: 1, max: 20, default: 1 },
  clipSkip: { min: 1, max: 12, example: 1 },
  facefixerStrength: { min: 0, max: 1.0, example: 0.75 },
  seedVariation: { min: 1, max: 1000, example: 1 },
} as const;

/* -------------------------------------------------------------------------- */
/*  Request payloads.                                                         */
/* -------------------------------------------------------------------------- */

/** One LoRA entry (`ModelPayloadLorasStable`). Advanced-only; pasted by name. */
export interface HordeLora {
  name: string;
  model?: number;
  clip?: number;
  inject_trigger?: string;
  is_version?: boolean;
}

/** One textual-inversion entry (`ModelPayloadTextualInversionsStable`). */
export interface HordeTextualInversion {
  name: string;
  inject_ti?: "prompt" | "negprompt";
  strength?: number;
}

/**
 * `ModelGenerationInputStable` — the `params` object of a generation request.
 * Fields the artist UI never exposes directly still live here; the Advanced
 * drawer is auto-generated from the spec for anything not explicitly mapped.
 */
export interface HordeModelParams {
  /** CONFIRMED enum. Default `k_euler_a`. */
  sampler_name?: Sampler;
  /** cfg_scale — artist "Interpretation" slider. See LIMITS.cfgScale. */
  cfg_scale?: number;
  /** denoising_strength — the Ghost Strip. See LIMITS.denoise. */
  denoising_strength?: number;
  hires_fix_denoising_strength?: number;
  /** Seed is a *string* in the Horde API (text or numbers). The Artist Lock. */
  seed?: string;
  /** Increment applied to the seed per image when n>1. See LIMITS.seedVariation. */
  seed_variation?: number;
  /** Multiple of 64. See LIMITS.height. */
  height?: number;
  /** Multiple of 64. See LIMITS.width. */
  width?: number;
  /** steps — "Effort" slider. See LIMITS.steps. */
  steps?: number;
  /** n — batch size. Ghost Strip uses 5. See LIMITS.n. */
  n?: number;
  karras?: boolean;
  hires_fix?: boolean;
  clip_skip?: number;
  tiling?: boolean;
  /** Layer-Diffuse transparent background. */
  transparent?: boolean;
  /** Ordered, unique list of post-processors (upscale / face-fix). */
  post_processing?: PostProcessor[];
  facefixer_strength?: number;
  /** ControlNet type when a structure-lock stage is active. */
  control_type?: ControlType;
  /** If true the source IS a pre-made control map; we send `false` per the brief. */
  image_is_control?: boolean;
  /** Return the ControlNet map instead of an image (used by the See-It preview). */
  return_control_map?: boolean;
  loras?: HordeLora[];
  tis?: HordeTextualInversion[];
  workflow?: Workflow;
}

/** `GenerationInputStable` — the body of POST /v2/generate/async. */
export interface HordeGenerationInput {
  prompt: string;
  params?: HordeModelParams;
  nsfw?: boolean;
  trusted_workers?: boolean;
  slow_workers?: boolean;
  censor_nsfw?: boolean;
  /** Model names, from /v2/status/models. */
  models?: string[];
  /** Base64 (no data: prefix) source image for img2img / inpainting. */
  source_image?: string;
  source_processing?: SourceProcessing;
  /** Base64 B/W mask for inpainting (from the Mask Painter). */
  source_mask?: string;
  /** ALWAYS true — download finished images from R2 rather than inline b64. */
  r2?: boolean;
  shared?: boolean;
  replacement_filter?: boolean;
  dry_run?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Responses.                                                                */
/* -------------------------------------------------------------------------- */

/** POST /v2/generate/async → 202 */
export interface HordeAsyncResponse {
  id: string;
  /** Up-front kudos cost — drive the plain-language cost line from this. */
  kudos?: number;
  message?: string;
  warnings?: Array<{ code: string; message: string }>;
}

/** GET /v2/generate/check/{id} — lightweight, cached 1s server-side. */
export interface HordeCheck {
  finished: number;
  processing: number;
  restarted: number;
  waiting: number;
  done: boolean;
  faulted: boolean;
  /** Estimated seconds remaining. Drives the "about two minutes" ETA. */
  wait_time: number;
  queue_position: number;
  kudos: number;
  is_possible: boolean;
}

/** One produced image within a status response. */
export interface HordeGeneration {
  /** With `r2:true` this is an R2 URL; otherwise base64. See `imgIsUrl`. */
  img: string;
  seed: string;
  id: string;
  censored?: boolean;
  worker_id?: string;
  worker_name?: string;
  model?: string;
  state?: string;
}

/** GET /v2/generate/status/{id} — the full result. */
export interface HordeStatus extends HordeCheck {
  generations: HordeGeneration[];
  shared?: boolean;
}

/** One entry of GET /v2/status/models (type=image). */
export interface HordeActiveModel {
  name: string;
  count: number; // worker count — sort key for the Model picker
  performance?: number;
  queued?: number;
  jobs?: number;
  eta?: number;
  type?: "image" | "text";
}

/** Standard Horde error envelope. */
export interface HordeError {
  message: string;
  rc?: string;
}
