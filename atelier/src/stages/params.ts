/**
 * ParamDef — the descriptor that drives an auto-generated control surface.
 *
 * Milestone 2 renders only the basic controls (slider / toggle / text /
 * textarea / select). Milestone 3 swaps specific params (denoise, seed,
 * control_type, prompt, model) for their bespoke hero components; the registry
 * stays the same — only the renderer gets richer.
 */
export type ParamValue = string | number | boolean;

export type ControlKind = "slider" | "toggle" | "text" | "textarea" | "select";

export interface SelectOption {
  value: string;
  label: string;
}

export interface ParamDef {
  key: string;
  /** Artist-facing label. Never API jargon. */
  label: string;
  /** One quiet line of help, optional. */
  help?: string;
  control: ControlKind;
  default: ParamValue;
  /** Lives behind the Advanced disclosure when true. */
  advanced?: boolean;

  // slider
  min?: number;
  max?: number;
  step?: number;
  /** Framing words at each end of a slider, e.g. "Keep the image ↔ Reimagine it". */
  leftLabel?: string;
  rightLabel?: string;

  // select
  options?: SelectOption[];
}

/** Pull default values out of a param list into a plain record. */
export function defaultsFor(params: ParamDef[]): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of params) out[p.key] = p.default;
  return out;
}
