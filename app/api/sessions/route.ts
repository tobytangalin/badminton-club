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

  const { date, startTime, endTime, location, capacity } = body ?? {};
  if (
    typeof date !== "string" ||
    typeof startTime !== "string" ||
    typeof endTime !== "string" ||
    typeof location !== "string"
  ) {
    return json({ error: "Invalid session payload" }, 400);
  }
  if (
    capacity !== undefined &&
    capacity !== null &&
    (!Number.isInteger(capacity) || capacity < 1)
  ) {
    return json({ error: "Invalid session payload" }, 400);
  }

  const db = getAdminDb();
  const ref = await db.collection("sessions").add({
    date,
    startTime,
    endTime,
    location,
    ...(capacity === undefined || capacity === null ? {} : { capacity }),
    count: 0,
    createdAt: FieldValue.serverTimestamp(),
  });

  return json({ ok: true, id: ref.id }, 201);
}
