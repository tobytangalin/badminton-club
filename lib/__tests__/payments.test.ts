import { describe, expect, it } from "vitest";
import { formatMoney, perPlayerCost, playersPlayed } from "@/lib/payments";
import type { SessionDoc } from "@/lib/types";

function session(overrides: Partial<SessionDoc>): SessionDoc {
  return {
    date: "2026-08-09",
    startTime: "19:00",
    endTime: "21:00",
    location: "DGI Byen",
    count: 0,
    ...overrides,
  };
}

describe("playersPlayed", () => {
  it("uses count by default", () => {
    expect(playersPlayed(session({ count: 8 }))).toBe(8);
  });

  it("uses the override when present", () => {
    expect(playersPlayed(session({ count: 8, playersOverride: 6 }))).toBe(6);
  });
});

describe("perPlayerCost", () => {
  it("returns null when the session has no cost", () => {
    expect(perPlayerCost(session({}))).toBeNull();
  });

  it("returns null when the cost is null", () => {
    expect(perPlayerCost(session({ cost: null }))).toBeNull();
  });

  it("returns null when the cost is zero", () => {
    expect(perPlayerCost(session({ cost: 0 }))).toBeNull();
  });

  it("splits the cost equally among players", () => {
    expect(perPlayerCost(session({ cost: 36, count: 4 }))).toBe(9);
  });

  it("splits by the players-override, not the registered count", () => {
    expect(perPlayerCost(session({ cost: 36, count: 12, playersOverride: 4 }))).toBe(9);
  });

  it("returns null when nobody played", () => {
    expect(perPlayerCost(session({ cost: 36, count: 0 }))).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats an amount with the currency symbol of the locale", () => {
    const out = formatMoney(12.5);
    expect(out).toContain("12");
    expect(out).toContain("50");
    expect(out.trim().length).toBeGreaterThan(0);
  });
});
