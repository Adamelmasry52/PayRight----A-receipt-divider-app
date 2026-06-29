import { describe, it, expect } from "vitest";
import type { Assignment, Bill, Item, Person, SplitMode } from "./types.ts";
import {
  SplitError,
  computeSubtotal,
  upliftFactor,
  itemFractions,
  validateItemFractions,
  isFullyAssigned,
  findUnassignedItems,
  computeRawShares,
  settleUp,
} from "./split.ts";
import { MONEY_EPSILON } from "./rounding.ts";

// ---- test builders -------------------------------------------------------

let seq = 0;
const item = (name: string, unitPrice: number, qty = 1): Item => ({
  id: `i${seq++}`,
  name,
  unitPrice,
  qty,
});

const person = (name: string, isPayer = false): Person => ({
  id: `p_${name}`,
  name,
  avatar: "cat",
  color: "var(--accent-0)",
  isPayer,
});

const assign = (
  itemId: string,
  personId: string,
  mode: SplitMode,
  value = 0,
): Assignment => ({ itemId, personId, mode, value });

const bill = (over: Partial<Bill>): Bill => ({
  currency: "EGP",
  items: [],
  subtotal: 0,
  total: 0,
  people: [],
  assignments: [],
  payerId: null,
  ...over,
});

const sumRaw = (b: Bill) =>
  [...computeRawShares(b).values()].reduce((a, x) => a + x, 0);

// ---- uplift factor -------------------------------------------------------

describe("upliftFactor", () => {
  it("f = 1 when T == S (cash, no tax/service)", () => {
    expect(upliftFactor(150, 150)).toBe(1);
  });

  it("distributes tax/service: f = T / S", () => {
    expect(upliftFactor(200, 220)).toBeCloseTo(1.1, 10);
  });

  it("handles an overall discount (T < S) without breaking", () => {
    expect(upliftFactor(200, 180)).toBeCloseTo(0.9, 10);
  });

  it("throws EMPTY_SUBTOTAL on S == 0 (never divides by zero)", () => {
    expect(() => upliftFactor(0, 100)).toThrow(SplitError);
    try {
      upliftFactor(0, 100);
    } catch (e) {
      expect((e as SplitError).code).toBe("EMPTY_SUBTOTAL");
    }
  });

  it("throws EMPTY_SUBTOTAL on negative subtotal", () => {
    expect(() => upliftFactor(-5, 100)).toThrow(SplitError);
  });
});

// ---- raw shares sum exactly to total, under each mode --------------------

describe("raw shares sum exactly to the total", () => {
  const p1 = person("ali", true);
  const p2 = person("sara");

  it("whole mode", () => {
    const a = item("Burger", 100);
    const b = item("Pasta", 50);
    const b1 = bill({
      items: [a, b],
      total: 165, // S = 150, f = 1.1
      people: [p1, p2],
      assignments: [assign(a.id, p1.id, "whole"), assign(b.id, p2.id, "whole")],
    });
    const shares = computeRawShares(b1);
    expect(shares.get(p1.id)).toBeCloseTo(110, 10);
    expect(shares.get(p2.id)).toBeCloseTo(55, 10);
    expect(sumRaw(b1)).toBeCloseTo(165, 10);
  });

  it("equal mode", () => {
    const a = item("Platter", 100);
    const b1 = bill({
      items: [a],
      total: 110, // f = 1.1
      people: [p1, p2],
      assignments: [assign(a.id, p1.id, "equal"), assign(a.id, p2.id, "equal")],
    });
    expect(computeRawShares(b1).get(p1.id)).toBeCloseTo(55, 10);
    expect(sumRaw(b1)).toBeCloseTo(110, 10);
  });

  it("quantity mode", () => {
    const a = item("Tea", 30, 3); // lineTotal 90
    const b1 = bill({
      items: [a],
      total: 90, // f = 1
      people: [p1, p2],
      assignments: [
        assign(a.id, p1.id, "quantity", 2),
        assign(a.id, p2.id, "quantity", 1),
      ],
    });
    const shares = computeRawShares(b1);
    expect(shares.get(p1.id)).toBeCloseTo(60, 10);
    expect(shares.get(p2.id)).toBeCloseTo(30, 10);
    expect(sumRaw(b1)).toBeCloseTo(90, 10);
  });

  it("percent mode", () => {
    const a = item("Cake", 200);
    const b1 = bill({
      items: [a],
      total: 220, // f = 1.1
      people: [p1, p2],
      assignments: [
        assign(a.id, p1.id, "percent", 60),
        assign(a.id, p2.id, "percent", 40),
      ],
    });
    const shares = computeRawShares(b1);
    expect(shares.get(p1.id)).toBeCloseTo(132, 10);
    expect(shares.get(p2.id)).toBeCloseTo(88, 10);
    expect(sumRaw(b1)).toBeCloseTo(220, 10);
  });

  it("mixed-mode bill (different modes across items)", () => {
    const a = item("Steak", 100); // whole → p1
    const b = item("Salad", 60); // equal → p1, p2
    const c = item("Juice", 20, 2); // quantity → p2 takes both
    const b1 = bill({
      items: [a, b, c],
      total: 230, // S = 200, f = 1.15
      people: [p1, p2],
      assignments: [
        assign(a.id, p1.id, "whole"),
        assign(b.id, p1.id, "equal"),
        assign(b.id, p2.id, "equal"),
        assign(c.id, p2.id, "quantity", 2),
      ],
    });
    // p1: (100 + 30) * 1.15 = 149.5 ; p2: (30 + 40) * 1.15 = 80.5
    const shares = computeRawShares(b1);
    expect(shares.get(p1.id)).toBeCloseTo(149.5, 10);
    expect(shares.get(p2.id)).toBeCloseTo(80.5, 10);
    expect(sumRaw(b1)).toBeCloseTo(230, 10);
    expect(isFullyAssigned(b1)).toBe(true);
  });
});

