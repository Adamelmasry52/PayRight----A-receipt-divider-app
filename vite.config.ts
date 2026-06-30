/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // Full manifest + generated icons land in Step 8. This is the offline
      // app-shell wiring only.
      includeAssets: ["favicon.svg"],
      workbox: {
        // The OCR runtime WASM and OpenCV chunk are huge and loaded lazily on
        // the scan path (the model files themselves come from a CDN + Cache API),
        // so keep them out of the precache manifest.
        globIgnores: ["**/ort-*.wasm", "**/opencv-*.js"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      manifest: {
        name: "PayRight — Split the bill",
        short_name: "PayRight",
        description: "Photograph a receipt, split it fairly, share a link. No accounts.",
        theme_color: "#1a1f2b",
        background_color: "#1a1f2b",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      devOptions: {
        // Keep the service worker out of the way during dev.
        enabled: false,
      },
    }),
  ],
  // onnxruntime-web resolves its own WASM at runtime (we point it at a CDN), so
  // keep esbuild from trying to pre-bundle those .wasm files. OpenCV embeds its
  // wasm in a single CJS file and must be pre-bundled for correct interop.
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
  test: {
    // Core math is pure and DOM-free — run it in Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
