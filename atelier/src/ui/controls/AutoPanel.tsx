/**
 * Auto-generated control surface. Given a stage's ParamDef[] and the current
 * values, render the primary controls plus an Advanced disclosure. Milestone 2
 * renders slider/toggle/text/textarea/select; Milestone 3 swaps specific keys
 * for hero components (Ghost Strip, Artist Lock, See-It Picker, …).
 */
import { useState } from "react";
import type { ParamDef, ParamValue } from "@/stages";
import type { PanelContext } from "./panelContext";
import { GhostStrip } from "../hero/GhostStrip";
import { ArtistLock } from "../hero/ArtistLock";
import { SeeItPicker } from "../hero/SeeItPicker";

interface Props {
  params: ParamDef[];
  values: Record<string, ParamValue>;
  onChange: (key: string, value: ParamValue) => void;
  disabled?: boolean;
  ctx?: PanelContext;
}

export function AutoPanel({ params, values, onChange, disabled, ctx }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const primary = params.filter((p) => !p.advanced);
  const advanced = params.filter((p) => p.advanced);

  return (
    <div className="panel">
      {primary.map((p) => (
        <Control key={p.key} def={p} value={values[p.key]} onChange={onChange} disabled={disabled} ctx={ctx} />
      ))}

      {advanced.length > 0 && (
        <div className="advanced">
          <button
            type="button"
            className="advanced-toggle"
            aria-expanded={showAdvanced}
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide advanced" : "Advanced"}
          </button>
          {showAdvanced && (
            <div className="advanced-body">
              {advanced.map((p) => (
                <Control key={p.key} def={p} value={values[p.key]} onChange={onChange} disabled={disabled} ctx={ctx} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Control({
  def,
  value,
  onChange,
  disabled,
  ctx,
}: {
  def: ParamDef;
  value: ParamValue;
  onChange: (key: string, value: ParamValue) => void;
  disabled?: boolean;
  ctx?: PanelContext;
}) {
  const id = `ctl-${def.key}`;

  // Hero controls (Milestone 3) — need PanelContext; fall back to basics without it.
  if (def.control === "ghost-strip" && ctx) {
    return (
      <div className="control">
        <label className="control-label">
          {def.label}
          {def.help && <span className="control-help">{def.help}</span>}
        </label>
        <GhostStrip def={def} value={Number(value)} onChange={(v) => onChange(def.key, v)} ctx={ctx} />
      </div>
    );
  }
  if (def.control === "artist-lock" && ctx) {
    return (
      <div className="control">
        <ArtistLock def={def} value={value === true} onChange={(v) => onChange(def.key, v)} ctx={ctx} />
      </div>
    );
  }
  if (def.control === "see-it" && ctx) {
    return (
      <div className="control">
        <label className="control-label">{def.label}</label>
        <SeeItPicker def={def} value={String(value ?? "")} onChange={(v) => onChange(def.key, v)} ctx={ctx} />
      </div>
    );
  }

  const kind =
    def.control === "ghost-strip" ? "slider"
    : def.control === "artist-lock" ? "toggle"
    : def.control === "see-it" ? "select"
    : def.control;

  return (
    <div className="control">
      {kind !== "toggle" && (
        <label className="control-label" htmlFor={id}>
          {def.label}
          {def.help && <span className="control-help">{def.help}</span>}
        </label>
      )}

      {kind === "slider" && (
        <div className="slider-wrap">
          <input
            id={id}
            type="range"
            disabled={disabled}
            min={def.min ?? 0}
            max={def.max ?? 1}
            step={def.step ?? 0.01}
            value={Number(value)}
            onChange={(e) => onChange(def.key, Number(e.target.value))}
          />
          <div className="slider-ends">
            <span>{def.leftLabel ?? def.min}</span>
            <span className="tnum">{formatNumber(Number(value))}</span>
            <span>{def.rightLabel ?? def.max}</span>
          </div>
        </div>
      )}

      {kind === "toggle" && (
        <label className="toggle" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            disabled={disabled}
            checked={value === true}
            onChange={(e) => onChange(def.key, e.target.checked)}
          />
          <span className="toggle-track" aria-hidden="true" />
          <span className="toggle-text">
            {def.label}
            {def.help && <span className="control-help">{def.help}</span>}
          </span>
        </label>
      )}

      {kind === "text" && (
        <input
          id={id}
          type="text"
          className="text-input"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.key, e.target.value)}
        />
      )}

      {kind === "textarea" && (
        <textarea
          id={id}
          className="text-input textarea"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.key, e.target.value)}
        />
      )}

      {kind === "select" && (
        <select
          id={id}
          className="select-input"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.key, e.target.value)}
        >
          {def.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
