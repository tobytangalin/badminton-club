import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { getAuthClient, getDb, getStorageClient } from "@/lib/firebase";
import type {
  LeaderboardEntry,
  Rating,
  Registration,
  SessionDoc,
  UserDoc,
  WaitlistEntry,
} from "@/lib/types";

export function usersRef() {
  return collection(getDb(), "users");
}

export function userDoc(uid: string) {
  return doc(getDb(), "users", uid);
}

export function sessionsRef() {
  return collection(getDb(), "sessions");
}

export function sessionDoc(id: string) {
  return doc(getDb(), "sessions", id);
}

export function registrationsRef(sessionId: string) {
  return collection(getDb(), "sessions", sessionId, "registrations");
}

export function waitlistRef(sessionId: string) {
  return collection(getDb(), "sessions", sessionId, "waitlist");
}

export function ratingsRef() {
  return collection(getDb(), "ratings");
}

export async function ensureUserDoc(
  uid: string,
  data: Partial<UserDoc>
): Promise<void> {
  const ref = userDoc(uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      nickname: "",
      role: "member",
      approved: false,
      ...data,
      createdAt: serverTimestamp(),
    });
  }
}

export async function updateUserProfile(
  uid: string,
  data: Pick<UserDoc, "nickname"> & { photoUrl?: string }
): Promise<void> {
  await updateDoc(userDoc(uid), data);
}

export async function uploadProfilePhoto(file: Blob, uid: string): Promise<string> {
  const ref = storageRef(getStorageClient(), `profile-pics/${uid}`);
  await uploadBytes(ref, file, {
    contentType: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  });
  return getDownloadURL(ref);
}

export async function registerForSession(
  sessionId: string,
  uid: string,
  user: Pick<UserDoc, "nickname"> & { photoUrl?: string }
): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const sessionRef = sessionDoc(sessionId);
    const regRef = doc(registrationsRef(sessionId), uid);
    const [regSnap, sessionSnap] = await Promise.all([
      tx.get(regRef),
      tx.get(sessionRef),
    ]);
    if (regSnap.exists()) throw new Error("You are already registered.");
    const session = sessionSnap.data() as SessionDoc | undefined;
    if (!session) throw new Error("Session not found.");
    if (typeof session.capacity === "number" && session.count >= session.capacity) {
      throw new Error("Session is full.");
    }
    tx.set(regRef, {
      uid,
      nickname: user.nickname,
      photoUrl: user.photoUrl ?? "",
      createdAt: serverTimestamp(),
    } satisfies Registration);
    tx.update(sessionRef, { count: increment(1) });
  });
}

export interface ParticipantToAdd {
  uid: string;
  nickname: string;
  photoUrl?: string;
}

export interface ParticipantChanges {
  add: ParticipantToAdd[];
  remove: string[];
}

/**
 * Bulk admin add/remove of session participants in ONE transaction.
 * Adds write registrations (clearing any stale waitlist doc), removes delete
 * registrations and auto-promote the oldest waitlisted members into freed
 * spots. Atomic: any failure rolls the whole save back.
 */
