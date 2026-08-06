import type { NextRequest } from "next/server";
import {
  applicationDefault,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

let initialized = false;

function init() {
  if (initialized) return;
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }
  initialized = true;
}

export function getAdminDb(): Firestore {
  try {
    init();
    return getFirestore();
  } catch (err) {
    throw new Error(
      "Server-side Firebase is not configured. Set GOOGLE_APPLICATION_CREDENTIALS or deploy with Workload Identity. (" +
        String(err) +
        ")"
    );
  }
}

export function getAdminAuth(): Auth {
  init();
  return getAuth();
}

export async function requireAdminUser(
  request: NextRequest
): Promise<{ uid: string } | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    const user = await getAdminDb().collection("users").doc(decoded.uid).get();
    if (!user.exists || user.data()?.role !== "admin") return null;
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
