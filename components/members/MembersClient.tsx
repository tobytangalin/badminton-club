"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
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
import { applyRating } from "@/lib/leaderboard";
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
  tooltipOpen,
  onTooltipToggle,
}: {
  label: string;
  info?: string;
  sortBy: SortKey;
  active: boolean;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  className?: string;
  tooltipOpen?: boolean;
  onTooltipToggle?: () => void;
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
        {info && (
          <InfoTooltip
            label={info}
            open={tooltipOpen ?? false}
            onToggle={onTooltipToggle ?? (() => {})}
          />
        )}
      </div>
    </th>
  );
}

function SortPill({
  label,
  info,
  sortBy,
  active,
  dir,
  onToggle,
  tooltipOpen,
  onTooltipToggle,
  align,
}: {
  label: string;
  info?: string;
  sortBy: SortKey;
  active: boolean;
  dir: SortDir;
  onToggle: (key: SortKey) => void;
  tooltipOpen?: boolean;
  onTooltipToggle?: () => void;
  align?: "left" | "right";
}) {
  const arrow = !active ? "" : dir === "asc" ? "↑" : "↓";
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onToggle(sortBy)}
        className={cn(
          "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors",
          active
            ? "border-teal-600 bg-teal-600 text-white"
            : "border-slate-300 bg-white text-slate-600 hover:border-teal-600 hover:text-teal-700"
        )}
      >
        {label}
        {arrow && <span className="ml-0.5">{arrow}</span>}
      </button>
      {info && (
        <InfoTooltip
          align={align}
          label={info}
          open={tooltipOpen ?? false}
          onToggle={onTooltipToggle ?? (() => {})}
        />
      )}
    </span>
  );
}

export function MembersClient({ currentUid }: { currentUid: string }) {
  const { userData } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("power");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [openTooltip, setOpenTooltip] = useState<string | null>(null);

  function toggleTooltip(key: string) {
    setOpenTooltip((cur) => (cur === key ? null : key));
  }

  useEffect(() => {
    let cancelled = false;
    fetchLeaderboard(currentUid, userData?.myRatings)
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
  }, [currentUid, userData?.myRatings]);

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

  function renderPowerLevel(entry: LeaderboardEntry) {
    if (entry.count === 0) {
      return <span className="text-xs text-slate-400">No ratings yet</span>;
    }
    return (
      <div className="flex flex-col gap-0.5">
        <div
          className="flex items-center gap-0.5"
          title={`${entry.avg.toFixed(1)} average`}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const fill = Math.min(1, Math.max(0, entry.avg - (n - 1)));
            return <FractionalShuttle key={n} size={14} fill={fill} />;
          })}
        </div>
        <span className="text-xs text-slate-400">
          {entry.count} rating{entry.count === 1 ? "" : "s"}
        </span>
      </div>
    );
  }

  function renderRatingControl(entry: LeaderboardEntry) {
    return (
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-end gap-1">
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
    );
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
        <>
          <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 bg-white sm:block">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <SortHeader
                    label="Name"
                    sortBy="name"
                    active={sortKey === "name"}
                    dir={sortDir}
                    onToggle={toggleSort}
                    className="py-3 pl-4 pr-3 text-left text-xs font-medium"
                  />
                  <SortHeader
                    label="Power level"
                    info="Power level is a player's badminton skill as rated by club members."
                    sortBy="power"
                    active={sortKey === "power"}
                    dir={sortDir}
                    onToggle={toggleSort}
                    tooltipOpen={openTooltip === "power"}
                    onTooltipToggle={() => toggleTooltip("power")}
                    className="w-32 py-3 pr-3 text-left text-xs font-medium"
                  />
                  <th className="w-32 py-3 pr-4 text-right text-xs font-medium text-slate-400">
                    <div className="inline-flex items-center gap-1">
                      My rating
                      <InfoTooltip
                        align="right"
                        label="Tap to rate. 1 shuttle = beginner, 5 shuttles = our club's best players."
                        open={openTooltip === "rating"}
                        onToggle={() => toggleTooltip("rating")}
                      />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((entry) => {
                  const isSelf = entry.uid === currentUid;
                  return (
                    <tr
                      key={entry.uid}
                      className="group border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 pl-4 pr-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <Avatar src={entry.photoUrl} name={entry.nickname} size="sm" />
                          <span
                            className="truncate font-semibold text-slate-900"
                            title={entry.nickname || "Unnamed"}
                          >
                            {entry.nickname || "Unnamed"}
                          </span>
                          {isSelf && (
                            <span className="shrink-0 text-xs text-slate-400">(you)</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-3">{renderPowerLevel(entry)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex justify-end">{renderRatingControl(entry)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mb-2 mt-4 flex items-center justify-between gap-2 px-1 text-xs font-medium text-slate-500 sm:hidden">
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 text-slate-400">Sort by</span>
              <SortPill
                label="Name"
                sortBy="name"
                active={sortKey === "name"}
                dir={sortDir}
                onToggle={toggleSort}
              />
              <SortPill
                label="Power level"
                sortBy="power"
                active={sortKey === "power"}
                dir={sortDir}
                onToggle={toggleSort}
                info="Power level is a player's badminton skill as rated by club members."
                tooltipOpen={openTooltip === "power"}
                onTooltipToggle={() => toggleTooltip("power")}
                align="left"
              />
            </div>
            <span className="flex shrink-0 items-center gap-1">
              My rating
              <InfoTooltip
                align="right"
                label="Tap to rate. 1 shuttle = beginner, 5 shuttles = our club's best players."
                open={openTooltip === "rating"}
                onToggle={() => toggleTooltip("rating")}
              />
            </span>
          </div>

          <ul className="space-y-2 sm:hidden">
            {sorted.map((entry) => {
              const isSelf = entry.uid === currentUid;
              return (
                <li
                  key={entry.uid}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <Avatar src={entry.photoUrl} name={entry.nickname} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-baseline gap-1">
                      <p
                        className="truncate font-semibold text-slate-900"
                        title={entry.nickname || "Unnamed"}
                      >
                        {entry.nickname || "Unnamed"}
                      </p>
                      {isSelf && (
                        <span className="shrink-0 text-xs text-slate-400">(you)</span>
                      )}
                    </div>
                    <div className="mt-0.5">{renderPowerLevel(entry)}</div>
                  </div>
                  <div className="shrink-0">{renderRatingControl(entry)}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
