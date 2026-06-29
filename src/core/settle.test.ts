import { describe, it, expect } from "vitest";
import type { Bill, Item, Person } from "./types.ts";
import { settleUp, whoOwesPayer } from "./split.ts";

let seq = 0;
const item = (unitPrice: number, qty = 1): Item => ({
  id: `i${seq++}`,
  name: "x",
  unitPrice,
  qty,
});
const person = (name: string): Person => ({
  id: `p_${name}`,
  name,
  avatar: "banana",
  color: "orange",
  isPayer: false,
});
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

describe("whoOwesPayer", () => {
  const ali = person("ali");
  const sara = person("sara");
  const omar = person("omar");
  // Three items, one each, whole. S=150, T=165 → f=1.1 → shares 110/33/22? set below.
  const a = item(100); // ali
  const b = item(30); // sara
  const c = item(20); // omar
  const base = bill({
    items: [a, b, c],
    total: 165, // f = 1.1
    people: [ali, sara, omar],
    assignments: [
      { itemId: a.id, personId: ali.id, mode: "whole", value: 0 },
      { itemId: b.id, personId: sara.id, mode: "whole", value: 0 },
      { itemId: c.id, personId: omar.id, mode: "whole", value: 0 },
    ],
  });

  it("returns nothing to frame when no payer is set", () => {
    const s = settleUp(base);
    expect(whoOwesPayer(s, null)).toEqual({ collects: 0, lines: [] });
  });

  it("the payer collects the sum of everyone else's shares; payer not in lines", () => {
    const withPayer = { ...base, payerId: ali.id };
    const s = settleUp(withPayer);
    const framing = whoOwesPayer(s, ali.id);

    // ali 110, sara 33, omar 22 (f=1.1)
    expect(framing.lines.map((l) => l.personId).sort()).toEqual(
      [sara.id, omar.id].sort(),
    );
    const owed = Object.fromEntries(framing.lines.map((l) => [l.personId, l.amount]));
    expect(owed[sara.id]).toBe(33);
    expect(owed[omar.id]).toBe(22);
    expect(framing.collects).toBe(55); // 33 + 22

    // collects equals totalPaid minus the payer's own share
    const payerShare = s.shares.find((x) => x.personId === ali.id)!.final;
    expect(framing.collects).toBeCloseTo(s.totalPaid - payerShare, 10);
  });

  it("reflects manual overrides in the owed amounts", () => {
    const withPayer = { ...base, payerId: ali.id };
    const s = settleUp(withPayer, { overrides: { [sara.id]: 30 } });
    const framing = whoOwesPayer(s, ali.id);
    const owed = Object.fromEntries(framing.lines.map((l) => [l.personId, l.amount]));
    expect(owed[sara.id]).toBe(30); // overridden
    expect(framing.collects).toBe(52); // 30 + 22
  });
});
