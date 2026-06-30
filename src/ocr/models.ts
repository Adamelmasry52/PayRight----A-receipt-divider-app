/*
  PP-OCRv5 model loading. The detection + recognition ONNX models and the
  character dictionary are fetched once and kept in the Cache Storage API, so
  subsequent scans (and offline use) reuse them — "downloads once and caches".

  The base URL is overridable via VITE_OCR_MODEL_BASE so production can self-host
  the ~21 MB of model files instead of the default CDN.
*/

const MODEL_BASE =
  (import.meta.env.VITE_OCR_MODEL_BASE as string | undefined) ??
  "https://cdn.jsdelivr.net/gh/X3ZvaWQ/paddleocr.js@main/assets";

const FILES = {
  det: "PP-OCRv5_mobile_det_infer.onnx",
  rec: "PP-OCRv5_mobile_rec_infer.onnx",
  dict: "ppocrv5_dict.txt",
} as const;

const CACHE_NAME = "payright-ocr-models-v1";

async function cachedFetch(url: string): Promise<Response> {
  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) return hit;
    const res = await fetch(url);
    if (res.ok) await cache.put(url, res.clone());
    return res;
  }
  return fetch(url);
}

export interface OcrModels {
  detBuffer: ArrayBuffer;
  recBuffer: ArrayBuffer;
  dictionary: string[];
}

/** Fetch (and cache) the PP-OCRv5 detection model, recognition model, and dictionary. */
export async function loadOcrModels(): Promise<OcrModels> {
  const [detBuffer, recBuffer, dictText] = await Promise.all([
    cachedFetch(`${MODEL_BASE}/${FILES.det}`).then((r) => r.arrayBuffer()),
    cachedFetch(`${MODEL_BASE}/${FILES.rec}`).then((r) => r.arrayBuffer()),
    cachedFetch(`${MODEL_BASE}/${FILES.dict}`).then((r) => r.text()),
  ]);

  // Dictionary is one character per line; index 0 is the CTC blank and order
  // maps to the model's label indices. The file omits the space character that
  // PP-OCRv5 was trained with (use_space_char), so its final label index has no
  // entry and intra-region spaces get dropped ("2xLatteMacchiato"). Append the
  // space so the recognizer can emit word gaps.
  const dictionary = dictText.replace(/\n$/, "").split("\n");
  dictionary.push(" ");
  return { detBuffer, recBuffer, dictionary };
}
