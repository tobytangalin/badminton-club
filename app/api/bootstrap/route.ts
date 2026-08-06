import { getAdminDb, json } from "@/lib/firebase-admin";

/**
 * Bootstraps the first admin account.
 *
 * The Firestore rules give default role "member" to everyone, so the very
 * first admin cannot be promoted through the app itself. Set ADMIN_EMAILS
 * (comma separated) as an environment variable, then call this endpoint once.
 * It will only promote a user if no admin exists yet.
 */
export async function POST() {
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    return json({ error: "Set ADMIN_EMAILS env var first." }, 400);
  }

  let db;
  try {
    db = getAdminDb();
  } catch (err) {
    return json(
      { error: "Server-side Firebase is not configured.", detail: String(err) },
      503
    );
  }

  const existingAdmins = await db
    .collection("users")
    .where("role", "==", "admin")
    .limit(1)
    .get();

  if (!existingAdmins.empty) {
    return json({ error: "An admin already exists." }, 409);
  }

  const users = await db
    .collection("users")
    .where("email", "in", adminEmails)
    .get();

  if (users.empty) {
    return json(
      { error: "No matching user found. Make sure they have signed in at least once." },
      404
    );
  }

  const batch = db.batch();
  users.forEach((user) => batch.update(user.ref, { role: "admin" }));
  await batch.commit();

  return json({ ok: true, promoted: users.docs.map((d) => d.id) });
}