export async function adminApplyParticipantChanges(
  sessionId: string,
  { add, remove }: ParticipantChanges
): Promise<void> {
  const db = getDb();
  const sessionRef = sessionDoc(sessionId);

  let waitlist: WaitlistEntry[] = [];
  if (remove.length > 0) {
    const wlSnap = await getDocs(
      query(waitlistRef(sessionId), orderBy("createdAt"), limit(remove.length))
    );
    waitlist = wlSnap.docs.map((d) => d.data() as WaitlistEntry);
  }

  await runTransaction(db, async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists()) throw new Error("Session not found.");

    // Firestore requires ALL reads before ANY write, so gather every snapshot
    // we need up front, then perform all writes below.
    const addEntries = add.map((user) => ({
      user,
      regRef: doc(registrationsRef(sessionId), user.uid),
      wlRef: doc(waitlistRef(sessionId), user.uid),
    }));
    const removeEntries = remove.map((uid) => ({
      uid,
      regRef: doc(registrationsRef(sessionId), uid),
    }));

    const [addRegSnaps, addWlSnaps, removeRegSnaps] = await Promise.all([
      Promise.all(addEntries.map((e) => tx.get(e.regRef))),
      Promise.all(addEntries.map((e) => tx.get(e.wlRef))),
      Promise.all(removeEntries.map((e) => tx.get(e.regRef))),
    ]);

    const removedCount = removeRegSnaps.filter((s) => s.exists).length;

    // Promotion candidates: the oldest waitlisted members, capped at the
    // number of spots actually freed. Read their docs now (before writes).
    const candidates = removedCount > 0 ? waitlist.slice(0, removedCount) : [];
    const candEntries = candidates.map((head) => ({
      head,
      wlRef: doc(waitlistRef(sessionId), head.uid),
      regRef: doc(registrationsRef(sessionId), head.uid),
    }));
    const [candWlSnaps, candRegSnaps] = await Promise.all([
      Promise.all(candEntries.map((c) => tx.get(c.wlRef))),
      Promise.all(candEntries.map((c) => tx.get(c.regRef))),
    ]);

    let countDelta = 0;
    let wlDelta = 0;
    const added = new Set<string>();
    const removedSet = new Set(remove);

    addEntries.forEach((e, i) => {
      if (addRegSnaps[i].exists()) return;
      tx.set(e.regRef, {
        uid: e.user.uid,
        nickname: e.user.nickname,
        photoUrl: e.user.photoUrl ?? "",
        createdAt: serverTimestamp(),
      } satisfies Registration);
      added.add(e.user.uid);
      countDelta += 1;
      if (addWlSnaps[i].exists()) {
        tx.delete(e.wlRef);
        wlDelta -= 1;
      }
    });

    removeEntries.forEach((e, i) => {
      if (!removeRegSnaps[i].exists()) return;
      tx.delete(e.regRef);
      countDelta -= 1;
    });

    let freeSpots = removedCount;
    candEntries.forEach((c, i) => {
      if (freeSpots === 0) return;
      if (added.has(c.head.uid) || removedSet.has(c.head.uid)) return;
      if (!candWlSnaps[i].exists() || candRegSnaps[i].exists()) return;
      tx.set(c.regRef, {
        uid: c.head.uid,
        nickname: c.head.nickname,
        photoUrl: c.head.photoUrl ?? "",
        createdAt: serverTimestamp(),
      } satisfies Registration);
      tx.delete(c.wlRef);
      countDelta += 1;
      wlDelta -= 1;
      freeSpots -= 1;
    });

    if (countDelta !== 0) tx.update(sessionRef, { count: increment(countDelta) });
    if (wlDelta !== 0) tx.update(sessionRef, { waitlistCount: increment(wlDelta) });
  });
}

export async function unregisterFromSession(
  sessionId: string,
  uid: string
): Promise<void> {
  const db = getDb();
  const sessionRef = sessionDoc(sessionId);
  const regRef = doc(registrationsRef(sessionId), uid);

  // tx.get only accepts document refs, so find the waitlist head first and
  // re-check the candidate inside the transaction (it may have moved).
  const headSnap = await getDocs(query(waitlistRef(sessionId), orderBy("createdAt"), limit(1)));
  const headUid = headSnap.docs[0]?.id;

  await runTransaction(db, async (tx) => {
    const headRef = headUid ? doc(waitlistRef(sessionId), headUid) : null;
    // All reads first (Firestore forbids reads after writes in a transaction).
    const [regSnap, sessionSnap, headDoc] = await Promise.all([
      tx.get(regRef),
      tx.get(sessionRef),
      headRef ? tx.get(headRef) : Promise.resolve(undefined),
    ]);
    if (!regSnap.exists()) throw new Error("You are not registered.");

    tx.delete(regRef);
    const session = sessionSnap.data() as SessionDoc | undefined;
    if (!session) return;

    if (!headRef || !headDoc || !headDoc.exists()) {
      tx.update(sessionRef, { count: increment(-1) });
      return;
    }

    const head = headDoc.data() as WaitlistEntry;
    tx.set(doc(registrationsRef(sessionId), head.uid), {
      uid: head.uid,
      nickname: head.nickname,
      photoUrl: head.photoUrl ?? "",
      createdAt: serverTimestamp(),
    } satisfies Registration);
    tx.delete(headRef);
    tx.update(sessionRef, {
      count: increment(-1),
      waitlistCount: increment(-1),
    });
  });
}

export async function joinWaitlist(
  sessionId: string,
  uid: string,
  user: Pick<UserDoc, "nickname"> & { photoUrl?: string }
): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const sessionRef = sessionDoc(sessionId);
    const wlRef = doc(waitlistRef(sessionId), uid);
    const [wlSnap, regSnap, sessionSnap] = await Promise.all([
      tx.get(wlRef),
      tx.get(doc(registrationsRef(sessionId), uid)),
      tx.get(sessionRef),
    ]);
    if (wlSnap.exists()) throw new Error("You are already on the waitlist.");
    if (regSnap.exists()) throw new Error("You are already registered.");
    const session = sessionSnap.data() as SessionDoc | undefined;
    if (!session) throw new Error("Session not found.");
    if (typeof session.capacity !== "number" || session.count < session.capacity) {
      throw new Error("Session is not full.");
    }
    tx.set(wlRef, {
      uid,
      nickname: user.nickname,
      photoUrl: user.photoUrl ?? "",
      createdAt: serverTimestamp(),
    } satisfies WaitlistEntry);
    tx.update(sessionRef, { waitlistCount: increment(1) });
  });
}

