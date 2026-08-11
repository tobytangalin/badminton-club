import { describe, expect, it } from "vitest";
import { applyRating } from "@/lib/leaderboard";
import type { LeaderboardEntry } from "@/lib/types";

function entry(overrides: Partial<LeaderboardEntry>): LeaderboardEntry {
  return {
    uid: "u1",
    nickname: "Ann",
    photoUrl: undefined,
    avg: 0,
    count: 0,
    myStars: null,
    ...overrides,
  };
}

describe("applyRating", () => {
  it("adds a new rating to the average and count", () => {
    const entries = [entry({ uid: "uA", avg: 3, count: 2, myStars: null })];
    const next = applyRating(entries, "uA", 5);
    expect(next[0]).toMatchObject({ count: 3, avg: 11 / 3, myStars: 5 });
  });

  it("recomputes the average when an existing rating changes", () => {
    const entries = [entry({ uid: "uA", avg: 3, count: 2, myStars: 4 })];
    const next = applyRating(entries, "uA", 5);
    expect(next[0]).toMatchObject({ count: 2, avg: 3.5, myStars: 5 });
  });

  it("removes a rating when cleared", () => {
    const entries = [entry({ uid: "uA", avg: 3, count: 2, myStars: 4 })];
    const next = applyRating(entries, "uA", null);
    expect(next[0]).toMatchObject({ count: 1, avg: 2, myStars: null });
  });

  it("leaves an unrated player untouched when clearing", () => {
    const entries = [entry({ uid: "uA", avg: 0, count: 0, myStars: null })];
    expect(applyRating(entries, "uA", null)).toBe(entries);
  });

  it("is a no-op when the rating is unchanged", () => {
    const entries = [entry({ uid: "uA", avg: 3, count: 2, myStars: 4 })];
    expect(applyRating(entries, "uA", 4)).toBe(entries);
  });

  it("ignores unknown uids", () => {
    const entries = [entry({ uid: "uA" })];
    expect(applyRating(entries, "uX", 5)).toBe(entries);
  });

  it("keeps the list sorted after a rating change", () => {
    const entries = [
      entry({ uid: "uTop", avg: 5, count: 1, myStars: null }),
      entry({ uid: "uA", avg: 3, count: 2, myStars: null }),
      entry({ uid: "uLow", avg: 1, count: 1, myStars: null }),
    ];
    const next = applyRating(entries, "uA", 5);
    expect(next.map((e) => e.uid)).toEqual(["uTop", "uA", "uLow"]);
  });
});