// ---- per-item fraction invariants ---------------------------------------

describe("itemFractions / Σφ = 1", () => {
  const p1 = person("a");
  const p2 = person("b");
  const p3 = person("c");

  it("by-quantity fractions are k/qty and sum to 1 when Σk = qty", () => {
    const a = item("Shisha", 50, 4);
    const as = [
      assign(a.id, p1.id, "quantity", 3),
      assign(a.id, p2.id, "quantity", 1),
    ];
    const f = itemFractions(a, as);
    expect(f.get(p1.id)).toBeCloseTo(0.75, 10);
    expect(f.get(p2.id)).toBeCloseTo(0.25, 10);
    expect(validateItemFractions(a, as)).toBe(true);
  });

  it("by-quantity is invalid when Σk ≠ qty", () => {
    const a = item("Shisha", 50, 4);
    const as = [assign(a.id, p1.id, "quantity", 3)]; // only 3 of 4 units
    expect(validateItemFractions(a, as)).toBe(false);
  });

  it("custom percentages must sum to 100", () => {
    const a = item("Mezze", 90);
    const valid = [
      assign(a.id, p1.id, "percent", 50),
      assign(a.id, p2.id, "percent", 30),
      assign(a.id, p3.id, "percent", 20),
    ];
    expect(validateItemFractions(a, valid)).toBe(true);

    const invalid = [
      assign(a.id, p1.id, "percent", 50),
      assign(a.id, p2.id, "percent", 30), // sums to 80
    ];
    expect(validateItemFractions(a, invalid)).toBe(false);
  });

  it("equal mode gives 1/m and sums to 1", () => {
    const a = item("Pizza", 120);
    const as = [
      assign(a.id, p1.id, "equal"),
      assign(a.id, p2.id, "equal"),
      assign(a.id, p3.id, "equal"),
    ];
    const f = itemFractions(a, as);
    expect(f.get(p1.id)).toBeCloseTo(1 / 3, 10);
    expect(validateItemFractions(a, as)).toBe(true);
  });

  it("throws MIXED_MODE when one item has more than one mode", () => {
    const a = item("Combo", 100);
    const as = [
      assign(a.id, p1.id, "equal"),
      assign(a.id, p2.id, "percent", 50),
    ];
    expect(() => itemFractions(a, as)).toThrow(SplitError);
    try {
      itemFractions(a, as);
    } catch (e) {
      expect((e as SplitError).code).toBe("MIXED_MODE");
    }
  });

  it("flags unassigned items so the summary can block", () => {
    const a = item("Assigned", 50);
    const b = item("Orphan", 50);
    const b1 = bill({
      items: [a, b],
      total: 100,
      people: [p1],
      assignments: [assign(a.id, p1.id, "whole")],
    });
    expect(isFullyAssigned(b1)).toBe(false);
    expect(findUnassignedItems(b1)).toEqual([b.id]);
  });
});

// ---- rounding / validation ----------------------------------------------

