/*
  OCR pipeline orchestrator. Two read engines behind VITE_OCR_ENGINE, both
  fed by the SAME intake normalization and both producing a ParsedReceipt that
  flows into loadDraft → review:

    - "vision" (DEV default): Groq vision LLM via the server-side /api/scan.
    - "paddle": on-device PP-OCRv5 + heuristic parser (production direction).

  In dev we can run BOTH on one image (compare) for an honest side-by-side of
  read quality, since the manual review screen is identical for either.
*/

import { parseReceiptLines, type ParsedReceipt } from "../core/index.ts";
import { canvasToImageData, normalizeImageFile } from "./intake.ts";
import { preprocess, DEFAULT_PREPROCESS, type PreprocessOptions } from "./preprocess.ts";
import { initOcr, recognizeLines } from "./paddle.ts";
import { readWithVision } from "./vision.ts";

export type OcrEngine = "vision" | "paddle";

export const ACTIVE_ENGINE: OcrEngine =
  (import.meta.env.VITE_OCR_ENGINE as OcrEngine) === "paddle" ? "paddle" : "vision";

export type OcrStage =
  | "normalizing"
  | "reading"
  | "parsing";

/** Result of running one engine (for the primary read and the comparison dump). */
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
  preOpts: PreprocessOptions,
): Promise<EngineRun> {
  const t = performance.now();
  try {
    const processed = await preprocess(canvas, preOpts);
    const service = await initOcr();
    const lines = await recognizeLines(service, canvasToImageData(processed));
    const draft = parseReceiptLines(lines);
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
  const preOpts = options.preprocess ?? DEFAULT_PREPROCESS;
  const start = performance.now();

  onStage("normalizing");
  const t0 = performance.now();
  const { canvas, blob } = await normalizeImageFile(file);
  const intakeMs = Math.round(performance.now() - t0);

  onStage("reading");
  const comparison: Partial<Record<OcrEngine, EngineRun>> = {};

  if (compare) {
    // Run both for a fair side-by-side. Primary first (so its stage feels live),
    // then the other.
    const primaryRun = engine === "vision" ? await runVision(blob) : await runPaddle(canvas, preOpts);
    comparison[engine] = primaryRun;
    const otherEngine: OcrEngine = engine === "vision" ? "paddle" : "vision";
    comparison[otherEngine] =
      otherEngine === "vision" ? await runVision(blob) : await runPaddle(canvas, preOpts);
  } else {
    comparison[engine] =
      engine === "vision" ? await runVision(blob) : await runPaddle(canvas, preOpts);
  }

  onStage("parsing");
  const primary = comparison[engine]!;

  return {
    engine,
    draft: primary.draft ?? null,
    primaryError: primary.error,
    intakeMs,
    totalMs: Math.round(performance.now() - start),
    comparison,
  };
}
