import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, json, requireAdminUser } from "@/lib/firebase-admin";

export async function POST(request: NextRequest) {
  if (!(await requireAdminUser(request))) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { title, day, time, location, capacity } = body ?? {};
  if (
    typeof title !== "string" ||
    typeof day !== "string" ||
    typeof time !== "string" ||
    typeof location !== "string" ||
    !Number.isInteger(capacity) ||
    capacity < 1
  ) {
    return json({ error: "Invalid session payload" }, 400);
  }

  const db = getAdminDb();
  const ref = await db.collection("sessions").add({
    title,
    day,
    time,
    location,
    capacity,
    count: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  return json({ ok: true, id: ref.id }, 201);
}
