/**
 * Settings: the Horde API key (entered once, stored in localStorage) and the
 * Project's House Style + default model. The House Style is the locked base
 * layer composed into every stage's prompt.
 */
import { useEffect } from "react";
import { ANON_KEY } from "@/horde";
import { useSettings } from "@/store/settings";
import { useProject } from "@/store/project";
import { useRun } from "@/store/run";
import { composeHouseStyle, type HouseStyle } from "@/stages";

const HOUSE_FIELDS: Array<{ key: keyof HouseStyle; label: string }> = [
  { key: "material", label: "Material" },
  { key: "finish", label: "Finish" },
  { key: "lighting", label: "Lighting" },
  { key: "camera", label: "Camera" },
  { key: "era", label: "Era / manner" },
];

export function Settings({ onClose }: { onClose: () => void }) {
  const { apiKey, setApiKey, hasRealKey } = useSettings();
  const { houseStyle, setHouseStyle, defaultModel, setDefaultModel } = useProject();
  const { models, loadModels } = useRun();

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <span className="inscription">Settings</span>
          <button className="ghost-btn" onClick={onClose}>Done</button>
        </header>

        <section className="modal-section">
          <h3 className="section-title">Horde key</h3>
          <input
            className="text-input"
            value={apiKey === ANON_KEY ? "" : apiKey}
            placeholder={`${ANON_KEY} (anonymous)`}
            onChange={(e) => setApiKey(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <p className="control-help">
            {hasRealKey()
              ? "Your key is saved on this device only."
              : "Running anonymously."}{" "}
            <a href="https://stablehorde.net/register" target="_blank" rel="noreferrer">
              A free key
            </a>{" "}
            queues faster.
          </p>
        </section>

        <section className="modal-section">
          <h3 className="section-title">House style</h3>
          <p className="control-help">The locked base layer in every prompt — “the same artist”, every time.</p>
          {HOUSE_FIELDS.map((f) => (
            <label key={f.key} className="control">
              <span className="control-label">{f.label}</span>
              <input
                className="text-input"
                value={houseStyle[f.key]}
                onChange={(e) => setHouseStyle({ [f.key]: e.target.value })}
              />
            </label>
          ))}
          <p className="control-help house-preview">{composeHouseStyle(houseStyle)}</p>
        </section>

        <section className="modal-section">
          <h3 className="section-title">Default model</h3>
          <select
            className="select-input"
            value={defaultModel ?? ""}
            onChange={(e) => setDefaultModel(e.target.value || undefined)}
          >
            <option value="">Any model (let the workshop choose)</option>
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name} · {m.count} workers
              </option>
            ))}
          </select>
        </section>
      </div>
    </div>
  );
}
