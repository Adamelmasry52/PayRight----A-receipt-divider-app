/*
  OCR pipeline orchestrator: file → normalize → OpenCV preprocess → PP-OCRv5 →
  parse → draft. Reports per-stage timings so we can measure the browser-OCR bet
  (cold model load vs. warm scan).
*/

import { parseReceiptLines, type ParsedReceipt } from "../core/index.ts";
import { canvasToImageData, normalizeImageFile } from "./intake.ts";
import { preprocess, DEFAULT_PREPROCESS, type PreprocessOptions } from "./preprocess.ts";
import { initOcr, recognizeLines } from "./paddle.ts";

export type OcrStage =
  | "normalizing"
  | "preprocessing"
  | "loading-model"
  | "reading"
  | "parsing";

export interface OcrTimings {
  intakeMs: number;
  preprocessMs: number;
  /** Model init: download (cold) or cache read (warm) + session creation. */
  modelInitMs: number;
  recognizeMs: number;
  totalMs: number;
  /** True when the model session already existed (warm scan). */
  warmStart: boolean;
}

export interface OcrOutcome {
  draft: ParsedReceipt;
  lines: string[];
  timings: OcrTimings;
}

export interface RunOptions {
  preprocess?: PreprocessOptions;
  onStage?: (stage: OcrStage) => void;
}

let everInitialized = false;

export async function runOcrPipeline(
  file: File,
  options: RunOptions = {},
): Promise<OcrOutcome> {
  const onStage = options.onStage ?? (() => {});
  const preOpts = options.preprocess ?? DEFAULT_PREPROCESS;
  const t = () => performance.now();
  const start = t();

  onStage("normalizing");
  const t0 = t();
  const canvas = await normalizeImageFile(file);
  const intakeMs = t() - t0;

  onStage("preprocessing");
  const t1 = t();
  const processed = await preprocess(canvas, preOpts);
  const preprocessMs = t() - t1;

  const warmStart = everInitialized;
  onStage("loading-model");
  const t2 = t();
  const service = await initOcr();
  everInitialized = true;
  const modelInitMs = t() - t2;

  onStage("reading");
  const t3 = t();
  const lines = await recognizeLines(service, canvasToImageData(processed));
  const recognizeMs = t() - t3;

  onStage("parsing");
  const draft = parseReceiptLines(lines);

  const timings: OcrTimings = {
    intakeMs: Math.round(intakeMs),
    preprocessMs: Math.round(preprocessMs),
    modelInitMs: Math.round(modelInitMs),
    recognizeMs: Math.round(recognizeMs),
    totalMs: Math.round(t() - start),
    warmStart,
  };

  return { draft, lines, timings };
}
