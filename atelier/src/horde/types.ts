/**
 * AI Horde v2 API types.
 *
 * SOURCE OF TRUTH: https://stablehorde.net/api/swagger.json
 * (human-readable at https://stablehorde.net/api).
 *
 * ⚠️ These types were hand-authored from working knowledge of the Horde v2 API
 * because the live spec was unreachable from the build environment at authoring
 * time. Every enum / literal below that the spec or a live endpoint can supply
 * is tagged `VERIFY:` — regenerate this file from swagger.json (or reconcile the
 * tagged values) the moment the API is reachable. Do NOT let these literals
 * silently drift from the spec.
 *
 * The intended long-term flow (see CLAUDE.md "Before writing code"):
 *   1. fetch swagger.json
 *   2. generate types from it
 *   3. keep only the friendly wrappers (below) hand-written.
 */

/* -------------------------------------------------------------------------- */
/*  Enumerations — VERIFY every member against the live spec.                 */
/* -------------------------------------------------------------------------- */

/** VERIFY against `ModelGenerationInputStable.sampler_name` enum in swagger. */
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
  "k_dpmpp_sde",
  "dpmsolver",
  "lcm",
  "DDIM",
] as const;
export type Sampler = (typeof SAMPLERS)[number];

/** VERIFY: post-processor names. Upscale + face-fix stages depend on these. */
export const POST_PROCESSORS = [
  "GFPGAN",
  "CodeFormers",
  "RealESRGAN_x4plus",
  "RealESRGAN_x4plus_anime_6B",
  "RealESRGAN_x2plus",
  "NMKD_Siax",
  "4x_AnimeSharp",
  "strip_background",
] as const;
export type PostProcessor = (typeof POST_PROCESSORS)[number];

/** VERIFY: ControlNet control_type enum. Drives the "See-It Picker". */
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

/** VERIFY: source_processing enum for img2img / inpainting stages. */
export const SOURCE_PROCESSING = [
  "img2img",
  "inpainting",
  "outpainting",
  "remix",
] as const;
export type SourceProcessing = (typeof SOURCE_PROCESSING)[number];

/* -------------------------------------------------------------------------- */
/*  Request payloads.                                                         */
/* -------------------------------------------------------------------------- */

/**
 * `ModelGenerationInputStable` — the `params` object of a generation request.
 * Fields the artist UI never exposes directly still live here; the Advanced
 * drawer is auto-generated from the spec for anything not explicitly mapped.
 */
export interface HordeModelParams {
  sampler_name?: Sampler;
  /** cfg_scale — surfaced as the artist "Interpretation" slider (Loose↔Literal). VERIFY range. */
  cfg_scale?: number;
  /** denoising_strength — surfaced as the Ghost Strip (Keep↔Reimagine). 0..1. */
  denoising_strength?: number;
  /** Seed is a *string* in the Horde API. Surfaced as the Artist Lock. */
  seed?: string;
  height?: number;
  width?: number;
  /** steps — surfaced as the "Effort" slider (Quick↔Careful). VERIFY max. */
  steps?: number;
  /** n — batch size. Used internally by the Ghost Strip (n:5). VERIFY max. */
  n?: number;
  karras?: boolean;
  hires_fix?: boolean;
  clip_skip?: number;
  tiling?: boolean;
  /** Ordered list of post-processors (upscale / face-fix). */
  post_processing?: PostProcessor[];
  /** ControlNet type when a structure-lock stage is active. */
  control_type?: ControlType;
  /** If true, the source image IS the control map (we send `false` per spec note). */
  image_is_control?: boolean;
  return_control_map?: boolean;
  /** LoRA by name — Advanced only in v1. VERIFY shape (`TeamModelStable`/`ModPayloadStable`). */
  loras?: Array<{ name: string; model?: number; clip?: number; inject_trigger?: string }>;
  facefixer_strength?: number;
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