export async function leaveWaitlist(sessionId: string, uid: string): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const sessionRef = sessionDoc(sessionId);
    const wlRef = doc(waitlistRef(sessionId), uid);
    const wlSnap = await tx.get(wlRef);
    if (!wlSnap.exists()) throw new Error("You are not on the waitlist.");
    tx.delete(wlRef);
    tx.update(sessionRef, { waitlistCount: increment(-1) });
  });
}

export async function setStars(
  ratedUid: string,
  raterUid: string,
  stars: number
): Promise<void> {
  const db = getDb();
  const ratingRef = doc(db, "ratings", ratingId(ratedUid, raterUid));
  const ratedRef = userDoc(ratedUid);
  const raterRef = userDoc(raterUid);
  await runTransaction(db, async (tx) => {
    // All reads first (Firestore forbids reads after writes in a transaction).
    const [ratingSnap, ratedSnap, raterSnap] = await Promise.all([
      tx.get(ratingRef),
      tx.get(ratedRef),
      tx.get(raterRef),
    ]);
    const rated = ratedSnap.data() as UserDoc | undefined;
    const rater = raterSnap.data() as UserDoc | undefined;

    const prevStars = ratingSnap.exists()
      ? (ratingSnap.data() as Rating).stars
      : null;
    const ratedSum = (rated?.ratingSum ?? 0) + (stars - (prevStars ?? 0));
    const ratedCount = (rated?.ratingCount ?? 0) + (prevStars === null ? 1 : 0);

    tx.set(ratingRef, {
      ratedUid,
      raterUid,
      stars,
      createdAt: ratingSnap.exists()
        ? (ratingSnap.data() as Rating).createdAt
        : serverTimestamp(),
    } satisfies Rating);

    tx.update(ratedRef, { ratingSum: ratedSum, ratingCount: ratedCount });
    tx.update(raterRef, {
      myRatings: { ...(rater?.myRatings ?? {}), [ratedUid]: stars },
    });
  });
}

export async function clearRating(ratedUid: string, raterUid: string): Promise<void> {
  const db = getDb();
  const ratingRef = doc(db, "ratings", ratingId(ratedUid, raterUid));
  const ratedRef = userDoc(ratedUid);
  const raterRef = userDoc(raterUid);
  await runTransaction(db, async (tx) => {
    const [ratingSnap, ratedSnap, raterSnap] = await Promise.all([
      tx.get(ratingRef),
      tx.get(ratedRef),
      tx.get(raterRef),
    ]);
    if (!ratingSnap.exists()) return;
    const { stars } = ratingSnap.data() as Rating;
    const rated = ratedSnap.data() as UserDoc | undefined;
    const rater = raterSnap.data() as UserDoc | undefined;

    tx.delete(ratingRef);
    tx.update(ratedRef, {
      ratingSum: Math.max(0, (rated?.ratingSum ?? 0) - stars),
      ratingCount: Math.max(0, (rated?.ratingCount ?? 0) - 1),
    });
    const myRatings = { ...(rater?.myRatings ?? {}) };
    delete myRatings[ratedUid];
    tx.update(raterRef, { myRatings });
  });
}

const LEADERBOARD_TTL_MS = 600_000;
const LEADERBOARD_CACHE_KEY = "sb:leaderboard:v1";
let leaderboardCache: { data: LeaderboardEntry[]; expiresAt: number } | null = null;

function readStoredCache<T>(key: string): { data: T; expiresAt: number } | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: T; expiresAt: number };
    if (typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredCache<T>(key: string, cached: { data: T; expiresAt: number }): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(cached));
  } catch {
    // Storage quota/failure — the in-memory cache still works for this tab.
  }
}

function removeStoredCache(key: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures; the in-memory cache is the source of truth.
  }
}

function readStoredLeaderboard(): { data: LeaderboardEntry[]; expiresAt: number } | null {
  const cached = readStoredCache<LeaderboardEntry[]>(LEADERBOARD_CACHE_KEY);
  return cached && Array.isArray(cached.data) ? cached : null;
}

export function invalidateLeaderboardCache(): void {
  leaderboardCache = null;
  removeStoredCache(LEADERBOARD_CACHE_KEY);
}

/** True when the next `fetchLeaderboard` would serve from cache (no Firestore read). */
export function isLeaderboardCacheFresh(): boolean {
  const now = Date.now();
  if (leaderboardCache && leaderboardCache.expiresAt > now) return true;
  const stored = readStoredCache<LeaderboardEntry[]>(LEADERBOARD_CACHE_KEY);
  return !!stored && stored.expiresAt > now && Array.isArray(stored.data);
}

