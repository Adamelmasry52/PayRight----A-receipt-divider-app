import { describe, it, expect } from "vitest";
import {
  ACCENT_KEYS,
  AVATAR_POOL,
  addPerson,
  renamePerson,
  removePerson,
  togglePayer,
  nextAccent,
} from "./people.ts";
import type { Person } from "./types.ts";

/** Add `n` people named P0..P(n-1), allocating as we go. */
function buildPeople(n: number): Person[] {
  let people: Person[] = [];
  for (let i = 0; i < n; i++) people = addPerson(people, `P${i}`);
  return people;
}

describe("avatar allocation", () => {
  it("assigns unique animals across a realistic group", () => {
    const people = buildPeople(8);
    const avatars = people.map((p) => p.avatar);
    expect(new Set(avatars).size).toBe(8); // all unique
    for (const a of avatars) expect(AVATAR_POOL).toContain(a);
  });

  it("keeps avatars unique right up to the pool size", () => {
    const people = buildPeople(AVATAR_POOL.length);
    expect(new Set(people.map((p) => p.avatar)).size).toBe(AVATAR_POOL.length);
  });

  it("cycles the pool only after it is exhausted", () => {
    const people = buildPeople(AVATAR_POOL.length + 1);
    const avatars = people.map((p) => p.avatar);
    // One duplicate now exists (pool + 1 people into a pool-sized set).
    expect(new Set(avatars).size).toBe(AVATAR_POOL.length);
  });
});

describe("accent color allocation", () => {
  it("assigns unique colors for the first 6 people", () => {
    const people = buildPeople(6);
    const colors = people.map((p) => p.color);
    expect(new Set(colors).size).toBe(6);
    expect([...colors].sort()).toEqual([...ACCENT_KEYS].sort());
  });

  it("cycles colors after all 6 hues are used", () => {
    const people = buildPeople(7);
    const colors = people.map((p) => p.color);
    expect(new Set(colors).size).toBe(6); // 7th repeats a hue
    expect(colors[6]).toBe(ACCENT_KEYS[0]); // deterministic cycle
  });

  it("reuses a freed color rather than skipping ahead", () => {
    let people = buildPeople(6); // orange..purple
    people = removePerson(people, people[1].id); // free "blue"
    const reused = nextAccent(people);
    expect(reused).toBe("blue");
  });
});

describe("stability across unrelated state changes", () => {
  it("a person keeps their avatar/color when others are added/removed/renamed and payer toggles", () => {
    let people = buildPeople(3);
    const subject = people[0];
    const snapshot = { avatar: subject.avatar, color: subject.color };

    people = addPerson(people, "Newcomer");
    people = renamePerson(people, people[1].id, "Renamed");
    people = removePerson(people, people[2].id);

    const still = people.find((p) => p.id === subject.id)!;
    expect(still.avatar).toBe(snapshot.avatar);
    expect(still.color).toBe(snapshot.color);
  });

  it("rename does not touch avatar/color", () => {
    let people = buildPeople(1);
    const before = { ...people[0] };
    people = renamePerson(people, before.id, "Whole New Name");
    expect(people[0].name).toBe("Whole New Name");
    expect(people[0].avatar).toBe(before.avatar);
    expect(people[0].color).toBe(before.color);
  });
});

describe("payer toggle (optional, at most one)", () => {
  it("marks, moves, and clears the payer", () => {
    const [a, b] = ["pa", "pb"];
    expect(togglePayer(null, a)).toBe(a); // mark
    expect(togglePayer(a, b)).toBe(b); // move
    expect(togglePayer(b, b)).toBe(null); // clear
  });
});
