/*
  Receipt text → structured draft (spec §3.4). Pure and React-free.

  The model here is LABELED FIELDS vs ITEMS:
    - Subtotal / Total / Service / VAT-Tax lines are recognized labels and are
      NEVER items — they populate their own fields.
    - Items are the genuine name+price lines left after labels (and payment/
      contact rows) are removed.

  Matching is case- and whitespace-insensitive (so "MwSt" or a space-stripped
  "MwStNr" still matches) and covers Arabic equivalents. Numbers are normalized
  from Arabic-Indic digits first. Deliberately pragmatic — the manual review
  screen is the safety net; we do NOT chase per-receipt formatting noise.
*/

import type { Item } from "./types.ts";
import { normalizeDigits, parseMoney } from "./parse.ts";
import { roundMoney } from "./rounding.ts";

export interface ParsedReceipt {
  items: Item[];
  /** Labeled fields (0 when not found). subtotal/total feed the bill; */
  subtotal: number;
  total: number;
  /** service & tax are surfaced for transparency/debugging, not for the math. */
  service: number;
  tax: number;
}

type LabelField = "subtotal" | "total" | "service" | "tax";

/*
  Keyword sets in space-stripped, lower-cased form. Checked in priority order so
  "subtotal" wins over "total" (which is a substring of it). Arabic terms are
  included with their common hamza variants.
*/
const LABEL_KEYWORDS: Record<LabelField, string[]> = {
  subtotal: ["subtotal", "الفرعي", "المجموعالفرعي"],
  service: ["servicecharge", "service", "svc", "خدمة", "الخدمة"],
  tax: ["vat", "mwst", "tva", "btw", "iva", "gst", "ust", "tax", "ضريبة", "الضريبة"],
  total: [
    "grandtotal",
    "totaldue",
    "amountdue",
    "nettotal",
    "total",
    "الاجمالي",
    "الإجمالي",
    "إجمالي",
    "اجمالي",
    "المجموع",
    "الاجمالى",
  ],
};
const LABEL_ORDER: LabelField[] = ["subtotal", "service", "tax", "total"];

// Payment / change / contact rows — not labels, not items.
const PAYMENT_KEYWORDS = [
  "cash",
  "change",
  "visa",
  "mastercard",
  "balance",
  "rounding",
  "delivery",
  "tel",
  "fax",
  "phone",
  "نقدي",
  "الباقي",
  "مدفوع",
  "فيزا",
  "هاتف",
];

// Time (12:30) or date (12/06/2026) lines — the trailing number isn't a price.
const DATETIME_RE = /\b\d{1,2}:\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;

let idSeq = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${idSeq++}-${Math.random().toString(36).slice(2)}`;
}

/** Lower-case and strip all whitespace, for whitespace-insensitive matching. */
function squash(line: string): string {
  return line.toLowerCase().replace(/\s+/g, "");
}

function classifyLabel(squashed: string): LabelField | null {
  for (const field of LABEL_ORDER) {
    if (LABEL_KEYWORDS[field].some((kw) => squashed.includes(kw))) return field;
  }
  return null;
}

interface TrailingAmount {
  name: string;
  amount: number;
}

/** Pull the last money-looking token off a line; everything before it is the name. */
function extractTrailingAmount(line: string): TrailingAmount | null {
  const matches = [...line.matchAll(/-?\d[\d.,]*/g)];
  if (matches.length === 0) return null;

  const last = matches[matches.length - 1];
  const amount = parseMoney(last[0]);
  if (amount === null) return null;

  const name = line
    .slice(0, last.index)
    .replace(/[\s:.–—-]+$/, "")
    .trim();
  return { name, amount };
}

/** Detect a leading ("2 Coke") or trailing ("Coke x2") quantity in the name. */
function splitQty(name: string): { name: string; qty: number } {
  const lead = name.match(/^(\d{1,2})\s*[xX*]?\s+(.+)$/);
  if (lead) return { qty: Number(lead[1]), name: lead[2].trim() };
  const trail = name.match(/^(.+?)\s*[xX*]\s*(\d{1,2})$/);
  if (trail) return { qty: Number(trail[2]), name: trail[1].trim() };
  return { name, qty: 1 };
}

function buildItem(ta: TrailingAmount): Item {
  const { name, qty } = splitQty(ta.name);
  // The trailing amount is treated as the LINE total; derive unit price.
  const unitPrice = qty > 1 ? roundMoney(ta.amount / qty) : ta.amount;
  return { id: newId(), name, unitPrice, qty };
}

/**
 * Parse OCR'd receipt lines (top-to-bottom, each a recognized text line) into a
 * draft bill. Imperfect by design — it feeds the editable review screen.
 */
export function parseReceiptLines(lines: string[]): ParsedReceipt {
  const items: Item[] = [];
  const fields: Record<LabelField, number> = {
    subtotal: 0,
    total: 0,
    service: 0,
    tax: 0,
  };

  for (const raw of lines) {
    const line = normalizeDigits(raw).trim();
    if (!line) continue;
    if (DATETIME_RE.test(line)) continue;
    if (line.includes("@")) continue; // email / handle lines

    const squashed = squash(line);
    const ta = extractTrailingAmount(line);

    // Labeled charge/total field: classified, never an item (even without an amount).
    const label = classifyLabel(squashed);
    if (label) {
      if (ta) fields[label] = ta.amount;
      continue;
    }

    if (PAYMENT_KEYWORDS.some((kw) => squashed.includes(kw))) continue;

    // An item needs both a name and a price.
    if (!ta || ta.name === "" || ta.amount <= 0) continue;
    items.push(buildItem(ta));
  }

  return { items, ...fields };
}
