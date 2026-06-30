/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { groqScanPlugin } from "./vite-plugins/groqScan.ts";

// Packages used ONLY by the on-device Paddle OCR path. In a vision build these
// are externalized so their modules are never loaded/transformed — which also
// stops onnxruntime-web from emitting its ~26 MB wasm as an orphan asset (the
// runtime points ORT at a CDN anyway). They are bundled normally for a paddle
// build (VITE_OCR_ENGINE=paddle).
const PADDLE_ONLY = /^(onnxruntime-web|paddleocr|@techstark\/opencv-js)(\/|$)/;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const engine = env.VITE_OCR_ENGINE === "paddle" ? "paddle" : "vision";

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Dev-only /api/scan endpoint for the Groq vision read path (key stays server-side).
      groqScanPlugin(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        workbox: {
          // Belt-and-suspenders for a paddle build: keep the big lazy OCR assets
          // out of the precache manifest.
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
    build:
      engine === "paddle"
        ? undefined
        : { rollupOptions: { external: (id: string) => PADDLE_ONLY.test(id) } },
    // onnxruntime-web resolves its own WASM at runtime (CDN), so keep esbuild from
    // pre-bundling those .wasm files during dev.
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
    },
    test: {
      // Core math is pure and DOM-free — run it in Node.
      environment: "node",
      include: ["src/**/*.test.ts"],
    },
  };
});
