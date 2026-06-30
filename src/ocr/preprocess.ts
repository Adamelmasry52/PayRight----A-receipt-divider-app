/*
  OpenCV.js preprocessing (spec §3.2). Kept modular: each step is a toggle so we
  can tune which ones help on real receipts. Input and output are canvases.

  Note: PP-OCR is trained on natural images, so the default is a light touch
  (grayscale only). Hard thresholding and deskew are available but off by default
  — flip them on while tuning.
*/

import { getCv } from "./opencv.ts";

export interface PreprocessOptions {
  grayscale: boolean;
  threshold: "none" | "otsu" | "adaptive";
  deskew: boolean;
}

// NOTE: defaulted OFF for now. OpenCV.js (~9-15 MB wasm) was slow/unreliable to
// initialize during the Step-6 proof, and PP-OCR reads color images fine. The
// steps stay here, fully modular, to switch on while tuning.
export const DEFAULT_PREPROCESS: PreprocessOptions = {
  grayscale: false,
  threshold: "none",
  deskew: false,
};

function isNoOp(o: PreprocessOptions): boolean {
  return !o.grayscale && o.threshold === "none" && !o.deskew;
}

export async function preprocess(
  src: HTMLCanvasElement,
  options: PreprocessOptions = DEFAULT_PREPROCESS,
): Promise<HTMLCanvasElement> {
  if (isNoOp(options)) return src;

  const cv = await getCv();
  const mat = cv.imread(src);

  try {
    // Any of these steps needs single-channel input.
    if (options.grayscale || options.threshold !== "none" || options.deskew) {
      cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY);
    }

    if (options.deskew) {
      deskewInPlace(cv, mat);
    }

    if (options.threshold === "otsu") {
      cv.threshold(mat, mat, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    } else if (options.threshold === "adaptive") {
      cv.adaptiveThreshold(
        mat,
        mat,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY,
        31,
        15,
      );
    }

    const out = document.createElement("canvas");
    cv.imshow(out, mat); // writes back as an RGBA canvas
    return out;
  } finally {
    mat.delete();
  }
}

/**
 * Estimate the dominant text angle and rotate the (grayscale) mat upright.
 * Best-effort: small angles only; failures leave the image untouched.
 */
function deskewInPlace(cv: any, mat: any): void {
  let inverted: any | null = null;
  let points: any | null = null;
  try {
    inverted = new cv.Mat();
    cv.threshold(mat, inverted, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    points = new cv.Mat();
    cv.findNonZero(inverted, points);
    if (points.rows < 50) return;

    const rect = cv.minAreaRect(points);
    let angle: number = rect.angle;
    if (angle < -45) angle += 90;
    if (Math.abs(angle) < 0.5 || Math.abs(angle) > 30) return; // ignore noise / over-rotation

    const center = new cv.Point(mat.cols / 2, mat.rows / 2);
    const m = cv.getRotationMatrix2D(center, angle, 1);
    const size = new cv.Size(mat.cols, mat.rows);
    cv.warpAffine(
      mat,
      mat,
      m,
      size,
      cv.INTER_LINEAR,
      cv.BORDER_REPLICATE,
      new cv.Scalar(),
    );
    m.delete();
  } catch {
    // Deskew is best-effort; leave the image as-is on any failure.
  } finally {
    inverted?.delete();
    points?.delete();
  }
}
