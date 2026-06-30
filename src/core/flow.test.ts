/*
  Logic-level end-to-end flow tests (no DOM). These thread the REAL core helpers
  the screens use — validateBillDraft → addPerson → tapSharer/switchMode/
  setPersonValue → isFullyAssigned/findUnassignedItems → settleUp →
  encodeBillPayload → decodeBillPayload → settleUp — to cover the critical path
  and the awkward real-user paths that the per-module tests don't.
*/

import { describe, it, expect } from "vitest";
import type { Bill, Item } from "./types.ts";
import {
  addPerson,
  decodeBillPayload,
  encodeBillPayload,
  findUnassignedItems,
  isFullyAssigned,
  setPersonValue,
  settleUp,
  switchMode,
  SplitError,
  tapSharer,
  validateBillDraft,
} from "./index.ts";

let seq = 0;
const mkItem = (name: string, unitPrice: number, qty = 1): Item => ({
  id: `i${seq++}`,
  name,
  unitPrice,
  qty,
});
const baseBill = (over: Partial<Bill>): Bill => ({
  currency: "EGP",
  items: [],
  subtotal: 0,
  total: 0,
  people: [],
  assignments: [],
  payerId: null,
  ...over,
});

/** Equivalence after a share round-trip: same multiset of final shares. */
function finalsSorted(b: Bill, overrides: Record<string, number> = {}) {
  return settleUp(b, { overrides })
    .shares.map((s) => s.final)
    .sort((a, z) => a - z);
}

describe("critical path: draft → validate → people → assign → settle → share → open", () => {
  it("runs a whole-item split end to end with a payer", () => {
    const items = [mkItem("Burger", 100), mkItem("Pasta", 50)];
    const bill = baseBill({ items, subtotal: 150, total: 165 });

    // Review gate.
    const v = validateBillDraft({
      items: bill.items,
      subtotal: bill.subtotal,
      total: bill.total,
    });
    expect(v.canContinue).toBe(true);
    expect(v.upliftFactor).toBeCloseTo(1.1, 10);

    // People + payer.
    bill.people = addPerson(addPerson(bill.people, "Ali"), "Sara");
    const [ali, sara] = bill.people;
    bill.payerId = ali.id;

    // Assign (tap-to-assign whole).
    bill.assignments = tapSharer(bill.assignments, items[0].id, ali.id);
    bill.assignments = tapSharer(bill.assignments, items[1].id, sara.id);
    expect(isFullyAssigned(bill)).toBe(true);

    // Settle.
    const s = settleUp(bill);
    expect(s.totalPaid).toBeGreaterThanOrEqual(165);
    expect(s.isCovered).toBe(true);

    // Share → open (cold decode) preserves shares.
    const decoded = decodeBillPayload(encodeBillPayload(bill));
    expect(decoded).not.toBeNull();
    expect(finalsSorted(decoded!.bill)).toEqual(finalsSorted(bill));
    expect(decoded!.bill.people.find((p) => p.id === decoded!.bill.payerId)?.name).toBe(
      "Ali",
    );
  });

  it("carries overrides through share → open (recipient sees the adjusted split)", () => {
    const items = [mkItem("Burger", 100), mkItem("Pasta", 50)];
    const bill = baseBill({ items, subtotal: 150, total: 165 });
    bill.people = addPerson(addPerson(bill.people, "Ali"), "Sara");
    const [ali, sara] = bill.people;
    bill.payerId = ali.id;
    bill.assignments = tapSharer(bill.assignments, items[0].id, ali.id);
    bill.assignments = tapSharer(bill.assignments, items[1].id, sara.id);

    const overrides = { [ali.id]: 100 }; // owes 110, set to 100 → shortfall
    const decoded = decodeBillPayload(encodeBillPayload(bill, overrides))!;
    const s = settleUp(decoded.bill, { overrides: decoded.overrides });
    expect(s.totalPaid).toBe(155);
    expect(s.isCovered).toBe(false);
  });
});

