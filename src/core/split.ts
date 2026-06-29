/*
  The split-math engine (spec §2, CLAUDE.md "split-math contract").

  Pure, side-effect-free, React-free. This is the heart of the app and the main
  correctness risk, so the rules live here in one place and are unit-tested.

  Invariants enforced/relied upon:
    lineTotal   = unitPrice * qty
    subtotal S  = Σ lineTotal
    uplift f    = T / S            (T == S ⇒ f = 1; S == 0 ⇒ throw)
    Σ_p φ(i,p)  = 1 for every assigned item
    share_p     = Σ_i φ(i,p) * lineTotal_i * f   ⇒  Σ_p share_p == T  (exactly)
    final_p     = ceil(share_p, 2dp)  ⇒  totalPaid = Σ final_p ≥ T
*/

import type { Assignment, Bill, Item } from "./types.ts";
import { approxEqual, ceilMoney, roundMoney } from "./rounding.ts";

export type SplitErrorCode =
  | "EMPTY_SUBTOTAL" // S <= 0: can't compute the uplift factor
  | "MIXED_MODE" // one item assigned under more than one split mode
  | "INVALID_QTY"; // by-quantity split against a non-positive qty

export class SplitError extends Error {
  readonly code: SplitErrorCode;
  constructor(code: SplitErrorCode, message: string) {
    super(message);
    this.name = "SplitError";
    this.code = code;
  }
}

/** lineTotal = unitPrice * qty. */
export function lineTotal(item: Item): number {
  return item.unitPrice * item.qty;
}

/** subtotal S = Σ lineTotal over all items. */
export function computeSubtotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + lineTotal(item), 0);
}

/**
 * Uplift factor f = T / S — distributes tax + service proportionally without
 * ever reading a VAT/service rate (the printed total encodes them).
 *   - T == S  ⇒ f = 1 (adds nothing; cash, no tax/service)
 *   - S <= 0  ⇒ throws EMPTY_SUBTOTAL (never divide by zero)
 *   - T < S   ⇒ f < 1, a proportional overall discount (still sums correctly)
 */
export function upliftFactor(subtotal: number, total: number): number {
  if (!(subtotal > 0)) {
    throw new SplitError(
      "EMPTY_SUBTOTAL",
      "Couldn't read a valid subtotal (must be greater than zero).",
    );
  }
  return total / subtotal;
}

/** Group a bill's assignments by item id. */
export function assignmentsByItem(bill: Bill): Map<string, Assignment[]> {
  const map = new Map<string, Assignment[]>();
  for (const a of bill.assignments) {
    const list = map.get(a.itemId);
    if (list) list.push(a);
    else map.set(a.itemId, [a]);
  }
  return map;
}

/**
 * Per-person fraction φ(i,p) of a single item, derived from its assignments.
 * All of an item's assignments must share one mode (the segmented control picks
 * one mode per item); mixing modes throws MIXED_MODE.
 *
 *   whole    → φ = 1 (one sharer)
 *   equal    → φ = 1/m across m sharers
 *   quantity → φ = k / qty   (value = k)
 *   percent  → φ = pct / 100 (value = pct)
 *
 * Fractions for repeated (item, person) pairs are summed, so the caller can
 * validate Σφ = 1 regardless of how assignments were entered.
 */
export function itemFractions(
  item: Item,
  assignments: Assignment[],
): Map<string, number> {
  const fractions = new Map<string, number>();
  if (assignments.length === 0) return fractions;

  const modes = new Set(assignments.map((a) => a.mode));
  if (modes.size > 1) {
    throw new SplitError(
      "MIXED_MODE",
      `Item "${item.name}" is split under multiple modes; pick one.`,
    );
  }
  const mode = assignments[0].mode;

  const add = (personId: string, phi: number) =>
    fractions.set(personId, (fractions.get(personId) ?? 0) + phi);

  switch (mode) {
    case "whole":
      for (const a of assignments) add(a.personId, 1);
      break;
    case "equal": {
      const phi = 1 / assignments.length;
      for (const a of assignments) add(a.personId, phi);
      break;
    }
    case "quantity": {
      if (!(item.qty > 0)) {
        throw new SplitError(
          "INVALID_QTY",
          `Item "${item.name}" has no positive quantity to split by.`,
        );
      }
      for (const a of assignments) add(a.personId, a.value / item.qty);
      break;
    }
    case "percent":
      for (const a of assignments) add(a.personId, a.value / 100);
      break;
  }

  return fractions;
}

/** True when an item's assigned fractions sum to 1 within tolerance. */
export function validateItemFractions(
  item: Item,
  assignments: Assignment[],
  tolerance = 1e-6,
): boolean {
  if (assignments.length === 0) return false;
  const fractions = itemFractions(item, assignments);
  let sum = 0;
  for (const phi of fractions.values()) sum += phi;
  return Math.abs(sum - 1) <= tolerance;
}

