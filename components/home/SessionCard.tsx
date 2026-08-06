"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { registerForSession, unregisterFromSession } from "@/lib/db";
import { formatMoney, perPlayerCost } from "@/lib/payments";
import type { Registration, SessionDoc } from "@/lib/types";
import { cn } from "@/lib/cn";

interface SessionCardProps {
  sessionId: string;
  session: SessionDoc;
  registrations: Registration[];
  currentUid: string;
  currentNickname: string;
  currentPhotoUrl?: string;
  needsProfile: boolean;
}

export function SessionCard({
  sessionId,
  session,
  registrations,
  currentUid,
  currentNickname,
  currentPhotoUrl,
  needsProfile,
}: SessionCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isRegistered = registrations.some((r) => r.uid === currentUid);
  const slotsLeft = Math.max(0, session.capacity - session.count);
  const isFull = session.count >= session.capacity;
  const perPlayer = perPlayerCost(session);

  async function toggle() {
    if (needsProfile) {
      setError("Set your nickname above to register.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (isRegistered) {
        await unregisterFromSession(sessionId, currentUid);
      } else {
        await registerForSession(sessionId, currentUid, {
          nickname: currentNickname,
          photoUrl: currentPhotoUrl,
        });
      }
    } catch (err) {
      setError((err as Error).message || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{session.title}</h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>🗓 {session.day}</span>
            <span>🕖 {session.time}</span>
            <span>📍 {session.location}</span>
          </p>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            isFull
              ? "bg-red-100 text-red-700"
              : slotsLeft <= 2
                ? "bg-amber-100 text-amber-800"
                : "bg-teal-50 text-teal-700"
          )}
        >
          {isFull ? "Full" : `${slotsLeft} slot${slotsLeft === 1 ? "" : "s"} left`}
        </span>
      </div>

      {perPlayer !== null && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-slate-800">
            💶 {formatMoney(perPlayer)} per player
          </span>
          <span className="text-slate-500">
            · {formatMoney(session.cost!)} total
            {session.playersOverride !== null && session.playersOverride !== undefined
              ? ` · ${session.playersOverride} played`
              : ""}
          </span>
          {isRegistered && (
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700">
              You owe {formatMoney(perPlayer)}
            </span>
          )}
        </p>
      )}

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Signed up ({registrations.length}/{session.capacity})
        </p>
        {registrations.length === 0 ? (
          <p className="text-sm text-slate-500">No one signed up yet — be the first!</p>
        ) : (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {registrations.map((r) => (
              <li key={r.uid} className="flex items-center gap-1.5" title={r.nickname}>
                <Avatar src={r.photoUrl} name={r.nickname} size="sm" />
                <span className="text-sm text-slate-700">{r.nickname}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={cn(
            "w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 sm:w-auto",
            isRegistered
              ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
              : isFull
                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                : "bg-teal-600 text-white hover:bg-teal-700"
          )}
        >
          {busy
            ? "Working…"
            : isRegistered
              ? "Leave session"
              : isFull
                ? "Full"
                : "Register"}
        </button>
      </div>
    </article>
  );
}
