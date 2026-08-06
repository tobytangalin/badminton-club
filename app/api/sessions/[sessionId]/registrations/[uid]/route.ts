import type { NextRequest } from "next/server";
import { getAdminDb, json, requireAdminUser } from "@/lib/firebase-admin";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; uid: string }> }
) {
  if (!(await requireAdminUser(request))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { sessionId, uid } = await params;

  const db = getAdminDb();
  const sessionRef = db.collection("sessions").doc(sessionId);
  const regRef = sessionRef.collection("registrations").doc(uid);

  const regSnap = await regRef.get();
  if (!regSnap.exists) {
    return json({ error: "User is not registered" }, 404);
  }

  await db.runTransaction(async (tx) => {
    tx.delete(regRef);
    const session = await tx.get(sessionRef);
    if (session.exists) {
      tx.update(sessionRef, { count: session.data()!.count - 1 });
    }
  });

  return json({ ok: true });
}