/** Item ids that aren't fully assigned (Σφ ≠ 1). The summary is blocked while non-empty. */
export function findUnassignedItems(bill: Bill): string[] {
  const byItem = assignmentsByItem(bill);
  return bill.items
    .filter((item) => !validateItemFractions(item, byItem.get(item.id) ?? []))
    .map((item) => item.id);
}

export function isFullyAssigned(bill: Bill): boolean {
  return findUnassignedItems(bill).length === 0;
}

/**
 * Raw (pre-rounding) share per person: share_p = Σ_i φ(i,p) * lineTotal_i * f.
 *
 * The uplift uses S = Σ lineTotal (not the separately-confirmed bill.subtotal),
 * which is what makes Σ_p share_p == T hold exactly. The review screen guarantees
 * Σ lineTotal ≈ confirmed subtotal before we ever get here.
 *
 * Returns a map keyed by person id; people with no assignments map to 0.
 */
export function computeRawShares(bill: Bill): Map<string, number> {
  const subtotal = computeSubtotal(bill.items);
  const f = upliftFactor(subtotal, bill.total);
  const byItem = assignmentsByItem(bill);

  const shares = new Map<string, number>();
  for (const person of bill.people) shares.set(person.id, 0);

  for (const item of bill.items) {
    const assignments = byItem.get(item.id) ?? [];
    if (assignments.length === 0) continue;
    const lt = lineTotal(item);
    const fractions = itemFractions(item, assignments);
    for (const [personId, phi] of fractions) {
      shares.set(personId, (shares.get(personId) ?? 0) + phi * lt * f);
    }
  }

  return shares;
}

export interface PersonShare {
  personId: string;
  /** Pre-rounding share. Σ raw == total exactly (for a fully assigned bill). */
  raw: number;
  /** Displayed share: ceil(raw, 2dp), or a manual override when provided. */
  final: number;
  isOverridden: boolean;
}

export interface Settlement {
  upliftFactor: number;
  subtotal: number; // Σ lineTotal
  total: number; // T
  shares: PersonShare[];
  /** Σ final. Under pure ceiling this is always ≥ total. */
  totalPaid: number;
  /** totalPaid - total (≥ 0 unless a manual override underpays). */
  overage: number;
  /** Green check when true; red only when an override drops totalPaid below total. */
  isCovered: boolean;
}

export interface SettleOptions {
  /** Manual per-person overrides (person id → exact share). The only path to "red". */
  overrides?: Record<string, number>;
}

/**
 * Compute the full settle-up: per-person final shares, totalPaid, overage, and
 * the green/red validation status.
 */
export function settleUp(bill: Bill, options: SettleOptions = {}): Settlement {
  const subtotal = computeSubtotal(bill.items);
  const f = upliftFactor(subtotal, bill.total);
  const raw = computeRawShares(bill);
  const overrides = options.overrides ?? {};

  const shares: PersonShare[] = bill.people.map((person) => {
    const rawShare = raw.get(person.id) ?? 0;
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, person.id);
    const final = hasOverride ? overrides[person.id] : ceilMoney(rawShare);
    return { personId: person.id, raw: rawShare, final, isOverridden: hasOverride };
  });

  const totalPaid = roundMoney(shares.reduce((sum, s) => sum + s.final, 0));
  const overage = roundMoney(totalPaid - bill.total);
  // Covered when paid meets the bill (within half a cent). Pure ceiling ⇒ always covered.
  const isCovered = totalPaid >= bill.total || approxEqual(totalPaid, bill.total);

  return { upliftFactor: f, subtotal, total: bill.total, shares, totalPaid, overage, isCovered };
}

export interface OwedLine {
  personId: string;
  /** What this person owes the payer (their final share). */
  amount: number;
}

export interface PayerFraming {
  /** Total the payer is owed back by everyone else (they fronted the bill). */
  collects: number;
  /** One line per non-payer with the amount they owe the payer. */
  lines: OwedLine[];
}

/**
 * Single-payer settle-up framing (spec §4): the payer fronted the whole bill, so
 * each other person owes the payer their own final share, and the payer collects
 * the sum of those. With no payer set, there is nothing to frame.
 *
 * Pure: derived entirely from a Settlement; the payer's own share is theirs and
 * is never "owed".
 */
export function whoOwesPayer(
  settlement: Settlement,
  payerId: string | null,
): PayerFraming {
  if (payerId === null) return { collects: 0, lines: [] };

  const lines: OwedLine[] = settlement.shares
    .filter((s) => s.personId !== payerId)
    .map((s) => ({ personId: s.personId, amount: s.final }));

  const collects = roundMoney(lines.reduce((sum, l) => sum + l.amount, 0));
  return { collects, lines };
}
