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

/**
 * First-guess default. Groq renames vision models often (scout → qwen3.6 →
 * qwen3.8 …), so this is NOT trusted blindly: resolution falls through on a 404
 * to capability-based discovery from the live /models list. Image cap is 20MB
 * (intake compresses to ≤2MB).
 */
export const DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b";

const MODEL_HELP =
  "Set GROQ_MODEL to a current Groq vision model (see console.groq.com/docs/models).";

interface GroqModel {
  id: string;
  input_modalities?: string[];
  output_modalities?: string[];
  supported_features?: string[];
}

/**
 * Select by declared CAPABILITY, never by name/version — a higher version number
 * does not imply image input (many Qwen/gpt-oss models are text-only and would
 * silently break image input). A usable model must accept an image, emit text,
 * and support JSON mode.
 */
function isVisionJsonCapable(m: GroqModel): boolean {
  return (
    (m.input_modalities ?? []).includes("image") &&
    (m.output_modalities ?? []).includes("text") &&
    (m.supported_features ?? []).includes("json_mode")
  );
}

let cachedModel: string | null = null;

/** Test-only: clear the memoized model between cases. */
export function resetVisionModelCache(): void {
  cachedModel = null;
}

/** Vision-capable model ids from Groq's live /models list, chosen by capability. */
async function fetchVisionModelIds(apiKey: string): Promise<string[]> {
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new GroqError(`Groq models list failed (${res.status})`, res.status);
  const json = (await res.json()) as { data?: GroqModel[] };
  return (json.data ?? []).filter(isVisionJsonCapable).map((m) => m.id);
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
  imageBase64: string; // raw base64, no data: prefix
  mimeType: string;
  override?: string; // GROQ_MODEL, if pinned
}

export interface ScanResult {
  data: ReceiptJson;
  warning?: string;
  /** The model that actually served the request. */
  model: string;
}

// qwen3 / gpt-oss are reasoning models: left on, their thinking eats the token
// budget and can leave empty content that fails Groq's JSON validation
// (json_validate_failed). reasoning_effort:"none" sends the whole budget to the
// JSON answer. Only sent to reasoning-family models — others reject the param.
function isReasoningModel(model: string): boolean {
  return /qwen3|gpt-oss|reasoning/i.test(model);
}

type Attempt =
  | { kind: "ok"; data: ReceiptJson; warning?: string }
  | { kind: "model_not_found" };

/**
 * One scan attempt against a specific model. Returns "model_not_found" (so the
 * caller can fall through to another model) instead of throwing when the model
 * is missing/renamed/decommissioned. Malformed model output fails SOFT to an
 * empty draft. Other failures (rate limit, transport) throw GroqError.
 */
async function attemptScan(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
): Promise<Attempt> {
  const res = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 1536,
      response_format: { type: "json_object" },
      ...(isReasoningModel(model) ? { reasoning_effort: "none" } : {}),
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: USER_PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            },
          ],
        },
      ],
    }),
  });

  if (res.ok) {
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "";
    const parsed = parseReceiptJson(content);
    return parsed
      ? { kind: "ok", data: parsed }
      : { kind: "ok", data: { ...EMPTY }, warning: "malformed_json" };
  }

  const body = await res.text().catch(() => "");
  // Missing / renamed / decommissioned model → signal fallthrough, don't fail.
  if (
    res.status === 404 ||
    /model_not_found|model[_ ]?decommission|does not exist|no longer/i.test(body)
  ) {
    return { kind: "model_not_found" };
  }
  if (res.status === 429) throw new GroqError("Groq rate limit reached (429).", 429);
  throw new GroqError(`Groq request failed (${res.status}). ${body.slice(0, 200)}`, res.status);
}

/**
 * Read a receipt, resilient to Groq's frequent model renames/deprecations.
 * Resolution order (each falls through on a 404, never 404-ing the user):
 *   1. GROQ_MODEL override, if it works.
 *   2. DEFAULT_VISION_MODEL, if it works.
 *   3. any vision-capable model from the live /models list (by capability).
 *   4. else throw a descriptive error naming GROQ_MODEL + the docs URL.
 * The working model is cached per cold start (kind to the 8000 TPM limit).
 */
export async function scanReceipt(args: ScanArgs): Promise<ScanResult> {
  const { apiKey, imageBase64, mimeType, override } = args;

  const tryModel = async (model: string): Promise<ScanResult | null> => {
    const r = await attemptScan(apiKey, model, imageBase64, mimeType);
    if (r.kind === "model_not_found") return null;
    cachedModel = model;
    return { data: r.data, warning: r.warning, model };
  };

  // Fast path: reuse the model resolved earlier this cold start.
  if (cachedModel) {
    const hit = await tryModel(cachedModel);
    if (hit) return hit;
    cachedModel = null; // decommissioned mid-session → re-resolve
  }

  const tried = new Set<string>();
  const ordered: string[] = [];
  if (override) ordered.push(override);
  if (!ordered.includes(DEFAULT_VISION_MODEL)) ordered.push(DEFAULT_VISION_MODEL);

  for (const model of ordered) {
    tried.add(model);
    const hit = await tryModel(model);
    if (hit) return hit;
  }

  // Override + default both missing → discover by capability from the live list.
  let visionIds: string[];
  try {
    visionIds = await fetchVisionModelIds(apiKey);
  } catch {
    throw new GroqError(`No usable vision model resolved. ${MODEL_HELP}`, 502);
  }
  if (visionIds.length === 0) {
    throw new GroqError(`No vision-capable Groq model found. ${MODEL_HELP}`, 502);
  }
  for (const model of visionIds) {
    if (tried.has(model)) continue;
    const hit = await tryModel(model);
    if (hit) return hit;
  }

  throw new GroqError(`No usable vision model resolved. ${MODEL_HELP}`, 502);
}
