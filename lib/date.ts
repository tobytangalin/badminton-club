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
