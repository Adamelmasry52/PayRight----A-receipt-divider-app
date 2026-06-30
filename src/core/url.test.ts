import { describe, it, expect } from "vitest";
import type { Assignment, Bill, Item, Person } from "./types.ts";
import { encodeBillPayload, decodeBillPayload } from "./url.ts";
import { settleUp } from "./split.ts";

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
  avatar: "banana",
  color: "orange",
  isPayer,
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

/** Finals keyed by person NAME (ids are regenerated on decode). */
function finalsByName(b: Bill, overrides: Record<string, number> = {}) {
  const s = settleUp(b, { overrides });
  const out: Record<string, number> = {};
  for (const sh of s.shares) {
    const name = b.people.find((p) => p.id === sh.personId)!.name;
    out[name] = sh.final;
  }
  return out;
}

describe("encode/decode round-trip", () => {
  const ali = person("Ali", true);
  const sara = person("Sara");
  const a = item("Burger", 100);
  const b = item("Pasta", 50);
  const original = bill({
    items: [a, b],
    subtotal: 150,
    total: 165,
    people: [ali, sara],
    payerId: ali.id,
    assignments: [
      { itemId: a.id, personId: ali.id, mode: "whole", value: 0 },
      { itemId: b.id, personId: sara.id, mode: "whole", value: 0 },
    ],
  });

  it("returns an equivalent bill (structure + shares preserved)", () => {
    const decoded = decodeBillPayload(encodeBillPayload(original));
    expect(decoded).not.toBeNull();
    const r = decoded!.bill;

    expect(r.currency).toBe("EGP");
    expect(r.subtotal).toBe(150);
    expect(r.total).toBe(165);
    expect(r.items.map((i) => [i.name, i.unitPrice, i.qty])).toEqual([
      ["Burger", 100, 1],
      ["Pasta", 50, 1],
    ]);
    expect(r.people.map((p) => p.name)).toEqual(["Ali", "Sara"]);
    // payer preserved by index
    expect(r.people.find((p) => p.id === r.payerId)?.name).toBe("Ali");
    // shares identical
    expect(finalsByName(r)).toEqual(finalsByName(original));
  });

  it("accepts the fragment with or without #/d= prefixes", () => {
    const payload = encodeBillPayload(original); // "d=...."
    expect(decodeBillPayload(payload)).not.toBeNull();
    expect(decodeBillPayload("#" + payload)).not.toBeNull();
    expect(decodeBillPayload(payload.slice("d=".length))).not.toBeNull();
  });
});

describe("pruning zero-value rows", () => {
  it("drops quantity/percent 0-rows without changing any share", () => {
    const ali = person("Ali");
    const sara = person("Sara");
    const omar = person("Omar");
    const tea = item("Tea", 15, 4); // lineTotal 60
    const assignments: Assignment[] = [
      { itemId: tea.id, personId: ali.id, mode: "quantity", value: 2 },
      { itemId: tea.id, personId: sara.id, mode: "quantity", value: 2 },
      { itemId: tea.id, personId: omar.id, mode: "quantity", value: 0 }, // pruned
    ];
    const b1 = bill({
      items: [tea],
      subtotal: 60,
      total: 60,
      people: [ali, sara, omar],
      assignments,
    });

    const decoded = decodeBillPayload(encodeBillPayload(b1))!;
    // The 0-row is gone…
    expect(decoded.bill.assignments).toHaveLength(2);
    expect(decoded.bill.assignments.every((a) => a.value > 0)).toBe(true);
    // …and shares are unchanged.
    expect(finalsByName(decoded.bill)).toEqual(finalsByName(b1));
  });

  it("keeps whole/equal rows (their value is 0 by design)", () => {
    const ali = person("Ali");
    const sara = person("Sara");
    const pizza = item("Pizza", 100);
    const b1 = bill({
      items: [pizza],
      subtotal: 100,
      total: 100,
      people: [ali, sara],
      assignments: [
        { itemId: pizza.id, personId: ali.id, mode: "equal", value: 0 },
        { itemId: pizza.id, personId: sara.id, mode: "equal", value: 0 },
      ],
    });
    const decoded = decodeBillPayload(encodeBillPayload(b1))!;
    expect(decoded.bill.assignments).toHaveLength(2);
  });
});

describe("overrides survive", () => {
  it("carries overrides so the recipient sees the adjusted breakdown", () => {
    const ali = person("Ali", true);
    const sara = person("Sara");
    const a = item("Burger", 100);
    const b = item("Pasta", 50);
    const b1 = bill({
      items: [a, b],
      subtotal: 150,
      total: 165,
      people: [ali, sara],
      payerId: ali.id,
      assignments: [
        { itemId: a.id, personId: ali.id, mode: "whole", value: 0 },
        { itemId: b.id, personId: sara.id, mode: "whole", value: 0 },
      ],
    });
    const overrides = { [ali.id]: 100 }; // Ali owes 110, manually set to 100

    const decoded = decodeBillPayload(encodeBillPayload(b1, overrides))!;
    // override re-keyed onto the regenerated Ali id
    const aliNew = decoded.bill.people.find((p) => p.name === "Ali")!;
    expect(decoded.overrides[aliNew.id]).toBe(100);

    const s = settleUp(decoded.bill, { overrides: decoded.overrides });
    expect(s.totalPaid).toBe(155);
    expect(s.isCovered).toBe(false);
  });
});

describe("guards", () => {
  it("returns null on malformed / garbage fragments (never throws)", () => {
    expect(decodeBillPayload("")).toBeNull();
    expect(decodeBillPayload("#d=not-valid-lzstring!!!")).toBeNull();
    expect(decodeBillPayload("#d=" + btoa("{}"))).toBeNull(); // valid-ish but wrong shape
    expect(decodeBillPayload("totally-random")).toBeNull();
  });
});

describe("large bill stays usable", () => {
  it("encodes 30 items × 8 people to a reasonable URL length", () => {
    const people = Array.from({ length: 8 }, (_, i) => person(`Person${i}`));
    const items = Array.from({ length: 30 }, (_, i) => item(`Menu Item ${i}`, 10 + i, 1));
    const assignments: Assignment[] = items.map((it, i) => ({
      itemId: it.id,
      personId: people[i % people.length].id,
      mode: "whole",
      value: 0,
    }));
    const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty, 0);
    const b1 = bill({
      items,
      subtotal,
      total: subtotal,
      people,
      payerId: people[0].id,
      assignments,
    });

    const payload = encodeBillPayload(b1);
    const url = `https://payright.app/#${payload}`;
    // eslint-disable-next-line no-console
    console.log(`[url.test] large bill: payload=${payload.length} chars, url=${url.length} chars`);

    expect(decodeBillPayload(payload)).not.toBeNull();
    // Comfortably under common URL limits (~8k); typical bills are far smaller.
    expect(url.length).toBeLessThan(8000);
  });
});
