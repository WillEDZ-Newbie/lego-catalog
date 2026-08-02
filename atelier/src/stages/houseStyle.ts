/**
 * The House Style — a per-project locked base layer (material, finish,
 * lighting, camera, era) composed into every stage's prompt. This is what makes
 * "the same artist" show up every time (together with seed locking).
 *
 * Editing UI arrives in Milestone 5 (Project Settings); Milestone 2 uses the
 * default below as a read-only base layer.
 */
export interface HouseStyle {
  material: string;
  finish: string;
  lighting: string;
  camera: string;
  era: string;
}

export const DEFAULT_HOUSE_STYLE: HouseStyle = {
  material: "carved Pentelic marble",
  finish: "hand-polished stone, subtle translucency",
  lighting: "soft raking museum light",
  camera: "medium format, shallow depth of field",
  era: "in the classical tradition, in the manner of Canova",
};

/** Compose the house style into a single positive base clause. */
export function composeHouseStyle(h: HouseStyle): string {
  return [h.material, h.finish, h.lighting, h.camera, h.era]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}
