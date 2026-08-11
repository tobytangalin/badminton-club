import type { SessionDoc } from "@/lib/types";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function addHours(hhmm: string, hours: number): string {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const total = (h + hours) * 60 + m;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function legacySessionDate(day: string): string {
  const idx = WEEKDAYS.indexOf(day);
  if (idx < 0) return "2000-01-01";
  const today = new Date();
  const d = new Date(today);
  d.setDate(d.getDate() + ((idx - today.getDay() + 7) % 7) - 7);
  return toISODate(d);
}

/**
 * Sessions created before the ISO-date schema stored a weekday name in `day`
 * and `time` instead of `date`/`startTime`/`endTime`. Map them onto the new
 * fields so legacy docs render, sort, and classify without crashing.
 */
export function normalizeSession(
  data: SessionDoc & { day?: string; time?: string }
): SessionDoc {
  const startTime = data.startTime ?? data.time ?? "00:00";
  const endTime = data.endTime ?? addHours(startTime, 2);
  const date = data.date && data.date.length > 0 ? data.date : legacySessionDate(data.day ?? "");
  return { ...data, date, startTime, endTime, waitlistCount: data.waitlistCount ?? 0 };
}

/** Format an ISO `YYYY-MM-DD` date for display, e.g. "Sunday, August 9". */
export function formatSessionDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today as an ISO `YYYY-MM-DD` string in the local timezone. */
export function todayISODate(): string {
  return toISODate(new Date());
}

/** `days` ago as an ISO `YYYY-MM-DD` string in the local timezone. */
export function daysAgoISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

function toHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min}`;
}

/** Whether a session's end time has already passed (compared to local now). */
export function isSessionEnded(session: { date: string; endTime: string }): boolean {
  const now = new Date();
  const today = toISODate(now);
  if (session.date < today) return true;
  if (session.date > today) return false;
  return toHHMM(now) >= session.endTime;
}
