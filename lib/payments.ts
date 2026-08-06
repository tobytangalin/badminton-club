import type { SessionDoc } from "@/lib/types";

export const CURRENCY = process.env.NEXT_PUBLIC_CURRENCY ?? "DKK";

/** How many players actually played (override wins over registered count). */
export function playersPlayed(session: SessionDoc): number {
  return session.playersOverride ?? session.count ?? 0;
}

/** Per-player share of the cost, or null when the session is free / has no cost. */
export function perPlayerCost(session: SessionDoc): number | null {
  if (typeof session.cost !== "number" || session.cost <= 0) return null;
  const n = playersPlayed(session);
  if (!Number.isFinite(n) || n <= 0) return null;
  return session.cost / n;
}

export function formatMoney(amount: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: CURRENCY,
    maximumFractionDigits: 2,
  }).format(amount);
}
