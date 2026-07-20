/*
  Groq vision read — shared, runtime-agnostic core (uses only global fetch, so it
  runs in the Vite dev middleware AND in a Cloudflare/Netlify function).

  DEV SCAFFOLDING: this calls a hosted vision LLM with the receipt image. It is
  NOT the production architecture — production target is on-device PaddleOCR-VL.
  The GROQ_API_KEY must stay server-side; this module is never bundled to the
  browser.
*/

const GROQ_BASE = "https://api.groq.com/openai/v1";

export interface ReceiptJson {
  items: { name: string; unitPrice: number; qty: number }[];
  subtotal: number;
  total: number;
  service: number;
  vat: number;
}

const EMPTY: ReceiptJson = { items: [], subtotal: 0, total: 0, service: 0, vat: 0 };

export class GroqError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GroqError";
    this.status = status;
  }
}

/** Groq's current multimodal model (JSON mode, 20MB image cap). */
export const DEFAULT_VISION_MODEL = "qwen/qwen3.6-27b";

// Best-effort fallback when the default is gone from the live list. NOTE: avoid a
// broad /qwen/ here — qwen3-32b is text-only; match known multimodal families.
// The definitive fix for any future deprecation is setting GROQ_MODEL.
const VISION_PRIORITY: RegExp[] = [/maverick/i, /llama-4/i, /\bvl\b/i, /vision/i, /scout/i];

const MODEL_HELP =
  "Set GROQ_MODEL to a current Groq vision model (see console.groq.com/docs/models).";

let cachedModel: string | null = null;

/** Test-only: clear the memoized model between cases. */
export function resetVisionModelCache(): void {
  cachedModel = null;
}

async function fetchModelIds(apiKey: string): Promise<string[]> {
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new GroqError(`Groq models list failed (${res.status})`, res.status);
  const json = (await res.json()) as { data?: { id: string }[] };
  return (json.data ?? []).map((m) => m.id);
}

/**
 * Resolve the vision model. Order of resolution:
 *   1. GROQ_MODEL override, if provided (no network).
 *   2. else qwen/qwen3.6-27b — used unless the live models list explicitly no
 *      longer offers it (a models-endpoint hiccup falls back to it, not an error).
 *   3. else scan the live /models list for any vision-capable model.
 *   4. else throw a self-explanatory error naming GROQ_MODEL.
 */
export async function selectVisionModel(
  apiKey: string,
  override?: string,
): Promise<string> {
  if (override) return override;
  if (cachedModel) return cachedModel;

  let ids: string[];
  try {
    ids = await fetchModelIds(apiKey);
  } catch {
    // Don't block scans on a models-endpoint hiccup — trust the default.
    return (cachedModel = DEFAULT_VISION_MODEL);
  }

  if (ids.length === 0 || ids.includes(DEFAULT_VISION_MODEL)) {
    return (cachedModel = DEFAULT_VISION_MODEL);
  }

  for (const rx of VISION_PRIORITY) {
    const hit = ids.find((id) => rx.test(id));
    if (hit) return (cachedModel = hit);
  }

  throw new GroqError(`No vision-capable Groq model found. ${MODEL_HELP}`, 502);
}

const SYSTEM_PROMPT =
  "You read restaurant/grocery receipts from images and return ONLY strict JSON. " +
  "Currency is EGP. No prose, no markdown, no code fences.";

const USER_PROMPT =
  "Extract this receipt as JSON with exactly this shape: " +
  '{"items":[{"name":string,"unitPrice":number,"qty":number}],' +
  '"subtotal":number,"total":number,"service":number,"vat":number}. ' +
  "Rules: numbers are plain numbers (no currency symbols). unitPrice is the per-unit " +
  "price; qty is an integer (default 1). Do NOT include subtotal/total/service/vat/tax " +
  "rows as items. If a field is missing, use 0. Return JSON only.";

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Defensively coerce a model's text response into ReceiptJson, or null if unusable. */
export function parseReceiptJson(content: string): ReceiptJson | null {
  const text = content.trim();
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      obj = JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;

  const o = obj as Record<string, unknown>;
  const itemsRaw = Array.isArray(o.items) ? o.items : [];
  const items = itemsRaw.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const qty = Math.round(num(it.qty ?? 1)) || 1;
    return {
      name: String(it.name ?? "").trim(),
      unitPrice: num(it.unitPrice ?? it.price),
      qty: Math.max(1, qty),
    };
  });

  return {
    items,
    subtotal: num(o.subtotal),
    total: num(o.total),
    service: num(o.service),
    vat: num(o.vat ?? o.tax),
  };
}

export interface ScanArgs {
  apiKey: string;
  model: string;
  imageBase64: string; // raw base64, no data: prefix
  mimeType: string;
}

/**
 * Call Groq's vision model in JSON mode. Throws GroqError on transport/rate-limit
 * failures; on malformed model output, fails SOFT to an empty draft (so the user
 * still lands on the manual review screen).
 */
export async function scanReceipt(
  args: ScanArgs,
): Promise<{ data: ReceiptJson; warning?: string }> {
  // qwen3 / gpt-oss are reasoning models: left on, their thinking eats the token
  // budget and can leave empty content that fails Groq's JSON validation
  // (json_validate_failed). Turn reasoning OFF so the whole budget goes to the
  // JSON answer. Only sent to reasoning-family models — other models reject it.
  const isReasoningModel = /qwen3|gpt-oss|reasoning/i.test(args.model);

  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0,
      max_tokens: 1536,
      response_format: { type: "json_object" },
      ...(isReasoningModel ? { reasoning_effort: "none" } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${args.mimeType};base64,${args.imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (res.status === 429) {
    throw new GroqError("Groq rate limit reached (429).", 429);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GroqError(`Groq request failed (${res.status}). ${body.slice(0, 200)}`, res.status);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = parseReceiptJson(content);
  return parsed ? { data: parsed } : { data: { ...EMPTY }, warning: "malformed_json" };
}
