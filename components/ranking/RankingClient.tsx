"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { StarRating } from "@/components/StarRating";
import { Spinner } from "@/components/Spinner";
import {
  clearRating,
  fetchLeaderboard,
  invalidateLeaderboardCache,
  setStars,
} from "@/lib/db";
import type { LeaderboardEntry } from "@/lib/types";

export function RankingClient({ currentUid }: { currentUid: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard(currentUid)
      .then((data) => {
        if (!cancelled) setEntries(data);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError("Could not load the leaderboard.");
      });
    return () => {
      cancelled = true;
    };
  }, [currentUid]);

  async function rate(ratedUid: string, stars: number | null) {
    setBusyUid(ratedUid);
    setError("");
    try {
      if (stars === null) {
        await clearRating(ratedUid, currentUid);
      } else {
        await setStars(ratedUid, currentUid, stars);
      }
      invalidateLeaderboardCache();
      setEntries((prev) => (prev ? applyRating(prev, ratedUid, stars) : prev));
    } catch (err) {
      console.error(err);
      setError("Could not save your rating.");
    } finally {
      setBusyUid(null);
    }
  }

  return (
    <section>
      <h1 className="text-2xl font-bold">Ranking</h1>
      <p className="mt-1 text-xs text-slate-400">Skill levels refresh every minute.</p>

      <p className="mb-4 mt-3 text-sm text-slate-500">
        Tap the stars to rate a player from 1 to 5. The club ranking is the average
        of all player ratings.
      </p>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!entries ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No players yet.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry, idx) => {
            const isSelf = entry.uid === currentUid;
            return (
              <li
                key={entry.uid}
                className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
              >
                <span className="w-7 text-center text-lg font-bold text-slate-400">
                  {idx + 1}
                </span>
                <Avatar src={entry.photoUrl} name={entry.nickname} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">
                    {entry.nickname || "Unnamed"}
                    {isSelf && <span className="ml-1 text-xs text-slate-400">(you)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.count === 0
                      ? "No ratings yet"
                      : `Avg ${entry.avg.toFixed(1)} ★ · ${entry.count} rating${entry.count === 1 ? "" : "s"}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {isSelf ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <>
                      <StarRating
                        value={entry.myStars ?? 0}
                        disabled={busyUid === entry.uid}
                        size="sm"
                        onChange={(stars) => rate(entry.uid, stars)}
                      />
                      {entry.myStars !== null && (
                        <button
                          type="button"
                          onClick={() => rate(entry.uid, null)}
                          className="text-xs text-slate-400 underline hover:text-slate-600"
                        >
                          Clear my rating
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Recompute a player's average/count locally after this user rates (or clears) them. */
function applyRating(
  entries: LeaderboardEntry[],
  ratedUid: string,
  newStars: number | null
): LeaderboardEntry[] {
  const idx = entries.findIndex((e) => e.uid === ratedUid);
  if (idx === -1) return entries;
  const entry = entries[idx];
  const prev = entry.myStars;

  if (prev === null && newStars === null) return entries;
  if (prev === newStars) return entries;

  const othersSum = entry.avg * entry.count - (prev ?? 0);
  let count = entry.count;
  let sum = othersSum;
  if (prev === null && newStars !== null) {
    count += 1;
    sum += newStars;
  } else if (prev !== null && newStars === null) {
    count -= 1;
  } else if (prev !== null && newStars !== null) {
    sum += newStars;
  }

  const updated: LeaderboardEntry = {
    ...entry,
    avg: count === 0 ? 0 : sum / count,
    count,
    myStars: newStars,
  };

  const next = entries.slice();
  next[idx] = updated;
  return next.sort(
    (a, b) => b.avg - a.avg || b.count - a.count || a.nickname.localeCompare(b.nickname)
  );
}