describe("split modes through the flow", () => {
  it("all-shared (equal among everyone) sums to total and round-trips", () => {
    const pizza = mkItem("Sharing Platter", 90);
    const bill = baseBill({ items: [pizza], subtotal: 90, total: 90 });
    bill.people = ["Ali", "Sara", "Omar"].reduce((ppl, n) => addPerson(ppl, n), bill.people);

    for (const p of bill.people) {
      bill.assignments = tapSharer(bill.assignments, pizza.id, p.id);
    }
    expect(isFullyAssigned(bill)).toBe(true);

    const s = settleUp(bill);
    expect(s.totalPaid).toBeGreaterThanOrEqual(90); // 30.00 × 3
    expect(finalsSorted(decodeBillPayload(encodeBillPayload(bill))!.bill)).toEqual(
      finalsSorted(bill),
    );
  });

  it("by-quantity prunes 0-rows on share without changing the result", () => {
    const tea = mkItem("Tea", 15, 4); // lineTotal 60
    const bill = baseBill({ items: [tea], subtotal: 60, total: 60 });
    bill.people = ["Ali", "Sara", "Omar"].reduce((ppl, n) => addPerson(ppl, n), bill.people);
    const [ali, sara] = bill.people;

    bill.assignments = switchMode(
      bill.assignments,
      tea.id,
      "quantity",
      bill.people.map((p) => p.id),
    );
    bill.assignments = setPersonValue(bill.assignments, tea.id, ali.id, "quantity", 2);
    bill.assignments = setPersonValue(bill.assignments, tea.id, sara.id, "quantity", 2);
    expect(isFullyAssigned(bill)).toBe(true);

    const decoded = decodeBillPayload(encodeBillPayload(bill))!;
    expect(decoded.bill.assignments).toHaveLength(2); // Omar's 0-row pruned
    expect(finalsSorted(decoded.bill)).toEqual(finalsSorted(bill));
  });
});

describe("awkward real-user paths", () => {
  it("empty bill: blocked at review and settleUp guards", () => {
    const v = validateBillDraft({ items: [], subtotal: 0, total: 0 });
    expect(v.canContinue).toBe(false);
    expect(() => settleUp(baseBill({ items: [], total: 100 }))).toThrow(SplitError);
  });

  it("one person takes the whole bill", () => {
    const items = [mkItem("Burger", 100), mkItem("Pasta", 50)];
    const bill = baseBill({ items, subtotal: 150, total: 165 });
    bill.people = addPerson(bill.people, "Solo");
    const solo = bill.people[0];
    bill.assignments = tapSharer(bill.assignments, items[0].id, solo.id);
    bill.assignments = tapSharer(bill.assignments, items[1].id, solo.id);
    expect(isFullyAssigned(bill)).toBe(true);
    const s = settleUp(bill);
    expect(s.shares).toHaveLength(1);
    expect(s.shares[0].final).toBe(165); // (100+50)*1.1
  });

  it("item assigned to nobody blocks the summary", () => {
    const items = [mkItem("Assigned", 50), mkItem("Orphan", 50)];
    const bill = baseBill({ items, subtotal: 100, total: 100 });
    bill.people = addPerson(bill.people, "Ali");
    bill.assignments = tapSharer(bill.assignments, items[0].id, bill.people[0].id);
    expect(isFullyAssigned(bill)).toBe(false);
    expect(findUnassignedItems(bill)).toEqual([items[1].id]);
  });

  it("discrepancy (subtotal ≠ Σ items) blocks at review", () => {
    const items = [mkItem("A", 100), mkItem("B", 95)]; // sum 195
    const v = validateBillDraft({ items, subtotal: 200, total: 220 });
    expect(v.subtotalMatchesItems).toBe(false);
    expect(v.discrepancy).toBe(5);
    expect(v.canContinue).toBe(false);
  });

  it("a large 18-item bill settles and produces a usable link", () => {
    const items = Array.from({ length: 18 }, (_, i) => mkItem(`Item ${i}`, 10 + i, 1));
    const subtotal = items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
    const bill = baseBill({ items, subtotal, total: subtotal });
    bill.people = ["Ali", "Sara", "Omar", "Mona"].reduce(
      (ppl, n) => addPerson(ppl, n),
      bill.people,
    );
    items.forEach((it, i) => {
      bill.assignments = tapSharer(
        bill.assignments,
        it.id,
        bill.people[i % bill.people.length].id,
      );
    });
    expect(isFullyAssigned(bill)).toBe(true);

    const s = settleUp(bill);
    expect(s.totalPaid).toBeGreaterThanOrEqual(subtotal);

    const payload = encodeBillPayload(bill);
    expect(`https://payright.app/#${payload}`.length).toBeLessThan(8000);
    expect(finalsSorted(decodeBillPayload(payload)!.bill)).toEqual(finalsSorted(bill));
  });

  it("a malformed shared link decodes to null (caller shows invalid state)", () => {
    expect(decodeBillPayload("#d=not-a-real-payload")).toBeNull();
    expect(decodeBillPayload("")).toBeNull();
  });
});
