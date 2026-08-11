"use client";

import { useState } from "react";
import { Avatar } from "@/components/Avatar";
import { joinWaitlist, leaveWaitlist, registerForSession, unregisterFromSession } from "@/lib/db";
import { formatSessionDate } from "@/lib/date";
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
  isRegistered: boolean;
  isWaitlisted: boolean;
  waitlistPosition: number;
  onStatusChanged: (sessionId: string, status: { registered: boolean; waitlisted: boolean }) => void;
  onRefreshRoster: (sessionId: string) => void;
}

export function SessionCard({
  sessionId,
  session,
  registrations,
  currentUid,
  currentNickname,
  currentPhotoUrl,
  needsProfile,
  isRegistered,
  isWaitlisted,
  waitlistPosition,
  onStatusChanged,
  onRefreshRoster,
}: SessionCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showAllPlayers, setShowAllPlayers] = useState(false);
  const PREVIEW_COUNT = 8;

  const capacity = session.capacity;
  const hasCapacity = typeof capacity === "number";
  const isFull = hasCapacity && session.count >= capacity;
  const slotsLeft = hasCapacity ? Math.max(0, capacity - session.count) : 0;
  const waitlistCount = session.waitlistCount ?? 0;
  const perPlayer = perPlayerCost(session);

  async function toggle() {
    if (needsProfile) {
      setError("Set your nickname above to register.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      let next: { registered: boolean; waitlisted: boolean } | null = null;
      if (isRegistered) {
        await unregisterFromSession(sessionId, currentUid);
        next = { registered: false, waitlisted: false };
      } else if (isWaitlisted) {
        await leaveWaitlist(sessionId, currentUid);
        if (!isFull) {
          await registerForSession(sessionId, currentUid, {
            nickname: currentNickname,
            photoUrl: currentPhotoUrl,
          });
          next = { registered: true, waitlisted: false };
        } else {
          next = { registered: false, waitlisted: false };
        }
      } else if (isFull) {
        await joinWaitlist(sessionId, currentUid, {
          nickname: currentNickname,
          photoUrl: currentPhotoUrl,
        });
        next = { registered: false, waitlisted: true };
      } else {
        await registerForSession(sessionId, currentUid, {
          nickname: currentNickname,
          photoUrl: currentPhotoUrl,
        });
        next = { registered: true, waitlisted: false };
      }
      if (next) onStatusChanged(sessionId, next);
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
          <h3 className="text-lg font-bold text-slate-900">
            {session.location} - {formatSessionDate(session.date)}
          </h3>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-600">
            <span>
              🕖 {session.startTime}–{session.endTime}
            </span>
          </p>
        </div>
        {hasCapacity && (
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
        )}
      </div>

      {session.description && (
        <p className="mt-3 whitespace-pre-line text-sm text-slate-600">
          {session.description}
        </p>
      )}

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
          Signed up ({registrations.length}
          {hasCapacity ? `/${session.capacity}` : ""})
          {waitlistCount > 0 && (
            <span className="ml-2 normal-case text-indigo-600">
              · {waitlistCount} on waitlist
            </span>
          )}
        </p>
        {registrations.length === 0 ? (
          <p className="text-sm text-slate-500">No one signed up yet. Be the first!</p>
        ) : (
          <>
            <ul className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {(showAllPlayers ? registrations : registrations.slice(0, PREVIEW_COUNT)).map(
                (r) => (
                  <li key={r.uid} className="group relative">
                    <button
                      type="button"
                      aria-label={r.nickname}
                      className="block rounded-full focus-visible:outline-2 focus-visible:outline-teal-500"
                    >
                      <Avatar src={r.photoUrl} name={r.nickname} size="sm" />
                    </button>
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                      {r.nickname}
                    </span>
                  </li>
                )
              )}
            </ul>
            {registrations.length > PREVIEW_COUNT && (
              <button
                type="button"
                onClick={() => {
                  const next = !showAllPlayers;
                  setShowAllPlayers(next);
                  if (next) onRefreshRoster(sessionId);
                }}
                className="mt-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
              >
                {showAllPlayers
                  ? "Show fewer"
                  : `and ${registrations.length - PREVIEW_COUNT} more`}
              </button>
            )}
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4">
        {isWaitlisted && !isRegistered && (
          <p className="mb-2 text-sm font-medium text-indigo-700">
            {isFull
              ? `You're #${waitlistPosition || "?"} on the waitlist. You'll be moved in automatically if a spot opens.`
              : "A spot just opened, claim it now!"}
          </p>
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={cn(
            "w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 sm:w-auto",
            isRegistered
              ? "border border-slate-300 text-slate-700 hover:bg-slate-50"
              : isWaitlisted
                ? "border border-indigo-600 text-indigo-700 hover:bg-indigo-50"
                : "bg-teal-600 text-white hover:bg-teal-700"
          )}
        >
          {busy
            ? "Working…"
            : isRegistered
              ? "Leave session"
              : isWaitlisted
                ? isFull
                  ? "Leave waitlist"
                  : "Join now"
                : isFull
                  ? "Join waitlist"
                  : "Register"}
        </button>
      </div>
    </article>
  );
}
