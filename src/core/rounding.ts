/*
  Money rounding helpers. All money in PayRight is a number of EGP, rounded
  ONLY at display per the split-math contract. These helpers exist so float
  drift never causes an underpay or a spurious extra cent.
*/

/** Cents of slack absorbed when deciding if a value sits exactly on a boundary. */
export const MONEY_EPSILON = 1e-9;

/**
 * Round UP to `dp` decimal places (default 2) — the contract's `ceil(share, 2dp)`.
 *
 * A small epsilon is subtracted before ceiling so a value that is mathematically
 * exact (e.g. 12.34) but stored a hair high in floating point (12.340000000001)
 * does NOT get bumped to 12.35. Values genuinely above the boundary still round up,
 * which is what guarantees the bill is never underpaid.
 */
export function ceilMoney(value: number, dp = 2): number {
  if (!Number.isFinite(value)) throw new RangeError("ceilMoney: value must be finite");
  const factor = 10 ** dp;
  const result = Math.ceil(value * factor - MONEY_EPSILON) / factor;
  return result === 0 ? 0 : result; // normalize -0 → 0 so money never reads "-0.00"
}

/** Standard round-half-up to `dp` places — used for display of non-share figures. */
export function roundMoney(value: number, dp = 2): number {
  if (!Number.isFinite(value)) throw new RangeError("roundMoney: value must be finite");
  const factor = 10 ** dp;
  const result = Math.round((value + MONEY_EPSILON) * factor) / factor;
  return result === 0 ? 0 : result; // normalize -0 → 0
}

/** True when two money amounts are equal within a rounding tolerance (default half a cent). */
export function approxEqual(a: number, b: number, tolerance = 0.005): boolean {
  return Math.abs(a - b) <= tolerance + MONEY_EPSILON;
}
