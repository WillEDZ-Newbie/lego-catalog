/**
 * The See-It Picker (ControlNet type). Not a dropdown: a row of selectable
 * cards. "Follow the outlines" shows a live client-side edge preview of the
 * input image; depth / pose are labelled illustrative cards.
 */
import { useEffect, useState } from "react";
import type { ParamDef } from "@/stages";
import type { PanelContext } from "../controls/panelContext";
import { edgePreview } from "@/lib/edge";

export function SeeItPicker({
  def,
  value,
  onChange,
  ctx,
}: {
  def: ParamDef;
  value: string;
  onChange: (v: string) => void;
  ctx: PanelContext;
}) {
  const [edge, setEdge] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setEdge(null);
    if (ctx.inputImageB64) {
      edgePreview(ctx.inputImageB64)
        .then((url) => live && setEdge(url))
        .catch(() => live && setEdge(null));
    }
    return () => {
      live = false;
    };
  }, [ctx.inputImageB64]);

  return (
    <div className="see-it">
      {(def.options ?? []).map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className={`see-card ${selected ? "selected" : ""}`}
            onClick={() => onChange(opt.value)}
            aria-pressed={selected}
          >
            <span className={`see-preview see-${opt.value}`}>
              {opt.value === "canny" && edge && <img src={edge} alt="" />}
            </span>
            <span className="see-caption">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