export async function fetchLeaderboard(
  raterUid: string,
  myRatings?: Record<string, number>
): Promise<LeaderboardEntry[]> {
  const now = Date.now();
  let cached = leaderboardCache;
  if (!cached || cached.expiresAt <= now) {
    const stored = readStoredLeaderboard();
    if (stored && stored.expiresAt > now) {
      leaderboardCache = stored;
      cached = stored;
    }
  }
  if (cached) {
    return mergeMyStars(cached.data, raterUid, myRatings);
  }

  const usersSnap = await getDocs(usersRef());
  const result = usersSnap.docs
    .filter((d) => d.data().approved ?? true)
    .map((d) => {
      const data = d.data() as UserDoc;
      const count = data.ratingCount ?? 0;
      const avg = count > 0 ? (data.ratingSum ?? 0) / count : 0;
      return {
        uid: d.id,
        nickname: (data.nickname as string) ?? "",
        photoUrl: data.photoUrl ?? undefined,
        avg,
        count,
        myStars: null,
      };
    })
    .sort(
      (a, b) => b.avg - a.avg || b.count - a.count || a.nickname.localeCompare(b.nickname)
    );

  cached = {
    data: result,
    expiresAt: Date.now() + LEADERBOARD_TTL_MS,
  };
  leaderboardCache = cached;
  writeStoredCache(LEADERBOARD_CACHE_KEY, cached);

  return mergeMyStars(result, raterUid, myRatings);
}

/** Overlay the current user's own ratings onto the shared base leaderboard. */
function mergeMyStars(
  base: LeaderboardEntry[],
  raterUid: string,
  myRatings?: Record<string, number>
): LeaderboardEntry[] {
  return base.map((e) => ({ ...e, myStars: myRatings?.[e.uid] ?? null }));
}

const MEMBERS_TTL_MS = 600_000;
const MEMBERS_CACHE_KEY = "sb:members:v1";
let membersCache: { data: MemberSummary[]; expiresAt: number } | null = null;

/** Lightweight member summary for pickers; excludes per-user rating aggregates. */
export interface MemberSummary {
  uid: string;
  nickname: string;
  photoUrl?: string;
}

/**
 * Full `users` list for the admin participant picker, cached 10 min in a
 * memory + localStorage hybrid (same pattern as the leaderboard) so opening
 * the picker repeatedly costs zero reads. Pass `force` to bypass the cache.
 */
export async function fetchMembers(force = false): Promise<MemberSummary[]> {
  const now = Date.now();
  if (!force) {
    let cached = membersCache;
    if (!cached || cached.expiresAt <= now) {
      const stored = readStoredCache<MemberSummary[]>(MEMBERS_CACHE_KEY);
      if (stored && stored.expiresAt > now && Array.isArray(stored.data)) {
        membersCache = stored;
        cached = stored;
      }
    }
    if (cached) return cached.data;
  }

  const snap = await getDocs(usersRef());
  const data = snap.docs.map((d) => {
    const u = d.data() as UserDoc;
    return { uid: d.id, nickname: u.nickname ?? "", photoUrl: u.photoUrl };
  });

  const cached = { data, expiresAt: Date.now() + MEMBERS_TTL_MS };
  membersCache = cached;
  writeStoredCache(MEMBERS_CACHE_KEY, cached);

  return data;
}

export function invalidateMembersCache(): void {
  membersCache = null;
  removeStoredCache(MEMBERS_CACHE_KEY);
}

export async function createSession(
  data: Omit<SessionDoc, "count" | "createdAt">
): Promise<void> {
  await setDoc(doc(sessionsRef()), {
    ...data,
    count: 0,
    waitlistCount: 0,
    createdAt: serverTimestamp(),
  });
}

export async function updateSession(
  id: string,
  data: Partial<Omit<SessionDoc, "count" | "createdAt">>
): Promise<void> {
  await updateDoc(sessionDoc(id), data);
}

export async function deleteSession(id: string): Promise<void> {
  const [regs, wl] = await Promise.all([
    getDocs(registrationsRef(id)),
    getDocs(waitlistRef(id)),
  ]);
  const batch = writeBatch(getDb());
  regs.forEach((d) => batch.delete(d.ref));
  wl.forEach((d) => batch.delete(d.ref));
  batch.delete(sessionDoc(id));
  await batch.commit();
}

export async function setUserRole(uid: string, role: "member" | "admin"): Promise<void> {
  await updateDoc(userDoc(uid), { role });
}

export async function setUserApproved(uid: string, approved: boolean): Promise<void> {
  await updateDoc(userDoc(uid), { approved });
}

/** Permanently delete a user (account, profile, ratings, registrations) via the admin API. */
export async function deleteUserAccount(targetUid: string): Promise<void> {
  const token = await getAuthClient().currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in.");
  const res = await fetch(`/api/admin/users/${targetUid}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not delete user.");
  }
}

export function ratingId(ratedUid: string, raterUid: string): string {
  return `${ratedUid}_${raterUid}`;
}
