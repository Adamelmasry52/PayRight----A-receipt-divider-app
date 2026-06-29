/*
  Assignment-array helpers (spec §2 split modes). Pure and React-free: every
  function takes the full assignments array and returns a new one, so the Assign
  screen never mutates state in place or reimplements the rules.

  The fraction math itself lives in split.ts (itemFractions / validateItemFractions);
  these helpers only shape *which* assignments exist and in *what mode*.

  Mode is stored per assignment, but every assignment for one item always shares
  a single mode (the segmented control picks one mode per item). These helpers
  preserve that invariant.

  Representation by mode:
    whole    → exactly one assignment, value 0
    equal    → one assignment per sharer, value 0
    quantity → one assignment per *person in the bill*, value = k (0 allowed)
    percent  → one assignment per *person in the bill*, value = pct (0 allowed)

  Keeping zero-value rows for quantity/percent is deliberate: it preserves the
  chosen mode and the row set while the user fills in numbers. A zero contributes
  nothing to Σφ, so validity (Σφ = 1) is unaffected.
*/

import type { Assignment, SplitMode } from "./types.ts";

export function assignmentsForItem(
  assignments: Assignment[],
  itemId: string,
): Assignment[] {
  return assignments.filter((a) => a.itemId === itemId);
}

/** The single mode shared by an item's assignments, or null if it has none. */
export function itemMode(assignments: Assignment[], itemId: string): SplitMode | null {
  const first = assignments.find((a) => a.itemId === itemId);
  return first ? first.mode : null;
}

/** Drop all assignments for an item, then append the replacements. */
export function replaceItemAssignments(
  assignments: Assignment[],
  itemId: string,
  next: Assignment[],
): Assignment[] {
  return [...assignments.filter((a) => a.itemId !== itemId), ...next];
}

/**
 * Tap-to-assign fast path (whole/equal). Toggles a person's membership on an
 * item: the first person tapped makes it `whole`; a second makes both `equal`;
 * further taps stay `equal`; removing back down to one returns to `whole`.
 */
export function tapSharer(
  assignments: Assignment[],
  itemId: string,
  personId: string,
): Assignment[] {
  const mine = assignmentsForItem(assignments, itemId);
  const isSharer = mine.some((a) => a.personId === personId);

  let sharerIds = mine.map((a) => a.personId);
  sharerIds = isSharer
    ? sharerIds.filter((id) => id !== personId)
    : [...sharerIds, personId];

  const mode: SplitMode = sharerIds.length <= 1 ? "whole" : "equal";
  const next = sharerIds.map<Assignment>((id) => ({
    itemId,
    personId: id,
    mode,
    value: 0,
  }));
  return replaceItemAssignments(assignments, itemId, next);
}

/**
 * Switch an item to an explicit mode via the segmented control, carrying the
 * current sharers across where it makes sense:
 *   whole    → keep the first current sharer only (or none)
 *   equal    → keep all current sharers
 *   quantity → one row per person in the bill (preserves existing k if already
 *              in quantity mode, else 0)
 *   percent  → one row per person in the bill (preserves existing pct if already
 *              in percent mode, else 0)
 */
export function switchMode(
  assignments: Assignment[],
  itemId: string,
  mode: SplitMode,
  allPeopleIds: string[],
): Assignment[] {
  const mine = assignmentsForItem(assignments, itemId);
  const currentSharerIds = mine.map((a) => a.personId);
  const prior = new Map(mine.map((a) => [a.personId, a.value]));
  const sameMode = itemMode(assignments, itemId) === mode;

  let next: Assignment[];
  switch (mode) {
    case "whole": {
      const owner = currentSharerIds[0];
      next = owner ? [{ itemId, personId: owner, mode, value: 0 }] : [];
      break;
    }
    case "equal":
      next = currentSharerIds.map((id) => ({ itemId, personId: id, mode, value: 0 }));
      break;
    case "quantity":
    case "percent":
      next = allPeopleIds.map((id) => ({
        itemId,
        personId: id,
        mode,
        value: sameMode ? (prior.get(id) ?? 0) : 0,
      }));
      break;
  }
  return replaceItemAssignments(assignments, itemId, next);
}

/**
 * Set one person's numeric value (k for quantity, pct for percent), upserting the
 * row and coercing the whole item to `mode`. Zero values are kept so the row
 * stays visible while editing.
 */
export function setPersonValue(
  assignments: Assignment[],
  itemId: string,
  personId: string,
  mode: SplitMode,
  value: number,
): Assignment[] {
  const mine = assignmentsForItem(assignments, itemId);
  const exists = mine.some((a) => a.personId === personId);

  const next = mine.map<Assignment>((a) =>
    a.personId === personId ? { ...a, mode, value } : { ...a, mode },
  );
  if (!exists) next.push({ itemId, personId, mode, value });

  return replaceItemAssignments(assignments, itemId, next);
}
