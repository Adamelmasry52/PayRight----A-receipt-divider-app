/*
  Cloudflare Pages Function: POST /api/scan (Netlify works the same with a
  redirect). Shares the runtime-agnostic core in server/. The GROQ_API_KEY lives
  in the host's env, never the client.

  Guard order: CORS/Origin → size cap → rate limit (KV + in-memory) → input
  validation → Groq. The real abuse backstop is a Cloudflare WAF rate-limit rule
  on /api/scan — see DEPLOY.md.

  DEV SCAFFOLDING for the vision read path — to be replaced by on-device
  PaddleOCR-VL for production.
*/

import { GroqError, scanReceipt, selectVisionModel } from "../../server/groqScan.ts";
import {
  checkRateLimit,
  contentLengthTooLarge,
  corsHeaders,
  inMemoryStore,
  isOriginAllowed,
  validateScanInput,
  type RateLimitStore,
} from "../../server/scanGuards.ts";

interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

interface PagesContext {
  request: Request;
  env: {
    GROQ_API_KEY?: string;
    GROQ_MODEL?: string;
    ALLOWED_ORIGIN?: string;
    SCAN_RATE_LIMIT?: KVNamespace;
  };
}

function json(status: number, obj: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

function kvStore(kv: KVNamespace): RateLimitStore {
  return {
    get: (k) => kv.get(k),
    put: (k, v, ttl) => kv.put(k, v, { expirationTtl: Math.max(60, ttl) }),
  };
}

/** Preflight. */
export function onRequestOptions(context: PagesContext): Response {
  const origin = context.request.headers.get("Origin");
  if (!isOriginAllowed(origin, context.env.ALLOWED_ORIGIN ?? "")) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;
  const origin = request.headers.get("Origin");

  // A2 — Origin allowlist (defense-in-depth; Origin is spoofable server-side).
  if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN ?? "")) {
    return json(403, { error: "Origin not allowed." }, origin);
  }

  // A3a — reject oversized bodies up front.
  if (contentLengthTooLarge(request.headers.get("Content-Length"))) {
    return json(413, { error: "Request too large." }, origin);
  }

  // A1 — per-IP rate limit. In-memory (per-isolate, defense-in-depth) + KV (real).
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  const mem = await checkRateLimit(inMemoryStore(), ip, now);
  const kv = env.SCAN_RATE_LIMIT
    ? await checkRateLimit(kvStore(env.SCAN_RATE_LIMIT), ip, now)
    : { allowed: true as const };
  if (!mem.allowed || !kv.allowed) {
    const retry = (!mem.allowed ? mem.retryAfterSec : kv.retryAfterSec) ?? 60;
    return new Response(
      JSON.stringify({ error: "Too many scans. Please wait a moment.", code: 429 }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retry),
          ...corsHeaders(origin),
        },
      },
    );
  }

  const apiKey = env.GROQ_API_KEY;
  if (!apiKey) return json(500, { error: "GROQ_API_KEY is not configured." }, origin);

  try {
    const body = (await request.json()) as { imageBase64?: string; mimeType?: string };

    // A3b — validate it's an allow-listed image within size, before forwarding.
    const v = validateScanInput(body);
    if (!v.ok) return json(v.status ?? 400, { error: v.error }, origin);

    const model = await selectVisionModel(apiKey, env.GROQ_MODEL || undefined);
    const result = await scanReceipt({
      apiKey,
      model,
      imageBase64: body.imageBase64!,
      mimeType: body.mimeType!,
    });
    return json(200, { ...result.data, _model: model, _warning: result.warning }, origin);
  } catch (e) {
    if (e instanceof GroqError) {
      return json(e.status === 429 ? 429 : 502, { error: e.message, code: e.status }, origin);
    }
    return json(500, { error: e instanceof Error ? e.message : "Scan failed." }, origin);
  }
}
