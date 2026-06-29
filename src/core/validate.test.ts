import { describe, it, expect } from "vitest";
import type { Item } from "./types.ts";
import { validateBillDraft } from "./validate.ts";

let seq = 0;
const item = (unitPrice: number, qty = 1): Item => ({
  id: `i${seq++}`,
  name: "x",
  unitPrice,
  qty,
});

describe("validateBillDraft", () => {
  it("accepts a consistent draft and computes the uplift factor", () => {
    const v = validateBillDraft({
      items: [item(100), item(50, 2)], // sum = 200
      subtotal: 200,
      total: 220,
    });
    expect(v.itemSum).toBe(200);
    expect(v.subtotalMatchesItems).toBe(true);
    expect(v.discrepancy).toBe(0);
    expect(v.upliftFactor).toBeCloseTo(1.1, 10);
    expect(v.canContinue).toBe(true);
  });

  it("f = 1 when total equals subtotal (no tax/service)", () => {
    const v = validateBillDraft({ items: [item(150)], subtotal: 150, total: 150 });
    expect(v.upliftFactor).toBe(1);
    expect(v.canContinue).toBe(true);
  });

  it("allows an overall discount (total < subtotal) with f < 1", () => {
    const v = validateBillDraft({ items: [item(200)], subtotal: 200, total: 180 });
    expect(v.upliftFactor).toBeCloseTo(0.9, 10);
    expect(v.canContinue).toBe(true);
  });

  it("blocks and reports the discrepancy when subtotal ≠ Σ lineTotal", () => {
    const v = validateBillDraft({
      items: [item(100), item(95)], // sum = 195
      subtotal: 200,
      total: 220,
    });
    expect(v.subtotalMatchesItems).toBe(false);
    expect(v.discrepancy).toBe(5); // confirmed 200 is 5 over the items
    expect(v.canContinue).toBe(false);
  });

  it("treats a tiny rounding difference as a match", () => {
    const v = validateBillDraft({
      items: [item(33.33), item(33.33), item(33.34)], // 100.00
      subtotal: 100,
      total: 100,
    });
    expect(v.subtotalMatchesItems).toBe(true);
    expect(v.canContinue).toBe(true);
  });

  it("blocks on a missing subtotal and never divides by zero", () => {
    const v = validateBillDraft({ items: [item(100)], subtotal: 0, total: 110 });
    expect(v.subtotalPositive).toBe(false);
    expect(v.upliftFactor).toBeNull(); // S=0 guard: no throw, no division
    expect(v.canContinue).toBe(false);
  });

  it("blocks on a non-positive total", () => {
    const v = validateBillDraft({ items: [item(100)], subtotal: 100, total: 0 });
    expect(v.totalPositive).toBe(false);
    expect(v.canContinue).toBe(false);
  });

  it("flags rows with bad qty or price", () => {
    const bad = item(-5, 0); // both wrong
    const v = validateBillDraft({ items: [bad], subtotal: 0, total: 0 });
    expect(v.itemIssues).toHaveLength(1);
    expect(v.itemIssues[0].problems.sort()).toEqual(["price", "qty"]);
    expect(v.canContinue).toBe(false);
  });

  it("blocks an empty bill", () => {
    const v = validateBillDraft({ items: [], subtotal: 0, total: 0 });
    expect(v.hasItems).toBe(false);
    expect(v.canContinue).toBe(false);
  });
});
