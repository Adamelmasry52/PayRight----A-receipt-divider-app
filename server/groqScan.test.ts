import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  selectVisionModel,
  resetVisionModelCache,
  DEFAULT_VISION_MODEL,
} from "./groqScan.ts";

/** Stub global fetch to return a Groq /models list of the given ids. */
function mockModelList(ids: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: ids.map((id) => ({ id })) }),
    })),
  );
}

beforeEach(() => resetVisionModelCache());
afterEach(() => vi.unstubAllGlobals());

describe("selectVisionModel", () => {
  it("GROQ_MODEL override wins without touching the network", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await selectVisionModel("key", "my/custom-vision")).toBe("my/custom-vision");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("defaults to qwen/qwen3.6-27b when the live list offers it", async () => {
    expect(DEFAULT_VISION_MODEL).toBe("qwen/qwen3.6-27b");
    mockModelList(["llama-3.1-8b-instant", "qwen/qwen3.6-27b", "qwen/qwen3-32b"]);
    expect(await selectVisionModel("key")).toBe("qwen/qwen3.6-27b");
  });

  it("still defaults to qwen if the models endpoint is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    expect(await selectVisionModel("key")).toBe(DEFAULT_VISION_MODEL);
  });

  it("scans the live list for a vision model only when qwen is gone", async () => {
    // qwen3.6-27b absent; qwen3-32b is text-only and must NOT be picked.
    mockModelList([
      "llama-3.1-8b-instant",
      "qwen/qwen3-32b",
      "meta-llama/llama-4-maverick-17b-128e-instruct",
    ]);
    expect(await selectVisionModel("key")).toMatch(/maverick/);
  });

  it("throws a self-explanatory error naming GROQ_MODEL when none resolve", async () => {
    mockModelList(["llama-3.1-8b-instant", "qwen/qwen3-32b", "whisper-large-v3"]);
    await expect(selectVisionModel("key")).rejects.toThrow(/GROQ_MODEL/);
    resetVisionModelCache();
    await expect(selectVisionModel("key")).rejects.toThrow(/console\.groq\.com\/docs\/models/);
  });
});
