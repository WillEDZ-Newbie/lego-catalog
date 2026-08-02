/**
 * Image helpers. The Horde wants a base64 image (no data: prefix) for
 * source_image / source_mask. We keep memory discipline: decode via
 * createImageBitmap, downscale onto a canvas, and hand back a compact webp.
 */
import { LIMITS } from "@/horde";

/** Round down to the nearest allowed multiple of 64, clamped to Horde bounds. */
export function snapDimension(n: number, max: number = LIMITS.width.max): number {
  const clamped = Math.max(LIMITS.width.min, Math.min(max, Math.round(n)));
  return Math.max(64, Math.floor(clamped / 64) * 64);
}

/** Strip the "data:...;base64," prefix the Horde does not want. */
export function stripDataUrl(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

/** Blob → bare base64 string (no prefix). */
export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl: string = await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  return stripDataUrl(dataUrl);
}

export interface EncodedImage {
  blob: Blob;
  b64: string;
  width: number;
  height: number;
}

/**
 * Decode an arbitrary image File/Blob, downscale so the long edge is at most
 * `maxEdge`, snap both sides to multiples of 64, and re-encode as webp.
 * Used for user-uploaded source images (iPad photo library, drag-drop).
 */
export async function encodeForHorde(input: Blob, maxEdge = 1024): Promise<EncodedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    throw new Error("That image couldn't be read. Try a JPEG or PNG.");
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = snapDimension(bitmap.width * scale, maxEdge);
  const height = snapDimension(bitmap.height * scale, maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser couldn't prepare the image.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image encoding failed."))),
      "image/webp",
      0.92,
    ),
  );
  return { blob, b64: await blobToBase64(blob), width, height };
}
