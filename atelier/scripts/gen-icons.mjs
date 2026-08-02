// Rasterise the ATELIER app icon to the PNG sizes the PWA manifest + iOS need.
// Run: npm run gen:icons  (outputs into public/). Committed PNGs mean CI does
// not need sharp at build time.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "..", "public");

// A carved 'A' with a chisel bevel — bronze bar on Pentelic marble, warm
// charcoal ground. Full-bleed background so maskable icons never clip badly.
// Slightly inset glyph keeps it inside the maskable "safe area".
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#1C1A18"/>
  <path d="M150 384 L256 118 L362 384" fill="none" stroke="#EDE8DF"
        stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M198 300 L314 300" stroke="#6E7F5C" stroke-width="34"
        stroke-linecap="round"/>
</svg>`;

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

await mkdir(publicDir, { recursive: true });
for (const { name, size } of targets) {
  await sharp(Buffer.from(svg))
    .resize(size, size)
    .png()
    .toFile(join(publicDir, name));
  console.log(`wrote public/${name} (${size}x${size})`);
}
