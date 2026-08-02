import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// ATELIER is a 100% static SPA — no backend, no build-time secrets.
// The AI Horde API is called directly from the browser (CORS-open).
export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      // Offline *shell* only. Generations obviously need the network; we never
      // try to cache Horde responses or R2 images in the service worker.
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "index.html",
        runtimeCaching: [],
      },
      manifest: {
        name: "ATELIER — sculptor's image studio",
        short_name: "ATELIER",
        description:
          "A workshop for staged AI image pipelines. Carve, refine, repair — step by step.",
        theme_color: "#1C1A18",
        background_color: "#1C1A18",
        display: "standalone",
        orientation: "any",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
});
