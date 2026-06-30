/*
  Shareable-link codec (spec §7). Pure and React-free.

  The link IS the data: the whole Bill plus the current manual overrides are
  serialized into a compact, index-based shape, compressed with lz-string, and
  placed in the URL fragment (#d=...). No backend, nothing stored.

  Compactness:
    - items/people are positional arrays; assignments & overrides reference them
      by index (no UUIDs travel in the link).
    - zero-value quantity/percent assignment rows are pruned (they carry no share
      and only bloat the link).
  Versioned (schema v1) so future readers can branch on `v`.
*/

import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import type { Assignment, Bill, Item, Person, SplitMode } from "./types.ts";

export const SHARE_SCHEMA_VERSION = 1;
export const SHARE_FRAGMENT_PREFIX = "d=";

/**
 * Hard cap on the compressed fragment length before we attempt to decompress.
 * A legitimate large bill (30 items × 8 people) is well under 1k chars; this
 * guards against a hostile multi-MB fragment wasting the victim's CPU.
 */
export const MAX_FRAGMENT_CHARS = 100_000;

const MODE_CODES: Record<SplitMode, number> = {
  whole: 0,
  equal: 1,
  quantity: 2,
  percent: 3,
};
const MODE_BY_CODE: SplitMode[] = ["whole", "equal", "quantity", "percent"];

interface EncodedV1 {
  v: 1;
  s: number; // subtotal
  t: number; // total
  it: [string, number, number][]; // [name, unitPrice, qty]
  pp: [string, string, string][]; // [name, avatar, color]
  as: [number, number, number, number][]; // [itemIdx, personIdx, modeCode, value]
  pa: number; // payer index, or -1
  ov: [number, number][]; // [personIdx, overrideAmount]
}

export interface DecodedBill {
  bill: Bill;
  overrides: Record<string, number>;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Serialize a bill + overrides into the `d=<compressed>` fragment payload. */
export function encodeBillPayload(
  bill: Bill,
  overrides: Record<string, number> = {},
): string {
  const itemIndex = new Map(bill.items.map((it, i) => [it.id, i]));
  const personIndex = new Map(bill.people.map((p, i) => [p.id, i]));

  const it: EncodedV1["it"] = bill.items.map((i) => [i.name, i.unitPrice, i.qty]);
  const pp: EncodedV1["pp"] = bill.people.map((p) => [p.name, p.avatar, p.color]);

  const as: EncodedV1["as"] = [];
  for (const a of bill.assignments) {
    // Prune zero-value quantity/percent rows — no share, pure bloat.
    if ((a.mode === "quantity" || a.mode === "percent") && !(a.value > 0)) continue;
    const ii = itemIndex.get(a.itemId);
    const pi = personIndex.get(a.personId);
    if (ii === undefined || pi === undefined) continue;
    as.push([ii, pi, MODE_CODES[a.mode], a.value]);
  }

  const pa = bill.payerId != null ? (personIndex.get(bill.payerId) ?? -1) : -1;

  const ov: EncodedV1["ov"] = [];
  for (const [personId, amount] of Object.entries(overrides)) {
    const pi = personIndex.get(personId);
    if (pi !== undefined) ov.push([pi, amount]);
  }

  const payload: EncodedV1 = { v: 1, s: bill.subtotal, t: bill.total, it, pp, as, pa, ov };
  return SHARE_FRAGMENT_PREFIX + compressToEncodedURIComponent(JSON.stringify(payload));
}

/**
 * Decode a fragment payload back into a bill + overrides. Accepts the raw
 * payload, with or without a leading "#" and the "d=" prefix. Returns null on
 * anything malformed (never throws), so callers can show an "invalid link" state.
 */
export function decodeBillPayload(fragment: string): DecodedBill | null {
  try {
    let raw = fragment.trim();
    if (raw.startsWith("#")) raw = raw.slice(1);
    if (raw.startsWith(SHARE_FRAGMENT_PREFIX)) {
      raw = raw.slice(SHARE_FRAGMENT_PREFIX.length);
    }
    if (!raw || raw.length > MAX_FRAGMENT_CHARS) return null;

    const json = decompressFromEncodedURIComponent(raw);
    if (!json) return null;

    const p = JSON.parse(json) as Partial<EncodedV1>;
    if (!p || p.v !== 1 || !Array.isArray(p.it) || !Array.isArray(p.pp)) return null;

    const people: Person[] = p.pp.map(([name, avatar, color], i) => ({
      id: newId(),
      name,
      avatar,
      color,
      isPayer: i === p.pa,
    }));
    const items: Item[] = p.it.map(([name, unitPrice, qty]) => ({
      id: newId(),
      name,
      unitPrice,
      qty,
    }));

    const assignments: Assignment[] = [];
    for (const [ii, pi, mc, value] of p.as ?? []) {
      const item = items[ii];
      const person = people[pi];
      if (!item || !person) continue;
      assignments.push({
        itemId: item.id,
        personId: person.id,
        mode: MODE_BY_CODE[mc] ?? "whole",
        value,
      });
    }

    const payerId =
      typeof p.pa === "number" && p.pa >= 0 && people[p.pa] ? people[p.pa].id : null;

    const overrides: Record<string, number> = {};
    for (const [pi, amount] of p.ov ?? []) {
      const person = people[pi];
      if (person) overrides[person.id] = amount;
    }

    const bill: Bill = {
      currency: "EGP",
      items,
      subtotal: typeof p.s === "number" ? p.s : 0,
      total: typeof p.t === "number" ? p.t : 0,
      people,
      assignments,
      payerId,
    };
    return { bill, overrides };
  } catch {
    return null;
  }
}
