import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb, json } from "@/lib/firebase-admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  let callerUid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(header.slice("Bearer ".length));
    callerUid = decoded.uid;
  } catch {
    return json({ error: "Unauthorized" }, 401);
  }

  const { uid } = await params;

  try {
    const db = getAdminDb();

    const callerSnap = await db.collection("users").doc(callerUid).get();
    const isAdmin = callerSnap.data()?.role === "admin";

    if (callerUid !== uid && !isAdmin) {
      return json({ error: "Forbidden" }, 403);
    }
    if (callerUid === uid && isAdmin) {
      return json({ error: "Admins cannot delete their own account." }, 400);
    }

    const batch = db.batch();

    const [given, received] = await Promise.all([
      db.collection("ratings").where("raterUid", "==", uid).get(),
      db.collection("ratings").where("ratedUid", "==", uid).get(),
    ]);
    const ratingIds = new Set<string>();
    given.forEach((d) => ratingIds.add(d.id));
    received.forEach((d) => ratingIds.add(d.id));
    ratingIds.forEach((id) => batch.delete(db.collection("ratings").doc(id)));

    // The ratings the target *gave* also count toward other users' denormalized
    // aggregates, so decrement them (only if those user docs still exist).
    const givenByRated = new Map<string, number>();
    given.forEach((d) => {
      const r = d.data() as { ratedUid: string; stars: number };
      givenByRated.set(r.ratedUid, (givenByRated.get(r.ratedUid) ?? 0) + r.stars);
    });
    const ratedUserRefs = [...givenByRated.keys()].map((ratedUid) =>
      db.collection("users").doc(ratedUid)
    );
    const existingRatedUsers = new Set(
      ratedUserRefs.length
        ? (await db.getAll(...ratedUserRefs)).filter((s) => s.exists).map((s) => s.id)
        : []
    );
    givenByRated.forEach((sum, ratedUid) => {
      if (!existingRatedUsers.has(ratedUid)) return;
      batch.update(db.collection("users").doc(ratedUid), {
        ratingCount: FieldValue.increment(-1),
        ratingSum: FieldValue.increment(-sum),
      });
    });

    const regs = await db.collectionGroup("registrations").where("uid", "==", uid).get();
    const countsBySession = new Map<string, number>();
    regs.forEach((d) => {
      const sessionId = d.ref.path.split("/")[1];
      countsBySession.set(sessionId, (countsBySession.get(sessionId) ?? 0) + 1);
      batch.delete(d.ref);
    });

    const sessionRefs = [...countsBySession.keys()].map((sessionId) =>
      db.collection("sessions").doc(sessionId)
    );
    const existingSessions = new Set(
      sessionRefs.length ? (await db.getAll(...sessionRefs)).filter((s) => s.exists).map((s) => s.id) : []
    );
    countsBySession.forEach((n, sessionId) => {
      if (existingSessions.has(sessionId)) {
        batch.update(db.collection("sessions").doc(sessionId), {
          count: FieldValue.increment(-n),
        });
      }
    });

    const wl = await db.collectionGroup("waitlist").where("uid", "==", uid).get();
    const wlCountsBySession = new Map<string, number>();
    wl.forEach((d) => {
      const sessionId = d.ref.path.split("/")[1];
      wlCountsBySession.set(sessionId, (wlCountsBySession.get(sessionId) ?? 0) + 1);
      batch.delete(d.ref);
    });
    const wlSessionRefs = [...wlCountsBySession.keys()].map((sessionId) =>
      db.collection("sessions").doc(sessionId)
    );
    const existingWlSessions = new Set(
      wlSessionRefs.length ? (await db.getAll(...wlSessionRefs)).filter((s) => s.exists).map((s) => s.id) : []
    );
    wlCountsBySession.forEach((n, sessionId) => {
      if (existingWlSessions.has(sessionId)) {
        batch.update(db.collection("sessions").doc(sessionId), {
          waitlistCount: FieldValue.increment(-n),
        });
      }
    });

    batch.delete(db.collection("users").doc(uid));
    await batch.commit();

    try {
      await getAdminAuth().deleteUser(uid);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code && code !== "auth/user-not-found") throw err;
    }

    return json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/admin/users/[uid] failed", uid, err);
    return json({ error: "Delete failed: " + String((err as Error)?.message ?? err) }, 500);
  }
}
