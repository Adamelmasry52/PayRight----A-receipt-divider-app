/*
  Shared, runtime-agnostic guards for the /api/scan endpoint (used by both the
  Cloudflare Pages function and the Vite dev plugin). No Node- or Worker-specific
  APIs here.

  Layers (in handler order): Origin allowlist → size cap → rate limit → input
  validation. None of these is a silver bullet — see the comments. The REAL abuse
  backstop is a Cloudflare WAF rate-limit rule on /api/scan (see DEPLOY.md).
*/

// ── Sizes ────────────────────────────────────────────────────────────────────
// ~6M base64 chars ≈ 4.5MB image — also keeps us under Groq's ~4MB image cap.
export const MAX_BASE64_CHARS = 6_000_000;
// Whole request body (base64 + JSON overhead). Checked via Content-Length first.
export const MAX_BODY_BYTES = 8_500_000;

export const MIME_ALLOWLIST = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

// ── Input validation ─────────────────────────────────────────────────────────
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Cheap signature sniff so we don't forward non-images to Groq. */
function looksLikeImage(base64: string, mime: string): boolean {
  if (base64.startsWith("/9j/")) return true; // JPEG
  if (base64.startsWith("iVBOR")) return true; // PNG
  if (base64.startsWith("UklGR")) return true; // WEBP (RIFF)
  // HEIC/HEIF have no stable base64 prefix; the client converts them to JPEG
  // before upload, so accept on the (allow-listed) mime alone.
  return mime === "image/heic" || mime === "image/heif";
}

export interface ScanInput {
  imageBase64?: unknown;
  mimeType?: unknown;
}

export interface ValidationResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/** Validate the parsed body BEFORE forwarding to Groq. */
export function validateScanInput(body: ScanInput): ValidationResult {
  const { imageBase64, mimeType } = body;
  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return { ok: false, status: 400, error: "imageBase64 is required" };
  }
  if (typeof mimeType !== "string" || !MIME_ALLOWLIST.includes(mimeType as never)) {
    return { ok: false, status: 415, error: "Unsupported image type." };
  }
  if (imageBase64.length > MAX_BASE64_CHARS) {
    return { ok: false, status: 413, error: "Image is too large." };
  }
  if (!BASE64_RE.test(imageBase64)) {
    return { ok: false, status: 400, error: "Malformed image data." };
  }
  if (!looksLikeImage(imageBase64, mimeType)) {
    return { ok: false, status: 400, error: "That doesn't look like an image." };
  }
  return { ok: true };
}

/** Reject obviously oversized requests from the Content-Length header. */
export function contentLengthTooLarge(header: string | null): boolean {
  if (!header) return false; // unknown length → rely on the base64 cap after parse
  const n = Number(header);
  return Number.isFinite(n) && n > MAX_BODY_BYTES;
}

// ── Origin allowlist (defense-in-depth; Origin is spoofable server-side) ───────
/**
 * Returns the origin to echo back in CORS headers if allowed, "*" semantics are
 * avoided. `null` allowed-list (env unset) means "don't enforce" (dev) — deploy
 * MUST set ALLOWED_ORIGIN.
 */
export function isOriginAllowed(origin: string | null, allowList: string): boolean {
  const allowed = allowList
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return true; // not configured → don't block (dev)
  if (!origin) return true; // non-browser clients send no Origin; rate-limit handles them
  return allowed.includes(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ── Rate limiting (fixed-window per IP) ────────────────────────────────────────
export interface RateLimitConfig {
  perMinute: number;
  perDay: number;
}
export const DEFAULT_RATE_LIMIT: RateLimitConfig = { perMinute: 5, perDay: 100 };

export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec?: number;
  scope?: "minute" | "day";
}

/**
 * Fixed-window counter. NOTE: get-then-put is not atomic on KV, so a few extra
 * requests can slip through under a burst — acceptable for a cost guard; the WAF
 * rule is the real backstop.
 */
export async function checkRateLimit(
  store: RateLimitStore,
  ip: string,
  now: number,
  cfg: RateLimitConfig = DEFAULT_RATE_LIMIT,
): Promise<RateLimitResult> {
  const minuteWindow = Math.floor(now / 60_000);
  const dayWindow = Math.floor(now / 86_400_000);
  const minuteKey = `rl:m:${ip}:${minuteWindow}`;
  const dayKey = `rl:d:${ip}:${dayWindow}`;

  const [mRaw, dRaw] = await Promise.all([store.get(minuteKey), store.get(dayKey)]);
  const m = mRaw ? Number(mRaw) || 0 : 0;
  const d = dRaw ? Number(dRaw) || 0 : 0;

  if (m >= cfg.perMinute) {
    return { allowed: false, scope: "minute", retryAfterSec: 60 - Math.floor((now % 60_000) / 1000) };
  }
  if (d >= cfg.perDay) {
    return { allowed: false, scope: "day", retryAfterSec: 3600 };
  }

  await Promise.all([
    store.put(minuteKey, String(m + 1), 120),
    store.put(dayKey, String(d + 1), 90_000),
  ]);
  return { allowed: true };
}

/**
 * Per-isolate in-memory store. DEFENSE-IN-DEPTH ONLY: edge functions run many
 * isolates, so this does NOT bound global traffic — it only smooths bursts that
 * hit the same isolate. The KV store (and the WAF rule) are the real limits.
 */
const memory = new Map<string, { value: string; expires: number }>();

export function inMemoryStore(): RateLimitStore {
  return {
    async get(key) {
      const hit = memory.get(key);
      if (!hit) return null;
      if (hit.expires < Date.now()) {
        memory.delete(key);
        return null;
      }
      return hit.value;
    },
    async put(key, value, ttlSeconds) {
      memory.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
    },
  };
}
