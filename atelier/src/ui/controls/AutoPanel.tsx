/**
 * Auto-generated control surface. Given a stage's ParamDef[] and the current
 * values, render the primary controls plus an Advanced disclosure. Milestone 2
 * renders slider/toggle/text/textarea/select; Milestone 3 swaps specific keys
 * for hero components (Ghost Strip, Artist Lock, See-It Picker, …).
 */
import { useState } from "react";
import type { ParamDef, ParamValue } from "@/stages";

interface Props {
  params: ParamDef[];
  values: Record<string, ParamValue>;
  onChange: (key: string, value: ParamValue) => void;
  disabled?: boolean;
}

export function AutoPanel({ params, values, onChange, disabled }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const primary = params.filter((p) => !p.advanced);
  const advanced = params.filter((p) => p.advanced);

  return (
    <div className="panel">
      {primary.map((p) => (
        <Control key={p.key} def={p} value={values[p.key]} onChange={onChange} disabled={disabled} />
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
                <Control key={p.key} def={p} value={values[p.key]} onChange={onChange} disabled={disabled} />
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
}: {
  def: ParamDef;
  value: ParamValue;
  onChange: (key: string, value: ParamValue) => void;
  disabled?: boolean;
}) {
  const id = `ctl-${def.key}`;
  return (
    <div className="control">
      {def.control !== "toggle" && (
        <label className="control-label" htmlFor={id}>
          {def.label}
          {def.help && <span className="control-help">{def.help}</span>}
        </label>
      )}

      {def.control === "slider" && (
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

      {def.control === "toggle" && (
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

      {def.control === "text" && (
        <input
          id={id}
          type="text"
          className="text-input"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.key, e.target.value)}
        />
      )}

      {def.control === "textarea" && (
        <textarea
          id={id}
          className="text-input textarea"
          disabled={disabled}
          value={String(value ?? "")}
          onChange={(e) => onChange(def.key, e.target.value)}
        />
      )}

      {def.control === "select" && (
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
