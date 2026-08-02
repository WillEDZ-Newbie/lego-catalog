/**
 * AI Horde free-tier guard.
 *
 * The Horde lets anyone run small jobs without pre-existing kudos, but jobs
 * *over 576×576 or over 50 steps* (fewer for some samplers) require the client
 * to already hold the kudos. Anonymous users have zero, so those jobs are
 * rejected outright. To keep the app usable for free, we clamp requests to the
 * free tier whenever the user has no registered key.
 *
 * Source: the rejection message from POST /v2/generate/async and the AI-Horde
 * kudos rules (second-order samplers cost double steps, so their free limit is
 * halved; LCM is capped low).
 */
import type { HordeGenerationInput } from "./types";

/** Largest side (and, since it's square, largest area) allowed free. */
export const FREE_MAX_EDGE = 576;
export const FREE_MAX_STEPS = 50;

const SECOND_ORDER = new Set([
  "k_heun",
  "k_dpm_2",
  "k_dpm_2_a",
  "k_dpmpp_2s_a",
  "k_dpmpp_sde",
]);

/** Free step ceiling for a given sampler. */
export function freeStepLimit(sampler?: string): number {
  if (sampler === "lcm") return 10;
  if (sampler && SECOND_ORDER.has(sampler)) return FREE_MAX_STEPS / 2; // 25
  return FREE_MAX_STEPS;
}

const snap64 = (n: number) => Math.max(64, Math.min(FREE_MAX_EDGE, Math.floor(n / 64) * 64));

/**
 * Return a copy of the request clamped to the free tier. Only touches fields
 * that can push a job over the threshold: width/height (txt2img) and steps.
 * img2img/inpainting size is governed by the source image, which we cap
 * separately at upload time.
 */
export function clampToFreeTier(input: HordeGenerationInput): HordeGenerationInput {
  const p = { ...(input.params ?? {}) };
  const stepLimit = freeStepLimit(p.sampler_name);
  if (typeof p.steps === "number" && p.steps > stepLimit) p.steps = stepLimit;
  if (typeof p.width === "number") p.width = snap64(p.width);
  if (typeof p.height === "number") p.height = snap64(p.height);
  return { ...input, params: p };
}

/** True if a rejection looks like the "needs kudos" gate. */
export function isKudosError(message: string): boolean {
  return /kudos/i.test(message);
}
