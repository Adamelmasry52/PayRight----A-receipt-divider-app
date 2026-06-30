/*
  Dev-only Vite middleware exposing POST /api/scan so `npm run dev` uses the Groq
  vision read path with the API key server-side. Mirrors the production guards in
  functions/api/scan.ts (in-memory rate limit only here — dev has no KV/WAF).
*/

import type { Plugin } from "vite";
import { loadEnv } from "vite";
import { GroqError, scanReceipt, selectVisionModel } from "../server/groqScan.ts";
import {
  checkRateLimit,
  corsHeaders,
  inMemoryStore,
  isOriginAllowed,
  validateScanInput,
  MAX_BODY_BYTES,
} from "../server/scanGuards.ts";

export function groqScanPlugin(): Plugin {
  let apiKey = "";
  let modelOverride = "";
  let allowedOrigin = "";

  return {
    name: "payright-groq-scan",
    configResolved(config) {
      const env = loadEnv(config.mode, process.cwd(), "");
      apiKey = env.GROQ_API_KEY ?? "";
      modelOverride = env.GROQ_MODEL ?? "";
      allowedOrigin = env.ALLOWED_ORIGIN ?? "";
    },
    configureServer(server) {
      server.middlewares.use("/api/scan", (req, res) => {
        const origin = (req.headers.origin as string) ?? null;
        const send = (status: number, obj: unknown, extra: Record<string, string> = {}) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          for (const [k, v] of Object.entries({ ...corsHeaders(origin), ...extra })) {
            res.setHeader(k, v);
          }
          res.end(JSON.stringify(obj));
        };

        if (req.method === "OPTIONS") {
          res.statusCode = isOriginAllowed(origin, allowedOrigin) ? 204 : 403;
          for (const [k, v] of Object.entries(corsHeaders(origin))) res.setHeader(k, v);
          res.end();
          return;
        }

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

        // A2 — Origin allowlist.
        if (!isOriginAllowed(origin, allowedOrigin)) {
          return send(403, { error: "Origin not allowed." });
        }

        // A1 — per-IP rate limit (in-memory; dev has no KV).
        const ip =
          (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "dev";
        void (async () => {
          const rl = await checkRateLimit(inMemoryStore(), ip, Date.now());
          if (!rl.allowed) {
            return send(429, { error: "Too many scans. Please wait a moment.", code: 429 }, {
              "Retry-After": String(rl.retryAfterSec ?? 60),
            });
          }

          // A3 — read body with a hard size cap, then validate before Groq.
          let body = "";
          let bytes = 0;
          let aborted = false;
          req.on("data", (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > MAX_BODY_BYTES) {
              aborted = true;
              send(413, { error: "Request too large." });
              req.destroy();
              return;
            }
            body += chunk;
          });
          req.on("end", () => {
            if (aborted) return;
            void (async () => {
              try {
                if (!apiKey) {
                  return send(500, {
                    error: "GROQ_API_KEY is not set on the server. Add it to .env.",
                  });
                }
                const parsed = JSON.parse(body || "{}");
                const v = validateScanInput(parsed);
                if (!v.ok) return send(v.status ?? 400, { error: v.error });

                const model = await selectVisionModel(apiKey, modelOverride || undefined);
                const result = await scanReceipt({
                  apiKey,
                  model,
                  imageBase64: parsed.imageBase64,
                  mimeType: parsed.mimeType,
                });
                return send(200, { ...result.data, _model: model, _warning: result.warning });
              } catch (e) {
                if (e instanceof GroqError) {
                  return send(e.status === 429 ? 429 : 502, { error: e.message, code: e.status });
                }
                return send(500, { error: e instanceof Error ? e.message : "Scan failed." });
              }
            })();
          });
        })();
      });
    },
  };
}
