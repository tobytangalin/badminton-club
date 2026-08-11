import { describe, expect, it } from "vitest";
import {
  daysAgoISODate,
  formatSessionDate,
  isSessionEnded,
  normalizeSession,
  todayISODate,
} from "@/lib/date";
import type { SessionDoc } from "@/lib/types";

describe("normalizeSession", () => {
  it("passes a modern session through unchanged", () => {
    const s = normalizeSession({
      date: "2026-08-09",
      startTime: "19:00",
      endTime: "21:00",
      location: "DGI Byen",
      count: 3,
    });
    expect(s).toMatchObject({
      date: "2026-08-09",
      startTime: "19:00",
      endTime: "21:00",
      waitlistCount: 0,
    });
  });

  it("defaults the waitlist count to 0 when absent", () => {
    const s = normalizeSession({
      date: "2026-08-09",
      startTime: "19:00",
      endTime: "21:00",
      location: "DGI Byen",
      count: 0,
    });
    expect(s.waitlistCount).toBe(0);
  });

  it("maps a legacy day/time session onto the ISO schema", () => {
    const s = normalizeSession({
      date: "",
      location: "DGI Byen",
      count: 0,
      day: "Sunday",
      time: "19:00",
    } as unknown as SessionDoc);
    expect(s.startTime).toBe("19:00");
    expect(s.endTime).toBe("21:00");
    expect(s.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("falls back to a fixed date for an unknown weekday", () => {
    const s = normalizeSession({
      date: "",
      location: "DGI Byen",
      count: 0,
      day: "Notaday",
      time: "19:00",
    } as unknown as SessionDoc);
    expect(s.date).toBe("2000-01-01");
  });
});

describe("isSessionEnded", () => {
  it("returns true for a past date", () => {
    expect(isSessionEnded({ date: "2000-01-01", endTime: "23:59" })).toBe(true);
  });

  it("returns false for a future date", () => {
    expect(isSessionEnded({ date: "2999-01-01", endTime: "00:00" })).toBe(false);
  });
});

describe("formatSessionDate", () => {
  it("formats an ISO date as a readable string", () => {
    expect(formatSessionDate("2026-08-09")).toContain("August");
    expect(formatSessionDate("2026-08-09")).toContain("9");
  });

  it("passes through an invalid date", () => {
    expect(formatSessionDate("garbage")).toBe("garbage");
  });
});

describe("ISO date helpers", () => {
  it("todayISODate returns a YYYY-MM-DD shape", () => {
    expect(todayISODate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("daysAgoISODate returns a YYYY-MM-DD shape", () => {
    expect(daysAgoISODate(1)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
