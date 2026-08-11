import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertReadsBeforeWrites,
  makeFakeBatch,
  makeFakeTx,
  makeQuerySnap,
  type FakeTx,
} from "./helpers/firestore";
import type { ParticipantToAdd } from "@/lib/db";

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

const S = "S1";
const SESSION_REF = `sessions/${S}`;

function sessionDoc(state: Map<string, unknown>, data: Record<string, unknown>) {
  state.set(SESSION_REF, data);
}

function stubTransaction(state: Map<string, unknown>): FakeTx {
  const tx = makeFakeTx(state);
  h.runTransaction.mockImplementation(async (_db: unknown, fn: (t: FakeTx) => Promise<void>) =>
    fn(tx)
  );
  return tx;
}

const newUser: ParticipantToAdd = { uid: "uNew", nickname: "New", photoUrl: "" };

describe("registerForSession", () => {
  beforeEach(() => {
    h.runTransaction.mockReset();
  });

  it("writes the registration and increments the session count", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 2, capacity: 4, waitlistCount: 0 });
    const tx = stubTransaction(state);

    await db.registerForSession(S, "uMe", { nickname: "Me", photoUrl: "" });

    assertReadsBeforeWrites(tx);
    expect(tx.get).toHaveBeenCalledTimes(2);
    expect(tx.set).toHaveBeenCalledTimes(1);
    expect(tx.set.mock.calls[0][0].path).toBe(`${SESSION_REF}/registrations/uMe`);
    expect(tx.set.mock.calls[0][1]).toMatchObject({
      uid: "uMe",
      nickname: "Me",
      photoUrl: "",
    });
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { count: { __increment: 1 } }
    );
  });

  it("rejects a registration when the session is full", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 4, capacity: 4 });
    const tx = stubTransaction(state);

    await expect(db.registerForSession(S, "uMe", { nickname: "Me" })).rejects.toThrow(
      "Session is full."
    );
    expect(tx.set).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("rejects a duplicate registration", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 1, capacity: 4 });
    state.set(`${SESSION_REF}/registrations/uMe`, { uid: "uMe" });
    const tx = stubTransaction(state);

    await expect(db.registerForSession(S, "uMe", { nickname: "Me" })).rejects.toThrow(
      "You are already registered."
    );
    expect(tx.set).not.toHaveBeenCalled();
  });
});

describe("unregisterFromSession", () => {
  beforeEach(() => {
    h.getDocs.mockReset();
    h.runTransaction.mockReset();
  });

  it("unregisters and decrements the count when no one is waiting", async () => {
    h.getDocs.mockResolvedValue(makeQuerySnap([], `${SESSION_REF}/waitlist`));
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 3, waitlistCount: 0 });
    state.set(`${SESSION_REF}/registrations/uMe`, { uid: "uMe" });
    const tx = stubTransaction(state);

    await db.unregisterFromSession(S, "uMe");

    expect(h.getDocs).toHaveBeenCalledTimes(1);
    expect(tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/registrations/uMe` })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { count: { __increment: -1 } }
    );
  });

  it("auto-promotes the oldest waitlisted member into the freed spot", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap(
        [{ id: "uW", data: { uid: "uW", nickname: "W", photoUrl: "" } }],
        `${SESSION_REF}/waitlist`
      )
    );
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 4, capacity: 4, waitlistCount: 1 });
    state.set(`${SESSION_REF}/registrations/uMe`, { uid: "uMe" });
    state.set(`${SESSION_REF}/waitlist/uW`, { uid: "uW", nickname: "W", photoUrl: "" });
    const tx = stubTransaction(state);

    await db.unregisterFromSession(S, "uMe");

    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/registrations/uW` }),
      expect.objectContaining({ uid: "uW" })
    );
    expect(tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/waitlist/uW` })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { count: { __increment: -1 }, waitlistCount: { __increment: -1 } }
    );
  });
});

describe("joinWaitlist", () => {
  beforeEach(() => {
    h.runTransaction.mockReset();
  });

  it("joins the waitlist of a full session", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 4, capacity: 4, waitlistCount: 0 });
    const tx = stubTransaction(state);

    await db.joinWaitlist(S, "uMe", { nickname: "Me" });

    assertReadsBeforeWrites(tx);
    expect(tx.get).toHaveBeenCalledTimes(3);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/waitlist/uMe` }),
      expect.objectContaining({ uid: "uMe" })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { waitlistCount: { __increment: 1 } }
    );
  });

  it("rejects joining a waitlist when the session has room", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 3, capacity: 4 });
    const tx = stubTransaction(state);

    await expect(db.joinWaitlist(S, "uMe", { nickname: "Me" })).rejects.toThrow(
      "Session is not full."
    );
    expect(tx.set).not.toHaveBeenCalled();
  });
});

