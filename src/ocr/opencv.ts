/*
  Lazy OpenCV.js loader. OpenCV is ~9 MB of WASM, so it's dynamically imported
  only when the OCR path runs, and the runtime-ready promise is memoized.
*/

// The @techstark build is an Emscripten module; types are loose, so we keep a
// minimal local shape and cast at the call sites in preprocess.ts.
type Cv = any; // eslint-disable-line @typescript-eslint/no-explicit-any

let cvPromise: Promise<Cv> | null = null;

export function getCv(): Promise<Cv> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod = await import("@techstark/opencv-js");
      const cv: Cv = (mod as unknown as { default?: Cv }).default ?? mod;
      if (cv && typeof cv.Mat === "function") return cv;

      // Wait for the Emscripten runtime. Poll for readiness (robust whether cv is
      // a live module namespace or a mutable object); also hook the official
      // callback when it's assignable.
      await new Promise<void>((resolve, reject) => {
        try {
          cv.onRuntimeInitialized = () => resolve();
        } catch {
          /* frozen namespace — rely on polling below */
        }
        const startedAt = Date.now();
        const timer = setInterval(() => {
          if (cv && typeof cv.Mat === "function") {
            clearInterval(timer);
            resolve();
          } else if (Date.now() - startedAt > 30000) {
            clearInterval(timer);
            reject(new Error("OpenCV.js failed to initialize in time."));
          }
        }, 50);
      });
      return cv;
    })();
  }
  return cvPromise;
}
