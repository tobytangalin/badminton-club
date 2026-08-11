import { describe, expect, it } from "vitest";
import { planRosterReads, type RosterReadsInput } from "@/lib/sessionReads";
import type { SessionDoc } from "@/lib/types";

function session(id: string, overrides: Partial<SessionDoc> = {}): { id: string; data: SessionDoc } {
  return {
    id,
    data: {
      date: "2999-01-01",
      startTime: "19:00",
      endTime: "21:00",
      location: "DGI Byen",
      count: 0,
      waitlistCount: 0,
      ...overrides,
    },
  };
}

function input(overrides: Partial<RosterReadsInput>): RosterReadsInput {
  return {
    next: [],
    counts: {},
    loadedRegs: new Set(),
    loadedWl: new Set(),
    myStatus: {},
    ...overrides,
  };
}

describe("planRosterReads", () => {
  it("plans a full read for brand-new sessions", () => {
    const plan = planRosterReads(
      input({
        next: [session("A"), session("B")],
        counts: {},
      })
    );
    expect(plan.newRegs).toEqual(["A", "B"]);
    expect(plan.newWl).toEqual(["A", "B"]);
    expect(plan.checkOwn).toEqual([]);
    expect(plan.removed).toEqual([]);
  });

  it("does not re-read a fully-loaded session when counts are unchanged", () => {
    const plan = planRosterReads(
      input({
        next: [session("A", { count: 5 })],
        counts: { A: "5|0" },
        loadedRegs: new Set(["A"]),
        loadedWl: new Set(["A"]),
      })
    );
    expect(plan.newRegs).toEqual([]);
    expect(plan.newWl).toEqual([]);
    expect(plan.refreshWl).toEqual([]);
    expect(plan.checkOwn).toEqual([]);
  });

  it("triggers ZERO reads on a count change for a session the member has no stake in", () => {
    const plan = planRosterReads(
      input({
        next: [session("A", { count: 6 })],
        counts: { A: "5|0" },
        loadedRegs: new Set(["A"]),
        loadedWl: new Set(["A"]),
        myStatus: {},
      })
    );
    expect(plan.newRegs).toEqual([]);
    expect(plan.newWl).toEqual([]);
    expect(plan.refreshWl).toEqual([]);
    expect(plan.checkOwn).toEqual([]);
  });

  it("triggers only an own-status check when the count changes for a registered member", () => {
    const plan = planRosterReads(
      input({
        next: [session("A", { count: 6 })],
        counts: { A: "5|0" },
        loadedRegs: new Set(["A"]),
        loadedWl: new Set(["A"]),
        myStatus: { A: { registered: true, waitlisted: false } },
      })
    );
    expect(plan.checkOwn).toEqual(["A"]);
    expect(plan.refreshWl).toEqual([]);
    expect(plan.newRegs).toEqual([]);
  });

  it("refreshes the waitlist + own status when the queue shifts for a waitlisted member", () => {
    const plan = planRosterReads(
      input({
        next: [session("A", { count: 4, waitlistCount: 2 })],
        counts: { A: "4|1" },
        loadedRegs: new Set(["A"]),
        loadedWl: new Set(["A"]),
        myStatus: { A: { registered: false, waitlisted: true } },
      })
    );
    expect(plan.refreshWl).toEqual(["A"]);
    expect(plan.checkOwn).toEqual(["A"]);
  });

  it("reports sessions that disappeared as removed", () => {
    const plan = planRosterReads(
      input({
        next: [session("B")],
        counts: { A: "5|0", B: "3|0" },
      })
    );
    expect(plan.removed).toEqual(["A"]);
    expect(plan.newRegs).toEqual(["B"]);
  });

  it("never plans reads for ended sessions", () => {
    const plan = planRosterReads(
      input({
        next: [session("Old", { date: "2000-01-01", count: 9 })],
        counts: {},
      })
    );
    expect(plan.newRegs).toEqual([]);
    expect(plan.newWl).toEqual([]);
    expect(plan.checkOwn).toEqual([]);
  });
});
