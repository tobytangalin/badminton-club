import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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

export async function adminAddRegistration(
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
    if (regSnap.exists()) throw new Error("Already registered.");
    if (!sessionSnap.exists()) throw new Error("Session not found.");
    tx.set(regRef, {
      uid,
      nickname: user.nickname,
      photoUrl: user.photoUrl ?? "",
      createdAt: serverTimestamp(),
    } satisfies Registration);
    tx.update(sessionRef, { count: increment(1) });
  });
}

export async function unregisterFromSession(
  sessionId: string,
  uid: string
): Promise<void> {
  const db = getDb();
  await runTransaction(db, async (tx) => {
    const sessionRef = sessionDoc(sessionId);
    const regRef = doc(registrationsRef(sessionId), uid);
    const [regSnap, sessionSnap] = await Promise.all([
      tx.get(regRef),
      tx.get(sessionRef),
    ]);
    if (!regSnap.exists()) throw new Error("You are not registered.");
    tx.delete(regRef);
    const session = sessionSnap.data() as SessionDoc | undefined;
    if (session) tx.update(sessionRef, { count: increment(-1) });
  });
}

export async function setStars(
  ratedUid: string,
  raterUid: string,
  stars: number
): Promise<void> {
  const db = getDb();
  const ref = doc(db, "ratings", ratingId(ratedUid, raterUid));
  const snap = await getDoc(ref);
  if (snap.exists()) {
    await updateDoc(ref, { stars });
  } else {
    await setDoc(ref, {
      ratedUid,
      raterUid,
      stars,
      createdAt: serverTimestamp(),
    } satisfies Rating);
  }
}

export async function clearRating(ratedUid: string, raterUid: string): Promise<void> {
  const db = getDb();
  await deleteDoc(doc(db, "ratings", ratingId(ratedUid, raterUid)));
}

const LEADERBOARD_TTL_MS = 60_000;
const leaderboardCache = new Map<string, { data: LeaderboardEntry[]; expiresAt: number }>();

export function invalidateLeaderboardCache(): void {
  leaderboardCache.clear();
}

export async function fetchLeaderboard(
  raterUid: string
): Promise<LeaderboardEntry[]> {
  const cached = leaderboardCache.get(raterUid);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const db = getDb();
  const [usersSnap, ratingsSnap] = await Promise.all([
    getDocs(usersRef()),
    getDocs(collection(db, "ratings")),
  ]);

  const users = usersSnap.docs.map((d) => ({
    uid: d.id,
    nickname: (d.data().nickname as string) ?? "",
    photoUrl: (d.data().photoUrl as string) ?? undefined,
  }));

  const byRated = new Map<string, number[]>();
  const myStars = new Map<string, number>();
  for (const d of ratingsSnap.docs) {
    const r = d.data() as Rating;
    if (!byRated.has(r.ratedUid)) byRated.set(r.ratedUid, []);
    byRated.get(r.ratedUid)!.push(r.stars);
    if (r.raterUid === raterUid) myStars.set(r.ratedUid, r.stars);
  }

  const result = users
    .map((u) => {
      const all = byRated.get(u.uid) ?? [];
      const sum = all.reduce((a, b) => a + b, 0);
      return {
        ...u,
        avg: all.length ? sum / all.length : 0,
        count: all.length,
        myStars: myStars.get(u.uid) ?? null,
      };
    })
    .sort(
      (a, b) => b.avg - a.avg || b.count - a.count || a.nickname.localeCompare(b.nickname)
    );

  leaderboardCache.set(raterUid, {
    data: result,
    expiresAt: Date.now() + LEADERBOARD_TTL_MS,
  });

  return result;
}

export async function createSession(
  data: Omit<SessionDoc, "count" | "createdAt">
): Promise<void> {
  await setDoc(doc(sessionsRef()), {
    ...data,
    count: 0,
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
  const regs = await getDocs(registrationsRef(id));
  const batch = writeBatch(getDb());
  regs.forEach((d) => batch.delete(d.ref));
  batch.delete(sessionDoc(id));
  await batch.commit();
}

export async function setUserRole(uid: string, role: "member" | "admin"): Promise<void> {
  await updateDoc(userDoc(uid), { role });
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
