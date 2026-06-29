/*
  People setup logic (spec §6): deterministic avatar + accent-color allocation.

  Pure and React-free. The component renders the results and persists them via
  the BillContext SET_PEOPLE / SET_PAYER actions — it does not reimplement these
  rules.

  Allocation rules:
    - Avatars (fruit slugs) are unique within a bill; if a 25th person is added
      (pool exhausted) the pool cycles deterministically.
    - Accent colors are unique until all 6 hues are used, then they cycle.
    - Freed slots are reused: removing a person frees their avatar/color for the
      next add (we pick the first UNUSED option, not by raw count).
    - An assignment is stable: a person keeps their avatar/color for the session.
      Allocation happens once at creation; nothing here mutates an existing person.
*/

import type { Person } from "./types.ts";

/** The 6 accent hues, in design-token order (see --accent-0..5 / --color-accent-*). */
export const ACCENT_KEYS = [
  "orange",
  "blue",
  "green",
  "teal",
  "gold",
  "purple",
] as const;

export type AccentKey = (typeof ACCENT_KEYS)[number];

/**
 * The fruit avatar pool — slugs matching the vendored SVG filenames in
 * src/assets/avatars/. Order defines assignment order.
 */
export const AVATAR_POOL = [
  "red-apple",
  "green-apple",
  "pear",
  "tangerine",
  "lemon",
  "banana",
  "watermelon",
  "grapes",
  "strawberry",
  "blueberries",
  "cherries",
  "peach",
  "mango",
  "pineapple",
  "coconut",
  "kiwi",
  "melon",
  "tomato",
  "avocado",
  "olive",
  "bell-pepper",
  "hot-pepper",
  "cucumber",
  "corn",
] as const;

export type AvatarId = (typeof AVATAR_POOL)[number];

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `person-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/**
 * Pick the next avatar: the first pool entry not already taken. When every
 * avatar is in use, cycle deterministically by headcount.
 */
export function nextAvatar(existing: Person[]): AvatarId {
  const used = new Set(existing.map((p) => p.avatar));
  const free = AVATAR_POOL.find((slug) => !used.has(slug));
  return free ?? AVATAR_POOL[existing.length % AVATAR_POOL.length];
}

/**
 * Pick the next accent: the first hue not already taken (unique until all 6 are
 * used), then cycle deterministically by headcount.
 */
export function nextAccent(existing: Person[]): AccentKey {
  const used = new Set(existing.map((p) => p.color));
  const free = ACCENT_KEYS.find((key) => !used.has(key));
  return free ?? ACCENT_KEYS[existing.length % ACCENT_KEYS.length];
}

/** Build a new person with an allocated, stable avatar + accent. Not a payer yet. */
export function createPerson(existing: Person[], name: string): Person {
  return {
    id: newId(),
    name: name.trim(),
    avatar: nextAvatar(existing),
    color: nextAccent(existing),
    isPayer: false,
  };
}

/** Append a newly-allocated person. Existing people are untouched (stability). */
export function addPerson(people: Person[], name: string): Person[] {
  return [...people, createPerson(people, name)];
}

/** Rename a person without disturbing their avatar/color. */
export function renamePerson(people: Person[], id: string, name: string): Person[] {
  return people.map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
}

/** Remove a person, freeing their avatar/color for the next add. */
export function removePerson(people: Person[], id: string): Person[] {
  return people.filter((p) => p.id !== id);
}

/**
 * Resolve the next payer id when the crown is tapped on `id`:
 *   - tapping a non-payer makes them the sole payer
 *   - tapping the current payer clears it (payer is optional)
 * The caller persists this via SET_PAYER (which also syncs Person.isPayer).
 */
export function togglePayer(currentPayerId: string | null, id: string): string | null {
  return currentPayerId === id ? null : id;
}
