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
  test: {
    // Core math is pure and DOM-free — run it in Node.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
