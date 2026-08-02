/** Shared HordeClient instance, keyed off the settings store. */
import { HordeClient } from "./client";
import { useSettings } from "@/store/settings";

export const horde = new HordeClient({
  getApiKey: () => useSettings.getState().apiKey,
});
