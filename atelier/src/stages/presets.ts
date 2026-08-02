/**
 * Presets are just saved pipelines. A preset is an ordered list of stage ids
 * (with optional preset param values) plus how the session starts.
 */
import type { ParamValue } from "./params";

export interface PresetStage {
  stageId: string;
  values?: Record<string, ParamValue>;
}

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  from: "image" | "prompt";
  stages: PresetStage[];
  builtin?: boolean;
}

/** The two flagship presets from the definition of done, plus a from-words one. */
export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "fix-eyes",
    name: "Fix the eyes",
    blurb: "Paint over the eyes and carve them smooth and blank.",
    from: "image",
    builtin: true,
    stages: [{ stageId: "eye-repair" }],
  },
  {
    id: "statue-treatment",
    name: "Statue treatment",
    blurb: "Lock the shape, carve marble, polish, fix the eyes, then enlarge.",
    from: "image",
    builtin: true,
    stages: [
      { stageId: "comp-lock" },
      { stageId: "marble-pass" },
      { stageId: "polish-pass" },
      { stageId: "eye-repair" },
      { stageId: "upscale" },
    ],
  },
  {
    id: "from-words",
    name: "From a description",
    blurb: "Generate a figure, give it marble, and enlarge it.",
    from: "prompt",
    builtin: true,
    stages: [{ stageId: "fresh-generation" }, { stageId: "marble-pass" }, { stageId: "upscale" }],
  },
];
