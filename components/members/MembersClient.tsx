"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { FractionalShuttle } from "@/components/Shuttle";
import { InfoTooltip } from "@/components/InfoTooltip";
import { StarRating } from "@/components/StarRating";
import { Spinner } from "@/components/Spinner";
import { cn } from "@/lib/cn";
import {
  clearRating,
  fetchLeaderboard,
  invalidateLeaderboardCache,
  setStars,
} from "@/lib/db";
import type { LeaderboardEntry } from "@/lib/types";

type SortKey = "name" | "power";
type SortDir = "asc" | "desc";

function SortHeader({
  label,
  info,
  sortBy,
  active,
  dir,
  onToggle,
  className,
}: {
  label: string;
  info?: string;
  sortBy: SortKey;
  active: boolean;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  className?: string;
}) {
  const arrow = !active ? "" : dir === "asc" ? " ↑" : " ↓";
  return (
    <th className={className}>
      <div className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => onToggle(sortBy)}
          className="inline-flex items-center gap-0.5 tracking-wide text-slate-500 hover:text-teal-700"
        >
          {label}
          <span className="text-[10px] leading-none">{arrow}</span>
        </button>
        {info && <InfoTooltip label={info} />}
      </div>
    </th>
  );
}

export function MembersClient({ currentUid }: { currentUid: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("power");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedUid, setExpandedUid] = useState<string | null>(null);

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

  const sorted = useMemo(() => {
    if (!entries) return null;
    const next = entries.slice();
    next.sort((a, b) => {
      let cmp: number;
      if (sortKey === "name") {
        cmp = (a.nickname || "Unnamed").localeCompare(b.nickname || "Unnamed");
      } else {
        cmp = a.avg - b.avg || a.count - b.count;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return next;
  }, [entries, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

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
      <h1 className="text-2xl font-bold">Members</h1>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {!sorted ? (
        <Spinner />
      ) : sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No players yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="w-10 py-3 pl-4 text-center text-xs font-medium text-slate-400">
                  #
                </th>
                <SortHeader
                  label="Name"
                  sortBy="name"
                  active={sortKey === "name"}
                  dir={sortDir}
                  onToggle={toggleSort}
                  className="py-3 pr-3 text-left text-xs font-medium"
                />
                <SortHeader
                  label="Power level"
                  info="Power level is a player's badminton skill as rated by club members."
                  sortBy="power"
                  active={sortKey === "power"}
                  dir={sortDir}
                  onToggle={toggleSort}
                  className="py-3 pr-3 text-left text-xs font-medium"
                />
                <th className="py-3 pr-4 text-right text-xs font-medium text-slate-400">
                  <div className="inline-flex items-center gap-1">
                    My rating
                    <InfoTooltip align="right" label="Tap to rate. 1 shuttle = beginner, 5 shuttles = our club's best players." />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((entry, idx) => {
                const isSelf = entry.uid === currentUid;
                const expanded = expandedUid === entry.uid;
                return (
                  <tr
                    key={entry.uid}
                    className="group border-b border-slate-100 last:border-0"
                    onClick={() =>
                      setExpandedUid((cur) => (cur === entry.uid ? null : entry.uid))
                    }
                  >
                    <td className="py-2 pl-4 text-center font-bold text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar src={entry.photoUrl} name={entry.nickname} size="sm" />
                        <span className="truncate font-semibold text-slate-900">
                          {entry.nickname || "Unnamed"}
                          {isSelf && (
                            <span className="ml-1 text-xs text-slate-400">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3">
                      {entry.count === 0 ? (
                        <span className="text-xs text-slate-400">No ratings yet</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <div
                            className="flex items-center gap-0.5"
                            title={`${entry.avg.toFixed(1)} average`}
                          >
                            {[1, 2, 3, 4, 5].map((n) => {
                              const fill = Math.min(1, Math.max(0, entry.avg - (n - 1)));
                              return (
                                <FractionalShuttle key={n} size={14} fill={fill} />
                              );
                            })}
                          </div>
                          <span className="text-xs text-slate-400">
                            {entry.count} rating{entry.count === 1 ? "" : "s"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <div className="flex justify-end">
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={cn(
                            "flex-col items-end gap-1",
                            expanded ? "flex" : "hidden group-hover:flex"
                          )}
                        >
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
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
