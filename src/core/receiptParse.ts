/*
  Receipt text → structured draft (spec §3.4). Pure and React-free.

  This is deliberately PRAGMATIC: OCR output is noisy, and the manual review
  screen (Step 3) is the safety net. The parser only pre-fills it. Heuristics:
    - normalize Arabic-Indic digits first (numbers may be ٠-٩)
    - a line whose trailing token is a money amount = an item (name + price)
    - keyword lines set subtotal / total
    - service / VAT / tax / payment lines are skipped (the uplift factor already
      distributes tax+service from the printed total — we never parse rates)
*/

import type { Item } from "./types.ts";
import { normalizeDigits, parseMoney } from "./parse.ts";
import { roundMoney } from "./rounding.ts";

export interface ParsedReceipt {
  items: Item[];
  subtotal: number; // 0 when not confidently found (review derives it)
  total: number; // 0 when not found
}

const SUBTOTAL_RE = /\bsub[\s-]*total\b/i;
const TOTAL_RE = /\b(grand[\s-]*total|total[\s-]*due|amount[\s-]*due|net[\s-]*total|total)\b/i;
// Lines that are charges, taxes, payment or contact rows — never items, and not
// the grand total. Includes common non-English VAT names (mwst/btw/tva/iva/ust).
const SKIP_RE =
  /\b(service|s\.?\s*charge|svc|vat|tax|mwst|btw|tva|iva|ust|gratuity|tip|discount|change|cash|visa|master|card|balance|round(ing)?|delivery|tel|fax|phone)\b/i;
// Time (12:30) or date (12/06/2026) lines — the trailing number isn't a price.
const DATETIME_RE = /\b\d{1,2}:\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;

let idSeq = 0;
function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${idSeq++}-${Math.random().toString(36).slice(2)}`;
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
  let subtotal = 0;
  let total = 0;

  for (const raw of lines) {
    const line = normalizeDigits(raw).trim();
    if (!line) continue;
    if (DATETIME_RE.test(line)) continue;
    if (line.includes("@")) continue; // email / handle lines

    const ta = extractTrailingAmount(line);

    // Subtotal must be checked before the broader total match.
    if (SUBTOTAL_RE.test(line)) {
      if (ta) subtotal = ta.amount;
      continue;
    }
    if (TOTAL_RE.test(line)) {
      if (ta) total = ta.amount;
      continue;
    }
    if (SKIP_RE.test(line)) continue;

    // An item needs both a name and a price.
    if (!ta || ta.name === "" || ta.amount <= 0) continue;
    items.push(buildItem(ta));
  }

  return { items, subtotal, total };
}
