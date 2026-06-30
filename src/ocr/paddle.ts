/*
  PaddleOCR (PP-OCRv5) wrapper, running fully in-browser on onnxruntime-web
  (WASM backend). The service is created once (models loaded + cached) and reused.
*/

import type { OrtModule, PaddleOcrService } from "paddleocr";
import { loadOcrModels } from "./models.ts";

// onnxruntime-web hosts its own WASM; point it at the matching CDN build so Vite
// doesn't need to bundle/serve the .wasm files.
const ORT_WASM_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";

let servicePromise: Promise<PaddleOcrService> | null = null;

/** Lazily create the OCR service (first call downloads + caches the models). */
export function initOcr(): Promise<PaddleOcrService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const [ort, { PaddleOcrService }, models] = await Promise.all([
        import("onnxruntime-web"),
        import("paddleocr"),
        loadOcrModels(),
      ]);
      ort.env.wasm.wasmPaths = ORT_WASM_BASE;

      return PaddleOcrService.createInstance({
        ort: ort as unknown as OrtModule,
        detection: { modelBuffer: models.detBuffer },
        recognition: {
          modelBuffer: models.recBuffer,
          charactersDictionary: models.dictionary,
        },
      });
    })();
  }
  return servicePromise;
}

/** Recognize text and return it as reading-order line strings. */
export async function recognizeLines(
  service: PaddleOcrService,
  imageData: ImageData,
): Promise<string[]> {
  const results = await service.recognize({
    width: imageData.width,
    height: imageData.height,
    data: new Uint8Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength,
    ),
  });

  // Group the reading-order results into lines and join each line's text.
  const grouped = service.processRecognition(results);
  return grouped.lines
    .map((line) => line.map((r) => r.text).join(" ").trim())
    .filter((s) => s.length > 0);
}
