/*
  Client side of the Groq vision read path (DEV SCAFFOLDING). Posts the
  normalized image to the server-side /api/scan endpoint (key stays server-side)
  and maps the structured JSON into the same ParsedReceipt shape the PP-OCR path
  produces, so loadDraft → review is unchanged.

  Production target is on-device PaddleOCR-VL; this off-device send is temporary.
*/

import type { Item, ParsedReceipt } from "../core/index.ts";

export class VisionError extends Error {
  readonly code?: number;
  constructor(message: string, code?: number) {
    super(message);
    this.name = "VisionError";
    this.code = code;
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${Math.random().toString(36).slice(2)}`;
}

function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1)); // strip "data:...;base64,"
    };
    reader.onerror = () => reject(new Error("Could not read image bytes."));
    reader.readAsDataURL(blob);
  });
}

interface WireReceipt {
  items?: { name?: unknown; unitPrice?: unknown; qty?: unknown }[];
  subtotal?: unknown;
  total?: unknown;
  service?: unknown;
  vat?: unknown;
  tax?: unknown;
  _model?: string;
}

function mapToDraft(data: WireReceipt): ParsedReceipt {
  const items: Item[] = Array.isArray(data.items)
    ? data.items.map((it) => ({
        id: newId(),
        name: String(it?.name ?? "").trim(),
        unitPrice: num(it?.unitPrice),
        qty: Math.max(1, Math.round(num(it?.qty)) || 1),
      }))
    : [];
  return {
    items,
    subtotal: num(data.subtotal),
    total: num(data.total),
    service: num(data.service),
    tax: num(data.vat ?? data.tax),
  };
}

/** Read a receipt via the server-side vision endpoint. */
export async function readWithVision(blob: Blob): Promise<ParsedReceipt> {
  const imageBase64 = await blobToBase64(blob);

  let res: Response;
  try {
    res = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, mimeType: blob.type || "image/jpeg" }),
    });
  } catch {
    throw new VisionError("Couldn't reach the vision service. Check your connection.");
  }

  if (res.status === 429) {
    throw new VisionError(
      "The vision service is busy (rate limited). Try again in a moment, or enter the items manually.",
      429,
    );
  }
  if (!res.ok) {
    let message = "Couldn't read the receipt with the vision model.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new VisionError(message, res.status);
  }

  const data = (await res.json()) as WireReceipt;
  return mapToDraft(data);
}