describe("leaveWaitlist", () => {
  beforeEach(() => {
    h.runTransaction.mockReset();
  });

  it("removes the waitlist entry and decrements the count", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 4, capacity: 4, waitlistCount: 2 });
    state.set(`${SESSION_REF}/waitlist/uMe`, { uid: "uMe" });
    const tx = stubTransaction(state);

    await db.leaveWaitlist(S, "uMe");

    expect(tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/waitlist/uMe` })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { waitlistCount: { __increment: -1 } }
    );
  });
});

describe("adminApplyParticipantChanges", () => {
  beforeEach(() => {
    h.getDocs.mockReset();
    h.runTransaction.mockReset();
  });

  it("adds a member without touching the waitlist", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 3, waitlistCount: 0 });
    const tx = stubTransaction(state);

    await db.adminApplyParticipantChanges(S, { add: [newUser], remove: [] });

    expect(h.getDocs).not.toHaveBeenCalled();
    assertReadsBeforeWrites(tx);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/registrations/uNew` }),
      expect.objectContaining({ uid: "uNew" })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { count: { __increment: 1 } }
    );
  });

  it("clears a stale waitlist doc when an admin adds that member directly", async () => {
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 3, waitlistCount: 1 });
    state.set(`${SESSION_REF}/waitlist/uNew`, { uid: "uNew", nickname: "New" });
    const tx = stubTransaction(state);

    await db.adminApplyParticipantChanges(S, { add: [newUser], remove: [] });

    expect(tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/waitlist/uNew` })
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { count: { __increment: 1 } }
    );
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { waitlistCount: { __increment: -1 } }
    );
  });

  it("promotes the oldest waitlisted member when removing a registrant", async () => {
    h.getDocs.mockResolvedValue(
      makeQuerySnap(
        [{ id: "uW", data: { uid: "uW", nickname: "W", photoUrl: "" } }],
        `${SESSION_REF}/waitlist`
      )
    );
    const state = new Map<string, unknown>();
    sessionDoc(state, { count: 5, waitlistCount: 1 });
    state.set(`${SESSION_REF}/registrations/uA`, { uid: "uA", nickname: "A" });
    state.set(`${SESSION_REF}/waitlist/uW`, { uid: "uW", nickname: "W" });
    const tx = stubTransaction(state);

    await db.adminApplyParticipantChanges(S, { add: [], remove: ["uA"] });

    expect(h.getDocs).toHaveBeenCalledTimes(1);
    expect(tx.set).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/registrations/uW` }),
      expect.objectContaining({ uid: "uW" })
    );
    expect(tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/registrations/uA` })
    );
    expect(tx.delete).toHaveBeenCalledWith(
      expect.objectContaining({ path: `${SESSION_REF}/waitlist/uW` })
    );
    // count is net unchanged (-1 removed, +1 promoted); only waitlist shrinks.
    expect(tx.update).toHaveBeenCalledTimes(1);
    expect(tx.update).toHaveBeenCalledWith(
      expect.objectContaining({ path: SESSION_REF }),
      { waitlistCount: { __increment: -1 } }
    );
  });
});

describe("deleteSession", () => {
  beforeEach(() => {
    h.getDocs.mockReset();
    h.writeBatch.mockReset();
  });

  it("deletes registrations, waitlist, and the session in one batch", async () => {
    h.getDocs.mockImplementation(async (ref: { path: string }) => {
      if (ref.path === `${SESSION_REF}/registrations`) {
        return makeQuerySnap([{ id: "u1", data: {} }, { id: "u2", data: {} }], ref.path);
      }
      if (ref.path === `${SESSION_REF}/waitlist`) {
        return makeQuerySnap([{ id: "w1", data: {} }], ref.path);
      }
      throw new Error(`unexpected getDocs path: ${ref.path}`);
    });
    const batch = makeFakeBatch();
    h.writeBatch.mockReturnValue(batch);

    await db.deleteSession(S);

    expect(h.getDocs).toHaveBeenCalledTimes(2);
    expect(batch.commit).toHaveBeenCalledTimes(1);
    const deleted = batch.ops.filter((o) => o.type === "delete").map((o) => o.ref.path);
    expect(deleted).toEqual([
      `${SESSION_REF}/registrations/u1`,
      `${SESSION_REF}/registrations/u2`,
      `${SESSION_REF}/waitlist/w1`,
      SESSION_REF,
    ]);
  });
});
