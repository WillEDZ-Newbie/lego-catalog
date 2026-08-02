/**
 * Prompt blocks for the material / surface / repair stages.
 *
 * Sculptural-realism rules (CLAUDE.md): POSITIVE descriptions only in the
 * positive prompt ("eyes carved as smooth blank convex forms…"), never
 * negations like "no eyelashes". Negations go in the Horde negative prompt,
 * which we attach with the `###` separator the Horde understands:
 *   "<positive> ### <negative>"
 */

/** Join a positive prompt with an optional negative using Horde's `###`. */
export function withNegative(positive: string, negative?: string): string {
  const pos = positive.replace(/\s+/g, " ").trim();
  const neg = (negative ?? "").replace(/\s+/g, " ").trim();
  return neg ? `${pos} ### ${neg}` : pos;
}

/** Negative shared by stone stages — the things generators wrongly add. */
export const STONE_NEGATIVE =
  "eyelashes, eyebrows, painted eyes, glossy wet eyes, incised pupils, " +
  "iris detail, individual hair strands, skin pores, photorealistic skin, " +
  "makeup, colour paint, plastic, cloth texture";

/** Positive block per material/surface stage id. */
export const PROMPT_BLOCKS: Record<string, string> = {
  "marble-pass":
    "carved from a single block of white marble, smooth polished stone surface, " +
    "eyes carved as smooth blank convex forms in the classical Greek style, " +
    "brow ridge a single unbroken sweep of polished stone",
  "bronze-pass":
    "cast in patinated bronze, warm metallic sheen, subtle verdigris in the recesses, " +
    "eyes as smooth blank cast forms, unbroken brow",
  "weathering-pass":
    "aged and weathered stone, gentle erosion, soft patina, hairline age-cracks, " +
    "surface softened by centuries",
  "polish-pass":
    "highly polished marble, subsurface glow, silken stone surface, crisp carved edges",
  "toolmark-pass":
    "visible chisel marks and rasp texture, tooled stone surface, marks of the sculptor's hand",
};

/** Positive/negative for the hero Eye-repair inpainting stage. */
export const EYE_REPAIR_POSITIVE =
  "smooth blank convex carved eyes in unbroken marble, classical Greek eye form, " +
  "brow ridge a single unbroken sweep of polished stone";
export const EYE_REPAIR_NEGATIVE = STONE_NEGATIVE;
