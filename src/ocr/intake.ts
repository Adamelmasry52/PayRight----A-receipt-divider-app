/*
  Image intake (spec §3.1). Normalize by FILE TYPE, not device:
    - HEIC/HEIF → JPEG (heic2any)
    - large photos downscaled + compressed (browser-image-compression) BEFORE
      anything else, so OpenCV/OCR aren't handed a 12 MP image
    - decode to a canvas the rest of the pipeline can read

  Nothing is uploaded or stored; everything stays in memory.
*/

import imageCompression from "browser-image-compression";

const HEIC_MIME = ["image/heic", "image/heif"];

function isHeic(file: File): boolean {
  return HEIC_MIME.includes(file.type) || /\.hei[cf]$/i.test(file.name);
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the image."));
    };
    img.src = url;
  });
}

export interface IntakeOptions {
  /** Longest side after downscale (px). */
  maxDimension?: number;
}

/** Convert any accepted image file into a normalized RGBA canvas. */
export async function normalizeImageFile(
  file: File,
  options: IntakeOptions = {},
): Promise<HTMLCanvasElement> {
  let blob: Blob = file;

  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.92,
    });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }

  const compressed = await imageCompression(
    new File([blob], "receipt.jpg", { type: blob.type || "image/jpeg" }),
    {
      maxWidthOrHeight: options.maxDimension ?? 1600,
      maxSizeMB: 3,
      useWebWorker: true,
      initialQuality: 0.9,
    },
  );

  const img = await blobToImage(compressed);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.drawImage(img, 0, 0);
  return canvas;
}

/** Read a canvas as ImageData (RGBA) for the OCR engine. */
export function canvasToImageData(canvas: HTMLCanvasElement): ImageData {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
