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
