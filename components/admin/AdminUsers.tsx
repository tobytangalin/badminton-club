"use client";

import { useCallback, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { Avatar } from "@/components/Avatar";
import { deleteUserAccount, setUserApproved, setUserRole, usersRef } from "@/lib/db";
import { useWhenVisible } from "@/lib/useWhenVisible";
import type { Role, UserDoc } from "@/lib/types";

interface UserEntry {
  uid: string;
  data: UserDoc;
}

export function AdminUsers({ currentUid }: { currentUid: string }) {
  const [users, setUsers] = useState<UserEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const subscribe = useCallback(() => {
    const unsub = onSnapshot(usersRef(), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, data: d.data() as UserDoc })));
    });
    return unsub;
  }, []);

  useWhenVisible(subscribe);

  async function toggleRole(uid: string, current: Role) {
    setBusy(uid);
    setError("");
    try {
      await setUserRole(uid, current === "admin" ? "member" : "admin");
    } catch (err) {
      console.error(err);
      setError("Could not update role.");
    } finally {
      setBusy(null);
    }
  }

  async function approveUser(uid: string, approved: boolean) {
    setBusy(uid);
    setError("");
    try {
      await setUserApproved(uid, approved);
    } catch (err) {
      console.error(err);
      setError("Could not update approval status.");
    } finally {
      setBusy(null);
    }
  }

  async function removeUser(uid: string, nickname: string) {
    if (
      !window.confirm(
        `Delete ${nickname || "this user"}? This permanently removes their account, ratings and registrations.`
      )
    ) {
      return;
    }
    setBusy(uid);
    setError("");
    try {
      await deleteUserAccount(uid);
    } catch (err) {
      console.error(err);
      setError("Could not delete user.");
    } finally {
      setBusy(null);
    }
  }

  if (!users) return <p className="py-8 text-center text-slate-400">Loading users…</p>;

  const sorted = users.slice().sort((a, b) => {
    const aPending = a.data.approved === false ? 0 : 1;
    const bPending = b.data.approved === false ? 0 : 1;
    return aPending - bPending || a.data.nickname.localeCompare(b.data.nickname);
  });

  const pendingCount = users.filter((u) => u.data.approved === false).length;

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <p className="mb-3 text-sm text-slate-500">
        {users.length} registered user{users.length === 1 ? "" : "s"}
        {pendingCount > 0 && (
          <span className="ml-1 text-amber-700">— {pendingCount} awaiting approval</span>
        )}
      </p>
      <ul className="space-y-2">
        {sorted.map((u) => {
          const isSelf = u.uid === currentUid;
          const isAdmin = u.data.role === "admin";
          const isPending = u.data.approved === false;
          return (
            <li
              key={u.uid}
              className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
            >
              <Avatar src={u.data.photoUrl} name={u.data.nickname} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {u.data.nickname || "Unnamed"}
                  {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{u.data.email}</p>
              </div>
              <span
                className={
                  isAdmin
                    ? "rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-700"
                    : isPending
                      ? "rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700"
                      : "rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500"
                }
              >
                {isAdmin ? "admin" : isPending ? "pending" : "member"}
              </span>
              {!isSelf && (
                <div className="flex shrink-0 gap-2">
                  {isPending ? (
                    <button
                      type="button"
                      disabled={busy === u.uid}
                      onClick={() => approveUser(u.uid, true)}
                      className="rounded-lg border border-teal-300 bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700 hover:bg-teal-100 disabled:opacity-50"
                    >
                      Approve
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy === u.uid}
                      onClick={() => toggleRole(u.uid, u.data.role)}
                      className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isAdmin ? "Remove admin role" : "Make admin"}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy === u.uid}
                    onClick={() => removeUser(u.uid, u.data.nickname)}
                    className="rounded-lg border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
