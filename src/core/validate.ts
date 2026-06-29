/*
  Review-screen validation (spec §2 "Guards the UI must enforce").

  Pure and React-free, like the rest of src/core. The component renders these
  results; it does not re-implement the rules. The same validator runs whether
  items were typed manually or pre-filled by OCR.
*/

import type { Item } from "./types.ts";
import { computeSubtotal, upliftFactor } from "./split.ts";
import { approxEqual, roundMoney } from "./rounding.ts";

export interface ItemIssue {
  itemId: string;
  /** Which fields are invalid on this row. */
  problems: ("price" | "qty")[];
}

export interface BillDraftInput {
  items: Item[];
  /** Confirmed subtotal (S). May be derived from the item sum on the screen. */
  subtotal: number;
  /** Confirmed printed grand total (T). */
  total: number;
}

export interface BillDraftValidation {
  /** Σ lineTotal over the items, rounded for display. */
  itemSum: number;
  hasItems: boolean;
  itemIssues: ItemIssue[];
  subtotalPositive: boolean;
  /** Σ lineTotal equals the confirmed subtotal within tolerance. */
  subtotalMatchesItems: boolean;
  /** subtotal − itemSum, signed and rounded (for the inline discrepancy message). */
  discrepancy: number;
  totalPositive: boolean;
  /** Displayed uplift f = T/S; null when S is not valid (never divides by zero). */
  upliftFactor: number | null;
  /** True only when every guard passes — drives the Continue button. */
  canContinue: boolean;
}

/** Validate a draft bill before advancing past the review screen. */
export function validateBillDraft(
  draft: BillDraftInput,
  tolerance = 0.005,
): BillDraftValidation {
  const { items, subtotal, total } = draft;

  const itemSum = roundMoney(computeSubtotal(items));
  const hasItems = items.length > 0;

  const itemIssues: ItemIssue[] = [];
  for (const item of items) {
    const problems: ("price" | "qty")[] = [];
    if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) problems.push("price");
    if (!Number.isFinite(item.qty) || item.qty <= 0) problems.push("qty");
    if (problems.length > 0) itemIssues.push({ itemId: item.id, problems });
  }

  const subtotalPositive = Number.isFinite(subtotal) && subtotal > 0;
  const subtotalMatchesItems =
    subtotalPositive && approxEqual(subtotal, itemSum, tolerance);
  const discrepancy = roundMoney(subtotal - itemSum);
  const totalPositive = Number.isFinite(total) && total > 0;

  // Uplift is shown for transparency; guard S=0 so we never divide by zero.
  let f: number | null = null;
  if (subtotalPositive) {
    try {
      f = upliftFactor(subtotal, total);
    } catch {
      f = null;
    }
  }

  const canContinue =
    hasItems &&
    itemIssues.length === 0 &&
    subtotalPositive &&
    subtotalMatchesItems &&
    totalPositive;

  return {
    itemSum,
    hasItems,
    itemIssues,
    subtotalPositive,
    subtotalMatchesItems,
    discrepancy,
    totalPositive,
    upliftFactor: f,
    canContinue,
  };
}
