/*
  OCR pipeline orchestrator. Two read engines behind VITE_OCR_ENGINE, both fed by
  the SAME intake normalization and both producing a ParsedReceipt that flows into
  loadDraft → review:

    - "vision" (DEV default + production): Groq vision LLM via /api/scan.
    - "paddle": on-device PP-OCRv5 + heuristic parser (planned production path).

  The Paddle engine and its heavy WASM/OpenCV deps are reached ONLY via a dynamic
  import() guarded by the build-time constant PADDLE_AVAILABLE. In a vision
  production build that folds to `false`, so the whole Paddle subgraph is
  tree-shaken out of dist (keeping every asset well under the 25 MiB host limit).
  In dev (either engine) and in a paddle build, it stays available.
*/

import type { ParsedReceipt } from "../core/index.ts";
import { normalizeImageFile } from "./intake.ts";
import type { PreprocessOptions } from "./preprocess.ts";
import { readWithVision } from "./vision.ts";

export type OcrEngine = "vision" | "paddle";

export const ACTIVE_ENGINE: OcrEngine =
  import.meta.env.VITE_OCR_ENGINE === "paddle" ? "paddle" : "vision";

// Build-time gate. Reachable only in dev, or in a build explicitly made with
// VITE_OCR_ENGINE=paddle. Folds to a literal `false` in a vision prod build so
// the dynamic import("./paddleRun.ts") below becomes dead code.
const PADDLE_AVAILABLE =
  import.meta.env.DEV || import.meta.env.VITE_OCR_ENGINE === "paddle";

export type OcrStage = "normalizing" | "reading" | "parsing";

export interface EngineRun {
  engine: OcrEngine;
  draft?: ParsedReceipt;
  /** Raw OCR lines (PP-OCR only). */
  lines?: string[];
  ms: number;
  error?: string;
}

export interface OcrOutcome {
  engine: OcrEngine;
  /** Primary engine's draft, or null if the primary engine errored hard. */
  draft: ParsedReceipt | null;
  primaryError?: string;
  intakeMs: number;
  totalMs: number;
  /** Both engines when compare is on (dev); otherwise just the primary. */
  comparison: Partial<Record<OcrEngine, EngineRun>>;
}

export interface RunOptions {
  engine?: OcrEngine;
  /** Run both engines for a side-by-side (defaults to dev mode). */
  compare?: boolean;
  preprocess?: PreprocessOptions;
  onStage?: (stage: OcrStage) => void;
}

async function runVision(blob: Blob): Promise<EngineRun> {
  const t = performance.now();
  try {
    const draft = await readWithVision(blob);
    return { engine: "vision", draft, ms: Math.round(performance.now() - t) };
  } catch (e) {
    return {
      engine: "vision",
      ms: Math.round(performance.now() - t),
      error: e instanceof Error ? e.message : "vision failed",
    };
  }
}

async function runPaddle(
  canvas: HTMLCanvasElement,
  preOpts: PreprocessOptions | undefined,
): Promise<EngineRun> {
  const t = performance.now();
  try {
    // Dynamic import gated by PADDLE_AVAILABLE at every call site below.
    const { runPaddleEngine } = await import("./paddleRun.ts");
    const { draft, lines } = await runPaddleEngine(canvas, preOpts);
    return { engine: "paddle", draft, lines, ms: Math.round(performance.now() - t) };
  } catch (e) {
    return {
      engine: "paddle",
      ms: Math.round(performance.now() - t),
      error: e instanceof Error ? e.message : "paddle failed",
    };
  }
}

export async function runOcrPipeline(
  file: File,
  options: RunOptions = {},
): Promise<OcrOutcome> {
  const onStage = options.onStage ?? (() => {});
  const engine = options.engine ?? ACTIVE_ENGINE;
  const compare = options.compare ?? import.meta.env.DEV;
  const start = performance.now();

  onStage("normalizing");
  const t0 = performance.now();
  const { canvas, blob } = await normalizeImageFile(file);
  const intakeMs = Math.round(performance.now() - t0);

  onStage("reading");
  const comparison: Partial<Record<OcrEngine, EngineRun>> = {};

  if (engine === "paddle") {
    // `PADDLE_AVAILABLE` is a build constant — when false this branch's import is
    // dead and tree-shaken; the engine is simply unavailable in that build.
    if (PADDLE_AVAILABLE) {
      comparison.paddle = await runPaddle(canvas, options.preprocess);
    } else {
      comparison.paddle = {
        engine: "paddle",
        ms: 0,
        error: "On-device OCR isn't included in this build.",
      };
    }
    if (compare) comparison.vision = await runVision(blob);
  } else {
    comparison.vision = await runVision(blob);
    if (compare && PADDLE_AVAILABLE) {
      comparison.paddle = await runPaddle(canvas, options.preprocess);
    }
  }

  onStage("parsing");
  const primary = comparison[engine];

  return {
    engine,
    draft: primary?.draft ?? null,
    primaryError: primary?.error,
    intakeMs,
    totalMs: Math.round(performance.now() - start),
    comparison,
  };
}
