/**
 * Project store: the House Style, default model, and saved presets. Small text
 * only, so it persists in localStorage. (Binary stays in IndexedDB.)
 *
 * A Project holds what makes "the same artist" show up every time.
 */
import { create } from "zustand";
import { DEFAULT_HOUSE_STYLE, type HouseStyle, type Preset } from "@/stages";

const LS_KEY = "atelier.project.v1";

interface Persisted {
  houseStyle: HouseStyle;
  defaultModel?: string;
  presets: Preset[];
}

interface ProjectState extends Persisted {
  setHouseStyle: (patch: Partial<HouseStyle>) => void;
  setDefaultModel: (name?: string) => void;
  addPreset: (preset: Preset) => void;
  deletePreset: (id: string) => void;
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Persisted>;
      return {
        houseStyle: { ...DEFAULT_HOUSE_STYLE, ...(p.houseStyle ?? {}) },
        defaultModel: p.defaultModel,
        presets: p.presets ?? [],
      };
    }
  } catch {
    /* ignore */
  }
  return { houseStyle: DEFAULT_HOUSE_STYLE, presets: [] };
}

function persist(s: Persisted) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch {
    /* private mode / quota */
  }
}

export const useProject = create<ProjectState>((set, get) => ({
  ...load(),
  setHouseStyle: (patch) => {
    const houseStyle = { ...get().houseStyle, ...patch };
    persist({ houseStyle, defaultModel: get().defaultModel, presets: get().presets });
    set({ houseStyle });
  },
  setDefaultModel: (defaultModel) => {
    persist({ houseStyle: get().houseStyle, defaultModel, presets: get().presets });
    set({ defaultModel });
  },
  addPreset: (preset) => {
    const presets = [...get().presets.filter((p) => p.id !== preset.id), preset];
    persist({ houseStyle: get().houseStyle, defaultModel: get().defaultModel, presets });
    set({ presets });
  },
  deletePreset: (id) => {
    const presets = get().presets.filter((p) => p.id !== id);
    persist({ houseStyle: get().houseStyle, defaultModel: get().defaultModel, presets });
    set({ presets });
  },
}));
