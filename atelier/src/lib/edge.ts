/**
 * Client-side edge preview for the See-It Picker's "Follow the outlines" card.
 * A small Sobel pass on a downscaled copy — this is a *preview*, not the real
 * ControlNet preprocessor, so approximate is fine (per the brief).
 */
export async function edgePreview(sourceB64: string, size = 256): Promise<string> {
  const img = await loadImage(`data:image/webp;base64,${sourceB64}`).catch(() =>
    loadImage(`data:image/png;base64,${sourceB64}`),
  );
  const scale = Math.min(1, size / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const src = document.createElement("canvas");
  src.width = w;
  src.height = h;
  const sctx = src.getContext("2d")!;
  sctx.drawImage(img, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data;

  // grayscale buffer
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const octx = out.getContext("2d")!;
  const outImg = octx.createImageData(w, h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const gx =
        -gray[(y - 1) * w + x - 1] - 2 * gray[y * w + x - 1] - gray[(y + 1) * w + x - 1] +
        gray[(y - 1) * w + x + 1] + 2 * gray[y * w + x + 1] + gray[(y + 1) * w + x + 1];
      const gy =
        -gray[(y - 1) * w + x - 1] - 2 * gray[(y - 1) * w + x] - gray[(y - 1) * w + x + 1] +
        gray[(y + 1) * w + x - 1] + 2 * gray[(y + 1) * w + x] + gray[(y + 1) * w + x + 1];
      const mag = Math.min(255, Math.hypot(gx, gy));
      const o = (y * w + x) * 4;
      // bronze-tinted edges on the dark ground, to sit in the design system
      const v = mag > 60 ? mag : 0;
      outImg.data[o] = v * 0.43;
      outImg.data[o + 1] = v * 0.5;
      outImg.data[o + 2] = v * 0.36;
      outImg.data[o + 3] = 255;
    }
  }
  octx.putImageData(outImg, 0, 0);
  return out.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}
