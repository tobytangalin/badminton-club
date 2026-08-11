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

describe("fetchMembers", () => {
  beforeEach(() => {
    h.getDocs.mockReset();
    db.invalidateMembersCache();
    const store = new Map<string, string>();
    globalThis.localStorage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    db.invalidateMembersCache();
  });

  it("reads only the users collection and maps to summaries", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap(
        [
          { id: "u1", data: { nickname: "Ann", photoUrl: "a.jpg", ratingSum: 9, ratingCount: 3 } },
          { id: "u2", data: { nickname: "", photoUrl: undefined } },
        ],
        "users"
      )
    );

    const result = await db.fetchMembers();

    expect(h.getDocs).toHaveBeenCalledTimes(1);
    expect(h.getDocs.mock.calls[0][0].path).toBe("users");
    expect(result).toEqual([
      { uid: "u1", nickname: "Ann", photoUrl: "a.jpg" },
      { uid: "u2", nickname: "", photoUrl: undefined },
    ]);
  });

  it("serves a second call within the TTL from cache — no extra reads", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann" } }], "users")
    );

    await db.fetchMembers();
    await db.fetchMembers();

    expect(h.getDocs).toHaveBeenCalledTimes(1);
  });

  it("persists the fetched list to localStorage", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann" } }], "users")
    );

    await db.fetchMembers();

    const raw = globalThis.localStorage.getItem("sb:members:v1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as {
      data: { uid: string; nickname: string }[];
      expiresAt: number;
    };
    expect(parsed.data).toEqual([{ uid: "u1", nickname: "Ann" }]);
  });

  it("serves from a fresh localStorage cache with no Firestore read", async () => {
    globalThis.localStorage.setItem(
      "sb:members:v1",
      JSON.stringify({
        data: [{ uid: "u1", nickname: "Ann", photoUrl: undefined }],
        expiresAt: Date.now() + 600_000,
      })
    );

    const result = await db.fetchMembers();

    expect(h.getDocs).not.toHaveBeenCalled();
    expect(result).toEqual([{ uid: "u1", nickname: "Ann", photoUrl: undefined }]);
  });

  it("refetches when the stored cache is expired", async () => {
    globalThis.localStorage.setItem(
      "sb:members:v1",
      JSON.stringify({ data: [], expiresAt: Date.now() - 1_000 })
    );
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann" } }], "users")
    );

    await db.fetchMembers();

    expect(h.getDocs).toHaveBeenCalledTimes(1);
  });

  it("force bypasses the cache", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann" } }], "users")
    );

    await db.fetchMembers();
    await db.fetchMembers(true);

    expect(h.getDocs).toHaveBeenCalledTimes(2);
  });

  it("falls back to a Firestore read when the stored JSON is corrupt", async () => {
    globalThis.localStorage.setItem("sb:members:v1", "{not json");
    h.getDocs.mockResolvedValue(
      makeQuerySnap([{ id: "u1", data: { nickname: "Ann" } }], "users")
    );

    await db.fetchMembers();

    expect(h.getDocs).toHaveBeenCalledTimes(1);
  });
});
