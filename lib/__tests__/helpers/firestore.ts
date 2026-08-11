import { expect, vi } from "vitest";

export interface FakeRef {
  kind: "collection" | "doc";
  path: string;
  id: string;
}

export interface FakeDocSnap {
  id: string;
  exists(): boolean;
  data(): unknown;
  ref: FakeRef;
}

export interface FakeQuerySnap {
  docs: FakeDocSnap[];
  empty: boolean;
  size: number;
  forEach(cb: (d: FakeDocSnap) => void): void;
}

export interface FakeTx {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export function makeDocSnap(ref: FakeRef, data: unknown | null): FakeDocSnap {
  return {
    id: ref.id,
    exists: () => data !== null && data !== undefined,
    data: () => data,
    ref,
  };
}

export function makeQuerySnap(rows: { id: string; data: unknown }[], prefixPath: string): FakeQuerySnap {
  const docs = rows.map((r) => {
    const ref: FakeRef = { kind: "doc", path: `${prefixPath}/${r.id}`, id: r.id };
    return makeDocSnap(ref, r.data);
  });
  return {
    docs,
    empty: docs.length === 0,
    size: docs.length,
    forEach: (cb: (d: FakeDocSnap) => void) => docs.forEach(cb),
  };
}

/**
 * A fake Firestore transaction. Backed by `state` so reads see writes that
 * happened earlier in the transaction, and throws if a read happens after the
 * first write — mirroring the real SDK's "all reads before all writes" rule.
 */
export function makeFakeTx(state: Map<string, unknown>): FakeTx {
  let wrote = false;
  return {
    get: vi.fn(async (ref: FakeRef) => {
      if (wrote) throw new Error("Transactions require all reads before all writes.");
      return makeDocSnap(ref, state.get(ref.path) ?? null);
    }),
    set: vi.fn(async (ref: FakeRef, data: unknown) => {
      wrote = true;
      state.set(ref.path, data);
    }),
    update: vi.fn(async (ref: FakeRef, data: Record<string, unknown>) => {
      wrote = true;
      state.set(ref.path, { ...((state.get(ref.path) as object | undefined) ?? {}), ...data });
    }),
    delete: vi.fn(async (ref: FakeRef) => {
      wrote = true;
      state.delete(ref.path);
    }),
  };
}

export interface FakeBatch {
  ops: { type: "delete" | "update"; ref: FakeRef; data?: unknown }[];
  delete: (ref: FakeRef) => void;
  update: (ref: FakeRef, data: Record<string, unknown>) => void;
  commit: ReturnType<typeof vi.fn>;
}

export function makeFakeBatch(): FakeBatch {
  const ops: FakeBatch["ops"] = [];
  return {
    ops,
    delete(ref) {
      ops.push({ type: "delete", ref });
    },
    update(ref, data) {
      ops.push({ type: "update", ref, data });
    },
    commit: vi.fn(async () => {}),
  };
}

/**
 * Builds the `firebase/firestore` module mock used by `lib/db.ts`. Only the
 * network-touching functions are mocked; ref builders are pure.
 */
export function buildFirestoreModule(fns: {
  getDocs: unknown;
  getDoc: unknown;
  runTransaction: unknown;
  setDoc: unknown;
  updateDoc: unknown;
  writeBatch: unknown;
}) {
  const join = (parts: (string | undefined)[]) => parts.filter(Boolean).join("/");
  const makeRef = (kind: "collection" | "doc", path: string) =>
    ({ kind, path, id: path.split("/").pop() ?? "" }) satisfies FakeRef;
  return {
    collection: (_db: unknown, path: string, ...segs: string[]) =>
      makeRef("collection", join([path, ...segs])),
    doc: (_dbOrRef: unknown, pathOrSeg?: string, ...segs: string[]) => {
      // `doc(collectionRef, ...segs)` and `doc(db, path, ...segs)` both occur.
      const hasRefPath =
        typeof _dbOrRef === "object" &&
        _dbOrRef !== null &&
        typeof (_dbOrRef as { path?: unknown }).path === "string";
      const parts = hasRefPath
        ? [(_dbOrRef as FakeRef).path, pathOrSeg, ...segs]
        : [pathOrSeg, ...segs];
      return makeRef("doc", join(parts));
    },
    getDocs: fns.getDocs,
    getDoc: fns.getDoc,
    runTransaction: fns.runTransaction,
    serverTimestamp: () => "SERVER_TIMESTAMP",
    increment: (n: number) => ({ __increment: n }),
    setDoc: fns.setDoc,
    updateDoc: fns.updateDoc,
    writeBatch: fns.writeBatch,
    orderBy: () => ({ __orderBy: true }),
    limit: (n: number) => ({ __limit: n }),
    query: (...args: unknown[]) => ({ __query: args }),
  };
}

/** Assert all transaction reads happened before the first write. */
export function assertReadsBeforeWrites(tx: FakeTx): void {
  const reads = tx.get.mock.invocationCallOrder;
  const writes = [
    ...tx.set.mock.invocationCallOrder,
    ...tx.update.mock.invocationCallOrder,
    ...tx.delete.mock.invocationCallOrder,
  ];
  if (reads.length > 0 && writes.length > 0) {
    expect(Math.max(...reads)).toBeLessThan(Math.min(...writes));
  }
}
