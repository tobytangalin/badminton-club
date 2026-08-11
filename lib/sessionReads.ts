import { isSessionEnded } from "@/lib/date";
import type { SessionDoc } from "@/lib/types";

export interface MyStatus {
  registered: boolean;
  waitlisted: boolean;
}

export interface RosterPlan {
  /** Sessions whose full registrations subcollection has never been read. */
  newRegs: string[];
  /** Sessions whose full waitlist subcollection has never been read. */
  newWl: string[];
  /** Sessions whose waitlist must be re-read (waitlisted member's position). */
  refreshWl: string[];
  /** Sessions where only the member's own reg/waitlist docs need re-reading. */
  checkOwn: string[];
  /** Session ids that disappeared and must be cleaned up. */
  removed: string[];
}

export interface RosterReadsInput {
  next: { id: string; data: SessionDoc }[];
  /** `sessionId -> "<count>|<waitlistCount>"` from the previous snapshot. */
  counts: Record<string, string>;
  loadedRegs: Set<string>;
  loadedWl: Set<string>;
  myStatus: Record<string, MyStatus>;
}

/**
 * Decide, for one sessions snapshot, which Firestore reads are needed to keep
 * the UI accurate. The lazy-roster rule: full rosters are read once per
 * session (first view + explicit expand); count changes only trigger cheap
 * own-document reads for sessions the current member participates in.
 */
export function planRosterReads(input: RosterReadsInput): RosterPlan {
  const { next, counts, loadedRegs, loadedWl, myStatus } = input;
  const newRegs: string[] = [];
  const newWl: string[] = [];
  const refreshWl: string[] = [];
  const checkOwn: string[] = [];
  const seen = new Set<string>();

  for (const { id, data } of next) {
    seen.add(id);
    if (isSessionEnded(data)) continue;
    const [prevCount, prevWl] = counts[id]?.split("|") ?? [undefined, undefined];
    const count = String(data.count);
    const wl = String(data.waitlistCount ?? 0);
    const countChanged = prevCount !== undefined && prevCount !== count;
    const wlChanged = prevWl !== undefined && prevWl !== wl;

    if (!loadedRegs.has(id)) newRegs.push(id);
    if (!loadedWl.has(id)) newWl.push(id);

    const stake = myStatus[id];
    if (stake?.waitlisted && (wlChanged || countChanged)) {
      // Keep the waitlisted member's queue position fresh and detect
      // auto-promotion into a freed spot.
      refreshWl.push(id);
      checkOwn.push(id);
    } else if (stake?.registered && countChanged) {
      // An admin may have removed this member; detect it cheaply.
      checkOwn.push(id);
    }
  }

  const removed = Object.keys(counts).filter((id) => !seen.has(id));

  return { newRegs, newWl, refreshWl, checkOwn, removed };
}
