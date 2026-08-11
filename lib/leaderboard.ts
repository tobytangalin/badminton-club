import type { LeaderboardEntry } from "@/lib/types";

/** Recompute a player's average/count locally after this user rates (or clears) them. */
export function applyRating(
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
