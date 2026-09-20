import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { scanReceipt, resetVisionModelCache, DEFAULT_VISION_MODEL } from "./groqScan.ts";

const SAMPLE = JSON.stringify({
  items: [{ name: "Coffee", unitPrice: 10, qty: 1 }],
  subtotal: 10,
  total: 10,
  service: 0,
  vat: 0,
});

const textModel = (id: string) => ({
  id,
  input_modalities: ["text"],
  output_modalities: ["text"],
  supported_features: ["json_mode"],
});
const visionModel = (id: string) => ({
  id,
  input_modalities: ["text", "image"],
  output_modalities: ["text"],
  supported_features: ["json_mode", "reasoning"],
});

interface Recorder {
  chatModels: string[];
  chatBodies: Record<string, unknown>[];
  modelsCalls: number;
}

/**
 * Mock Groq: `/models` returns `models`; `/chat/completions` returns valid JSON
 * for ids in `working`, else 404 model_not_found.
 */
function mockGroq(models: object[], working: Set<string>): Recorder {
  const rec: Recorder = { chatModels: [], chatBodies: [], modelsCalls: 0 };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (String(url).endsWith("/models")) {
        rec.modelsCalls++;
        return { ok: true, status: 200, json: async () => ({ data: models }) };
      }
      const body = JSON.parse(init?.body ?? "{}");
      rec.chatModels.push(body.model);
      rec.chatBodies.push(body);
      if (working.has(body.model)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content: SAMPLE } }] }),
        };
      }
      return {
        ok: false,
        status: 404,
        text: async () =>
          JSON.stringify({ error: { code: "model_not_found", message: `model ${body.model} does not exist` } }),
      };
    }),
  );
  return rec;
}

beforeEach(() => resetVisionModelCache());
afterEach(() => vi.unstubAllGlobals());

const scan = (override?: string) =>
  scanReceipt({ apiKey: "k", imageBase64: "/9j/x", mimeType: "image/jpeg", override });

describe("scanReceipt — resilient model resolution", () => {
  it("a valid GROQ_MODEL pin resolves and is used (no /models lookup)", async () => {
    const rec = mockGroq([visionModel("vendor/pinned")], new Set(["vendor/pinned"]));
    const r = await scan("vendor/pinned");
    expect(r.model).toBe("vendor/pinned");
    expect(r.data.items).toHaveLength(1);
    expect(rec.modelsCalls).toBe(0); // pin worked → never hit the models list
  });

  it("a bogus pin falls through to the default instead of 404-ing the user", async () => {
    const rec = mockGroq(
      [visionModel(DEFAULT_VISION_MODEL)],
      new Set([DEFAULT_VISION_MODEL]), // pin absent → 404; default works
    );
    const r = await scan("bogus/does-not-exist");
    expect(r.model).toBe(DEFAULT_VISION_MODEL);
    expect(r.data.total).toBe(10);
    expect(rec.chatModels[0]).toBe("bogus/does-not-exist"); // tried, 404'd, fell through
  });

  it("discovers a vision model by CAPABILITY; text-only models are never selected", async () => {
    // Pin + default both 404; live list has two text-only models and one vision.
    const rec = mockGroq(
      [textModel("vendor/text-a"), visionModel("vendor/vision-x"), textModel("vendor/text-b")],
      new Set(["vendor/vision-x"]),
    );
    const r = await scan("bogus/pin");
    expect(r.model).toBe("vendor/vision-x");
    // A text-only model must never even be attempted for vision.
    expect(rec.chatModels).not.toContain("vendor/text-a");
    expect(rec.chatModels).not.toContain("vendor/text-b");
  });

  it("throws a descriptive error naming GROQ_MODEL + the docs URL when no vision model exists", async () => {
    mockGroq([textModel("vendor/text-a"), textModel("vendor/text-b")], new Set());
    await expect(scan("bogus/pin")).rejects.toThrow(/GROQ_MODEL/);
    resetVisionModelCache();
    await expect(scan("bogus/pin")).rejects.toThrow(/console\.groq\.com\/docs\/models/);
  });

  it("caches the resolved model across scans (one resolution per cold start)", async () => {
    const rec = mockGroq([visionModel(DEFAULT_VISION_MODEL)], new Set([DEFAULT_VISION_MODEL]));
    await scan("bogus/pin"); // resolves default after the pin 404s
    const callsAfterFirst = rec.chatModels.length;
    await scan("bogus/pin"); // should go straight to the cached default
    expect(rec.chatModels.slice(callsAfterFirst)).toEqual([DEFAULT_VISION_MODEL]);
  });

  it("disables reasoning for reasoning-family models, not others", async () => {
    const rec = mockGroq(
      [visionModel(DEFAULT_VISION_MODEL), visionModel("vendor/plain-vision")],
      new Set([DEFAULT_VISION_MODEL, "vendor/plain-vision"]),
    );
    await scan(); // default qwen3.8 → reasoning family
    expect(rec.chatBodies.at(-1)).toMatchObject({ reasoning_effort: "none" });

    resetVisionModelCache();
    await scan("vendor/plain-vision"); // not a reasoning family
    expect(rec.chatBodies.at(-1)).not.toHaveProperty("reasoning_effort");
  });
});
