import { describe, it, expect } from "vitest";
import type { Assignment, Item } from "./types.ts";
import {
  assignmentsForItem,
  itemMode,
  replaceItemAssignments,
  tapSharer,
  switchMode,
  setPersonValue,
} from "./assign.ts";
import { itemFractions, validateItemFractions } from "./split.ts";

const ITEM = "item1";
const PEOPLE = ["p1", "p2", "p3"];
const item = (qty: number): Item => ({ id: ITEM, name: "x", unitPrice: 10, qty });

describe("tapSharer — whole/equal fast path", () => {
  it("first tap makes the item whole", () => {
    const next = tapSharer([], ITEM, "p1");
    expect(next).toHaveLength(1);
    expect(itemMode(next, ITEM)).toBe("whole");
    expect(next[0]).toMatchObject({ personId: "p1", mode: "whole", value: 0 });
  });

  it("a second tap makes both equal", () => {
    let a = tapSharer([], ITEM, "p1");
    a = tapSharer(a, ITEM, "p2");
    expect(a).toHaveLength(2);
    expect(itemMode(a, ITEM)).toBe("equal");
    expect(a.every((x) => x.mode === "equal")).toBe(true);
    expect(validateItemFractions(item(1), a)).toBe(true); // 1/2 + 1/2
  });

  it("further taps stay equal and Σφ = 1", () => {
    let a = tapSharer([], ITEM, "p1");
    a = tapSharer(a, ITEM, "p2");
    a = tapSharer(a, ITEM, "p3");
    expect(a).toHaveLength(3);
    expect(itemMode(a, ITEM)).toBe("equal");
    const f = itemFractions(item(1), a);
    expect(f.get("p1")).toBeCloseTo(1 / 3, 10);
    expect(validateItemFractions(item(1), a)).toBe(true);
  });

  it("removing back down to one returns to whole", () => {
    let a = tapSharer([], ITEM, "p1");
    a = tapSharer(a, ITEM, "p2");
    a = tapSharer(a, ITEM, "p2"); // toggle p2 off
    expect(a).toHaveLength(1);
    expect(itemMode(a, ITEM)).toBe("whole");
    expect(a[0].personId).toBe("p1");
  });

  it("removing the last sharer leaves the item unassigned", () => {
    let a = tapSharer([], ITEM, "p1");
    a = tapSharer(a, ITEM, "p1");
    expect(assignmentsForItem(a, ITEM)).toHaveLength(0);
    expect(itemMode(a, ITEM)).toBeNull();
  });

  it("does not disturb other items' assignments", () => {
    const other: Assignment = { itemId: "other", personId: "p9", mode: "whole", value: 0 };
    const a = tapSharer([other], ITEM, "p1");
    expect(a).toContainEqual(other);
  });
});

describe("switchMode", () => {
  it("equal → whole keeps only the first sharer", () => {
    let a = tapSharer([], ITEM, "p1");
    a = tapSharer(a, ITEM, "p2");
    a = switchMode(a, ITEM, "whole", PEOPLE);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ personId: "p1", mode: "whole" });
  });

  it("whole → equal keeps all current sharers", () => {
    const a0 = tapSharer([], ITEM, "p1");
    const a = switchMode(a0, ITEM, "equal", PEOPLE);
    expect(itemMode(a, ITEM)).toBe("equal");
    expect(a.map((x) => x.personId)).toEqual(["p1"]);
  });

  it("→ quantity creates a zero row per person in the bill", () => {
    const a = switchMode([], ITEM, "quantity", PEOPLE);
    expect(a).toHaveLength(3);
    expect(a.every((x) => x.mode === "quantity" && x.value === 0)).toBe(true);
    expect(a.map((x) => x.personId).sort()).toEqual([...PEOPLE].sort());
  });

  it("→ percent creates a zero row per person in the bill", () => {
    const a = switchMode([], ITEM, "percent", PEOPLE);
    expect(a).toHaveLength(3);
    expect(a.every((x) => x.mode === "percent" && x.value === 0)).toBe(true);
  });

  it("preserves values when re-applying the same mode", () => {
    let a = switchMode([], ITEM, "quantity", PEOPLE);
    a = setPersonValue(a, ITEM, "p1", "quantity", 2);
    a = switchMode(a, ITEM, "quantity", PEOPLE); // idempotent
    expect(assignmentsForItem(a, ITEM).find((x) => x.personId === "p1")?.value).toBe(2);
  });
});

describe("setPersonValue (quantity / percent)", () => {
  it("by-quantity: Σk = qty validates; partial does not", () => {
    let a = switchMode([], ITEM, "quantity", PEOPLE);
    a = setPersonValue(a, ITEM, "p1", "quantity", 3);
    a = setPersonValue(a, ITEM, "p2", "quantity", 1); // qty 4
    expect(validateItemFractions(item(4), a)).toBe(true);

    a = setPersonValue(a, ITEM, "p2", "quantity", 0); // now Σk = 3 of 4
    expect(validateItemFractions(item(4), a)).toBe(false);
  });

  it("percent: only valid at exactly 100", () => {
    let a = switchMode([], ITEM, "percent", PEOPLE);
    a = setPersonValue(a, ITEM, "p1", "percent", 60);
    a = setPersonValue(a, ITEM, "p2", "percent", 40);
    expect(validateItemFractions(item(1), a)).toBe(true);

    a = setPersonValue(a, ITEM, "p2", "percent", 30); // 90
    expect(validateItemFractions(item(1), a)).toBe(false);
  });

  it("keeps a single mode across the item (no mixed modes)", () => {
    let a = switchMode([], ITEM, "percent", PEOPLE);
    a = setPersonValue(a, ITEM, "p1", "percent", 50);
    expect(new Set(assignmentsForItem(a, ITEM).map((x) => x.mode)).size).toBe(1);
  });
});

describe("replaceItemAssignments", () => {
  it("swaps one item's assignments while leaving others intact", () => {
    const base: Assignment[] = [
      { itemId: "a", personId: "p1", mode: "whole", value: 0 },
      { itemId: "b", personId: "p2", mode: "whole", value: 0 },
    ];
    const next = replaceItemAssignments(base, "a", [
      { itemId: "a", personId: "p3", mode: "whole", value: 0 },
    ]);
    expect(assignmentsForItem(next, "a")).toEqual([
      { itemId: "a", personId: "p3", mode: "whole", value: 0 },
    ]);
    expect(assignmentsForItem(next, "b")).toHaveLength(1);
  });
});
