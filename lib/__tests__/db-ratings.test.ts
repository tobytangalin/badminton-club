import { beforeEach, describe, expect, it, vi } from "vitest";
import { assertReadsBeforeWrites, makeFakeTx } from "./helpers/firestore";

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
import type { FakeTx } from "./helpers/firestore";

function stubTransaction(state: Map<string, unknown>): FakeTx {
  const tx = makeFakeTx(state);
  h.runTransaction.mockImplementation(async (_db: unknown, fn: (t: FakeTx) => Promise<void>) =>
    fn(tx)
  );
  return tx;
}

describe("setStars", () => {
  beforeEach(() => {
    h.getDocs.mockReset();
    h.runTransaction.mockReset();
  });

  it("writes a new rating and updates aggregates + myRatings in one transaction", async () => {
    const state = new Map<string, unknown>([
      ["users/uA", { nickname: "Ann", role: "member", approved: true }],
      ["users/uMe", { nickname: "Me", role: "member", approved: true }],
    ]);
    const tx = stubTransaction(state);

    await db.setStars("uA", "uMe", 5);

    assertReadsBeforeWrites(tx);
    expect(tx.get).toHaveBeenCalledTimes(3);
    expect(tx.set).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledTimes(2);

    expect(tx.set.mock.calls[0][0].path).toBe("ratings/uA_uMe");
    expect(tx.set.mock.calls[0][1]).toMatchObject({
      ratedUid: "uA",
      raterUid: "uMe",
      stars: 5,
      createdAt: "SERVER_TIMESTAMP",
    });
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uA" }),
      { ratingSum: 5, ratingCount: 1 }
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uMe" }),
      { myRatings: { uA: 5 } }
    );
  });

  it("updates an existing rating without changing the count", async () => {
    const state = new Map<string, unknown>([
      [
        "ratings/uA_uMe",
        { ratedUid: "uA", raterUid: "uMe", stars: 3, createdAt: "OLD" },
      ],
      ["users/uA", { nickname: "Ann", role: "member", approved: true, ratingSum: 10, ratingCount: 3 }],
      ["users/uMe", { nickname: "Me", role: "member", approved: true, myRatings: { uA: 3 } }],
    ]);
    const tx = stubTransaction(state);

    await db.setStars("uA", "uMe", 5);

    expect(tx.set.mock.calls[0][1]).toMatchObject({ stars: 5, createdAt: "OLD" });
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uA" }),
      { ratingSum: 12, ratingCount: 3 }
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uMe" }),
      { myRatings: { uA: 5 } }
    );
  });
});

describe("clearRating", () => {
  beforeEach(() => {
    h.runTransaction.mockReset();
  });

  it("deletes the rating and decrements both aggregates", async () => {
    const state = new Map<string, unknown>([
      ["ratings/uA_uMe", { ratedUid: "uA", raterUid: "uMe", stars: 3, createdAt: "OLD" }],
      ["users/uA", { nickname: "Ann", role: "member", approved: true, ratingSum: 12, ratingCount: 3 }],
      ["users/uMe", { nickname: "Me", role: "member", approved: true, myRatings: { uA: 3 } }],
    ]);
    const tx = stubTransaction(state);

    await db.clearRating("uA", "uMe");

    assertReadsBeforeWrites(tx);
    expect(tx.get).toHaveBeenCalledTimes(3);
    expect(tx.delete).toHaveBeenCalledTimes(1);
    expect(tx.delete.mock.calls[0][0].path).toBe("ratings/uA_uMe");
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uA" }),
      { ratingSum: 9, ratingCount: 2 }
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: "users/uMe" }),
      { myRatings: {} }
    );
  });

  it("does nothing when the rating does not exist", async () => {
    const state = new Map<string, unknown>([
      ["users/uA", { nickname: "Ann", role: "member", approved: true, ratingSum: 12, ratingCount: 3 }],
      ["users/uMe", { nickname: "Me", role: "member", approved: true }],
    ]);
    const tx = stubTransaction(state);

    await db.clearRating("uA", "uMe");

    expect(tx.delete).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });
});
