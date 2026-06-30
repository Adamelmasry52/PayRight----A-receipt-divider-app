/*
  Cloudflare Pages Function handling POST /api/scan in production (Netlify works
  the same way with a redirect). Shares the runtime-agnostic core in
  server/groqScan.ts. The GROQ_API_KEY lives in the host's env, never the client.

  DEV SCAFFOLDING for the vision read path — to be replaced by on-device
  PaddleOCR-VL for production.
*/

import { GroqError, scanReceipt, selectVisionModel } from "../../server/groqScan.ts";

// Loosely typed to avoid pulling in @cloudflare/workers-types for the app build;
// Pages provides the real PagesFunction signature at deploy time.
interface PagesContext {
  request: Request;
  env: { GROQ_API_KEY?: string; GROQ_MODEL?: string };
}

const json = (status: number, obj: unknown): Response =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return json(500, { error: "GROQ_API_KEY is not configured." });

  try {
    const { imageBase64, mimeType } = (await request.json()) as {
      imageBase64?: string;
      mimeType?: string;
    };
    if (!imageBase64) return json(400, { error: "imageBase64 is required" });

    const model = await selectVisionModel(apiKey, env.GROQ_MODEL || undefined);
    const result = await scanReceipt({
      apiKey,
      model,
      imageBase64,
      mimeType: mimeType || "image/jpeg",
    });
    return json(200, { ...result.data, _model: model, _warning: result.warning });
  } catch (e) {
    if (e instanceof GroqError) {
      return json(e.status === 429 ? 429 : 502, { error: e.message, code: e.status });
    }
    return json(500, { error: e instanceof Error ? e.message : "Scan failed." });
  }
}
