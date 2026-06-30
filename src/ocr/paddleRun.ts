/*
  On-device PP-OCRv5 execution, isolated in its own module.

  Everything heavy lives behind this file: it statically imports paddle.ts (→
  onnxruntime-web, paddleocr) and preprocess.ts (→ @techstark/opencv-js). The
  pipeline only reaches it via a dynamic import() that is gated on a build-time
  constant, so a `VITE_OCR_ENGINE=vision` production build tree-shakes this whole
  subgraph — and the ~25 MB ORT wasm + ~15 MB OpenCV — out of dist entirely.

  Do NOT add a static import of this module anywhere; that would defeat the split.
*/

import { parseReceiptLines, type ParsedReceipt } from "../core/index.ts";
import { canvasToImageData } from "./intake.ts";
import { preprocess, DEFAULT_PREPROCESS, type PreprocessOptions } from "./preprocess.ts";
import { initOcr, recognizeLines } from "./paddle.ts";

export async function runPaddleEngine(
  canvas: HTMLCanvasElement,
  preOpts: PreprocessOptions = DEFAULT_PREPROCESS,
): Promise<{ draft: ParsedReceipt; lines: string[] }> {
  const processed = await preprocess(canvas, preOpts);
  const service = await initOcr();
  const lines = await recognizeLines(service, canvasToImageData(processed));
  return { draft: parseReceiptLines(lines), lines };
}
