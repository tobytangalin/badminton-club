import type { NextRequest } from "next/server";
import { getAdminDb, json, requireAdminUser } from "@/lib/firebase-admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!(await requireAdminUser(request))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { sessionId } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const db = getAdminDb();
  const ref = db.collection("sessions").doc(sessionId);
  const existing = await ref.get();
  if (!existing.exists) {
    return json({ error: "Session not found" }, 404);
  }

  const update: Record<string, unknown> = {};
  for (const key of ["title", "day", "time", "location"] as const) {
    if (typeof body?.[key] === "string") update[key] = body[key];
  }
  if (Number.isInteger(body?.capacity) && body.capacity >= 1) {
    update.capacity = body.capacity;
  }
  if (Object.keys(update).length === 0) {
    return json({ error: "Nothing to update" }, 400);
  }

  await ref.update(update);
  return json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  if (!(await requireAdminUser(request))) {
    return json({ error: "Unauthorized" }, 401);
  }
  const { sessionId } = await params;

  const db = getAdminDb();
  const ref = db.collection("sessions").doc(sessionId);
  const existing = await ref.get();
  if (!existing.exists) {
    return json({ error: "Session not found" }, 404);
  }

  // Delete registration subcollection docs, then the session doc.
  const regs = await ref.collection("registrations").get();
  const batch = db.batch();
  regs.forEach((r) => batch.delete(r.ref));
  batch.delete(ref);
  await batch.commit();

  return json({ ok: true });
}
