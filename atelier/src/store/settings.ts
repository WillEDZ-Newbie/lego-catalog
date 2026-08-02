/**
 * Settings store. Per CLAUDE.md §5: the Horde API key is entered once, stored
 * in localStorage, and sent as the `apikey` header. Anonymous mode is the
 * default (`0000000000`) with a note that registered keys queue faster.
 *
 * localStorage holds ONLY the api key + small settings. All binary data
 * (images, masks, presets) lives in IndexedDB — added in Milestone 2.
 */
import { create } from "zustand";
import { ANON_KEY } from "@/horde";

const LS_KEY = "atelier.settings.v1";

export interface Settings {
  apiKey: string;
  /** Share results to the Horde commons to earn kudos (bigger/faster jobs). */
  shareOutputs: boolean;
}

interface SettingsState extends Settings {
  hasRealKey: () => boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  setShareOutputs: (v: boolean) => void;
}

function load(): Settings {
  const base: Settings = { apiKey: ANON_KEY, shareOutputs: false };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore corrupt storage */
  }
  return base;
}

function persist(get: () => Settings) {
  try {
    const { apiKey, shareOutputs } = get();
    localStorage.setItem(LS_KEY, JSON.stringify({ apiKey, shareOutputs }));
  } catch {
    /* private mode / quota — non-fatal */
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  hasRealKey: () => {
    const k = get().apiKey.trim();
    return k.length > 0 && k !== ANON_KEY;
  },
  setApiKey: (key) => {
    set({ apiKey: key.trim() || ANON_KEY });
    persist(get);
  },
  clearApiKey: () => {
    set({ apiKey: ANON_KEY });
    persist(get);
  },
  setShareOutputs: (shareOutputs) => {
    set({ shareOutputs });
    persist(get);
  },
}));
