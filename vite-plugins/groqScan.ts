/*
  Dev-only Vite middleware exposing POST /api/scan so `npm run dev` can use the
  Groq vision read path with the API key kept server-side. The production host
  uses functions/api/scan.ts (same shared core).
*/

import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { GroqError, scanReceipt, selectVisionModel } from "../server/groqScan.ts";

export function groqScanPlugin(): Plugin {
  let apiKey = "";
  let modelOverride = "";

  return {
    name: "payright-groq-scan",
    configResolved(config) {
      // Load ALL env (empty prefix) so non-VITE_ secrets are available server-side.
      const env = loadEnv(config.mode, process.cwd(), "");
      apiKey = env.GROQ_API_KEY ?? "";
      modelOverride = env.GROQ_MODEL ?? "";
    },
    configureServer(server) {
      server.middlewares.use("/api/scan", (req, res) => {
        const send = (status: number, obj: unknown) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(obj));
        };

        if (req.method === "GET") {
          // Dev convenience: list available Groq model ids (no secrets exposed).
          void (async () => {
            try {
              const r = await fetch("https://api.groq.com/openai/v1/models", {
                headers: { Authorization: `Bearer ${apiKey}` },
              });
              const j = (await r.json()) as { data?: { id: string }[] };
              send(200, { models: (j.data ?? []).map((m) => m.id) });
            } catch (e) {
              send(502, { error: e instanceof Error ? e.message : "models failed" });
            }
          })();
          return;
        }
        if (req.method !== "POST") return send(405, { error: "Method Not Allowed" });

        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", () => {
          void (async () => {
            try {
              if (!apiKey) {
                return send(500, {
                  error: "GROQ_API_KEY is not set on the server. Add it to .env.",
                });
              }
              const { imageBase64, mimeType } = JSON.parse(body || "{}");
              if (!imageBase64) return send(400, { error: "imageBase64 is required" });

              const model = await selectVisionModel(apiKey, modelOverride || undefined);
              const result = await scanReceipt({
                apiKey,
                model,
                imageBase64,
                mimeType: mimeType || "image/jpeg",
              });
              return send(200, { ...result.data, _model: model, _warning: result.warning });
            } catch (e) {
              if (e instanceof GroqError) {
                return send(e.status === 429 ? 429 : 502, {
                  error: e.message,
                  code: e.status,
                });
              }
              return send(500, {
                error: e instanceof Error ? e.message : "Scan failed.",
              });
            }
          })();
        });
      });
    },
  };
}