describe("settleUp — ceiling never underpays", () => {
  const p1 = person("a", true);
  const p2 = person("b");
  const p3 = person("c");

  it("ceil(share) ≥ raw for every person, and totalPaid ≥ total", () => {
    // 100 split equally 3 ways = 33.333... each → ceil 33.34, paid 100.02.
    const a = item("Mixed Grill", 100);
    const b1 = bill({
      items: [a],
      total: 100,
      people: [p1, p2, p3],
      assignments: [
        assign(a.id, p1.id, "equal"),
        assign(a.id, p2.id, "equal"),
        assign(a.id, p3.id, "equal"),
      ],
    });
    const s = settleUp(b1);
    for (const sh of s.shares) expect(sh.final).toBeGreaterThanOrEqual(sh.raw);
    expect(s.totalPaid).toBeGreaterThanOrEqual(s.total);
    expect(s.totalPaid).toBe(100.02);
    expect(s.overage).toBe(0.02);
    expect(s.isCovered).toBe(true);
  });

  it("is exactly covered (green) when shares land on clean cents", () => {
    const a = item("Burger", 100);
    const b = item("Pasta", 50);
    const b1 = bill({
      items: [a, b],
      total: 165,
      people: [p1, p2],
      assignments: [assign(a.id, p1.id, "whole"), assign(b.id, p2.id, "whole")],
    });
    const s = settleUp(b1);
    expect(s.totalPaid).toBe(165);
    expect(s.overage).toBe(0);
    expect(s.isCovered).toBe(true);
  });

  it("goes red only when a manual override drops a share below what's owed", () => {
    const a = item("Burger", 100);
    const b = item("Pasta", 50);
    const b1 = bill({
      items: [a, b],
      total: 165,
      people: [p1, p2],
      assignments: [assign(a.id, p1.id, "whole"), assign(b.id, p2.id, "whole")],
    });
    const s = settleUp(b1, { overrides: { [p1.id]: 100 } }); // owes 110, pays 100
    expect(s.totalPaid).toBe(155);
    expect(s.overage).toBe(-10);
    expect(s.isCovered).toBe(false);
    expect(s.shares.find((x) => x.personId === p1.id)?.isOverridden).toBe(true);
  });

  it("propagates EMPTY_SUBTOTAL when there is nothing to split", () => {
    const b1 = bill({ items: [], total: 100, people: [p1] });
    expect(() => settleUp(b1)).toThrow(SplitError);
  });
});

describe("computeSubtotal", () => {
  it("sums lineTotal = unitPrice * qty", () => {
    expect(computeSubtotal([item("a", 30, 3), item("b", 10, 2)])).toBe(110);
  });
});

describe("ceiling boundary vs MONEY_EPSILON", () => {
  const p1 = person("solo", true);

  it("a share a hair above a cent boundary ceils UP, never down", () => {
    // One person takes a whole 10.00 item; a 0.001% uplift makes the raw share
    // 10.0001 — genuinely above 10.00, far larger than float noise. It must
    // ceil to 10.01 so the bill is never underpaid.
    const a = item("Mint Tea", 10);
    const b1 = bill({
      items: [a],
      total: 10.0001, // f = 1.00001 → raw share = 10.0001
      people: [p1],
      assignments: [assign(a.id, p1.id, "whole")],
    });
    const s = settleUp(b1);
    expect(s.shares[0].raw).toBeCloseTo(10.0001, 9);
    expect(s.shares[0].final).toBe(10.01); // up, not 10.00
    expect(s.totalPaid).toBeGreaterThanOrEqual(s.total);

    // The guard epsilon is float-noise scale: orders of magnitude below a real
    // sub-cent amount, so it can absorb 1e-16 jitter without ever eating 0.0001.
    expect(MONEY_EPSILON).toBeLessThan(0.0001);
  });

  it("a share that is mathematically an exact cent stays put despite float jitter", () => {
    // 0.1 + 0.2 worth of items → raw 0.30000000000000004; must ceil to 0.30,
    // not 0.31. This is the noise the epsilon exists to absorb.
    const a = item("a", 0.1);
    const b = item("b", 0.2);
    const b1 = bill({
      items: [a, b],
      total: 0.3, // f = 1, raw = 0.1 + 0.2 = 0.30000000000000004
      people: [p1],
      assignments: [assign(a.id, p1.id, "whole"), assign(b.id, p1.id, "whole")],
    });
    const s = settleUp(b1);
    expect(s.shares[0].final).toBe(0.3);
  });
});
