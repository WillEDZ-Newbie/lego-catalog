/**
 * Export & share. "Save image" uses the iPad share sheet (navigator.share with
 * a file) when available, otherwise downloads. "Save recipe" writes the pipeline
 * JSON — re-importable and shareable as a small file.
 */
import type { HouseStyle, ParamValue } from "@/stages";

export interface Recipe {
  app: "atelier";
  version: 1;
  from: "image" | "prompt";
  model?: string;
  houseStyle?: HouseStyle;
  stages: Array<{ stageId: string; values: Record<string, ParamValue> }>;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Share or download an image blob. */
export async function saveImage(blob: Blob, filename = "atelier.webp"): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || "image/webp" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "ATELIER" });
      return;
    } catch {
      // user cancelled or share failed — fall through to download
    }
  }
  triggerDownload(blob, filename);
}

export function saveRecipe(recipe: Recipe, filename = "recipe.atelier.json"): void {
  triggerDownload(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }), filename);
}

export function parseRecipe(text: string): Recipe {
  const r = JSON.parse(text) as Recipe;
  if (r.app !== "atelier" || !Array.isArray(r.stages)) throw new Error("Not an ATELIER recipe.");
  return r;
}
