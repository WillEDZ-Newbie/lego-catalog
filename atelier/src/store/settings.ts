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
}

interface SettingsState extends Settings {
  hasRealKey: () => boolean;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { apiKey: ANON_KEY, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    /* ignore corrupt storage */
  }
  return { apiKey: ANON_KEY };
}

function persist(s: Settings) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
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
    const apiKey = key.trim() || ANON_KEY;
    persist({ apiKey });
    set({ apiKey });
  },
  clearApiKey: () => {
    persist({ apiKey: ANON_KEY });
    set({ apiKey: ANON_KEY });
  },
}));
