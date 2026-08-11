import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeQuerySnap } from "./helpers/firestore";

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  runTransaction: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  writeBatch: vi.fn(),
  getAuthClient: vi.fn(),
}));

vi.mock("firebase/firestore", async () => {
  const { buildFirestoreModule } = await import("./helpers/firestore");
  return buildFirestoreModule(h);
});

vi.mock("@/lib/firebase", () => ({
  getDb: () => ({ __db: true }),
  getAuthClient: h.getAuthClient,
  getStorageClient: () => ({ __storage: true }),
}));

import * as db from "@/lib/db";

describe("fetchLeaderboard", () => {
  beforeEach(() => {
    h.getDocs.mockReset();
    db.invalidateLeaderboardCache();
  });

  afterEach(() => {
    db.invalidateLeaderboardCache();
  });

  it("reads only the users collection — never the ratings collection", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap(
        [
          { id: "u2", data: { nickname: "Ben", approved: true, ratingSum: 5, ratingCount: 1 } },
          { id: "u1", data: { nickname: "Ann", approved: true, ratingSum: 12, ratingCount: 4 } },
          { id: "u3", data: { nickname: "Cat", approved: false } },
        ],
        "users"
      )
    );

    const result = await db.fetchLeaderboard("me", { u1: 3 });

    expect(h.getDocs).toHaveBeenCalledTimes(1);
    expect(h.getDocs.mock.calls[0][0].path).toBe("users");
    // Pending members are excluded; avg/count come from denormalized fields.
    expect(result.map((e) => e.uid)).toEqual(["u2", "u1"]);
    expect(result.find((e) => e.uid === "u2")).toMatchObject({ avg: 5, count: 1 });
    expect(result.find((e) => e.uid === "u1")).toMatchObject({ avg: 3, count: 4 });
  });

  it("overlays the rater's own stars from myRatings", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap(
        [
          { id: "u1", data: { nickname: "Ann", approved: true, ratingSum: 12, ratingCount: 4 } },
          { id: "u2", data: { nickname: "Ben", approved: true, ratingSum: 5, ratingCount: 1 } },
        ],
        "users"
      )
    );

    const result = await db.fetchLeaderboard("me", { u1: 3 });

    expect(result.find((e) => e.uid === "u1")?.myStars).toBe(3);
    expect(result.find((e) => e.uid === "u2")?.myStars).toBeNull();
  });

  it("serves a second call within the TTL from cache — no extra reads", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann", approved: true } }], "users")
    );

    await db.fetchLeaderboard("me");
    await db.fetchLeaderboard("other");

    expect(h.getDocs).toHaveBeenCalledTimes(1);
  });

  it("refetches after the cache is invalidated", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann", approved: true } }], "users")
    );

    await db.fetchLeaderboard("me");
    db.invalidateLeaderboardCache();
    await db.fetchLeaderboard("me");

    expect(h.getDocs).toHaveBeenCalledTimes(2);
  });
});
