"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { SessionCard } from "@/components/home/SessionCard";
import { Spinner } from "@/components/Spinner";
import { useWhenVisible } from "@/lib/useWhenVisible";
import { createDebouncedBatcher } from "@/lib/batch";
import { isSessionEnded, normalizeSession, todayISODate } from "@/lib/date";
import { sessionsRef, registrationsRef, waitlistRef } from "@/lib/db";
import { planRosterReads, type MyStatus } from "@/lib/sessionReads";
import type { Registration, SessionDoc, WaitlistEntry } from "@/lib/types";

interface SessionEntry {
  id: string;
  data: SessionDoc;
}

/** Coalesce roster re-fetches into one read per session per window. */
const ROSTER_REFRESH_MS = 3_000;

export function SessionsView() {
  const { user, userData } = useAuth();
  const uid = user?.uid ?? "";
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration[]>>({});
  const [waitlists, setWaitlists] = useState<Record<string, WaitlistEntry[]>>({});
  const [myStatus, setMyStatus] = useState<Record<string, MyStatus>>({});
  const countsRef = useRef<Record<string, string>>({});
  const loadedRegsRef = useRef<Set<string>>(new Set());
  const loadedWlRef = useRef<Set<string>>(new Set());
  const myStatusRef = useRef<Record<string, MyStatus>>({});
  const firstSnapshotRef = useRef(true);

  const updateMyStatus = useCallback((entries: Record<string, MyStatus>) => {
    myStatusRef.current = { ...myStatusRef.current, ...entries };
    setMyStatus((prev) => ({ ...prev, ...entries }));
  }, []);

  const loadRegistrations = useCallback(
    async (ids: string[]) => {
      try {
        const results = await Promise.all(ids.map((id) => getDocs(registrationsRef(id))));
        loadedRegsRef.current = new Set([...loadedRegsRef.current, ...ids]);
        setRegistrations((prev) => {
          const next = { ...prev };
          results.forEach((snap, i) => {
            next[ids[i]] = snap.docs.map((d) => d.data() as Registration);
          });
          return next;
        });
        updateMyStatus(
          Object.fromEntries(
            results.map((snap, i) => [
              ids[i],
              {
                registered: snap.docs.some((d) => d.id === uid),
                waitlisted: myStatusRef.current[ids[i]]?.waitlisted ?? false,
              },
            ])
          )
        );
      } catch (err) {
        console.error("Failed to load registrations", err);
      }
    },
    [uid, updateMyStatus]
  );

  const loadWaitlists = useCallback(
    async (ids: string[]) => {
      try {
        const results = await Promise.all(ids.map((id) => getDocs(waitlistRef(id))));
        loadedWlRef.current = new Set([...loadedWlRef.current, ...ids]);
        setWaitlists((prev) => {
          const next = { ...prev };
          results.forEach((snap, i) => {
            next[ids[i]] = snap.docs.map((d) => d.data() as WaitlistEntry);
          });
          return next;
        });
        updateMyStatus(
          Object.fromEntries(
            results.map((snap, i) => [
              ids[i],
              {
                registered: myStatusRef.current[ids[i]]?.registered ?? false,
                waitlisted: snap.docs.some((d) => d.id === uid),
              },
            ])
          )
        );
      } catch (err) {
        console.error("Failed to load waitlists", err);
      }
    },
    [uid, updateMyStatus]
  );

  const batchersRef = useRef<{
    regs: ReturnType<typeof createDebouncedBatcher<string>>;
    wl: ReturnType<typeof createDebouncedBatcher<string>>;
  } | null>(null);

  useEffect(() => {
    const regs = createDebouncedBatcher<string>(
      (ids) => void loadRegistrations(ids),
      ROSTER_REFRESH_MS
    );
    const wl = createDebouncedBatcher<string>(
      (ids) => void loadWaitlists(ids),
      ROSTER_REFRESH_MS
    );
    batchersRef.current = { regs, wl };
    return () => {
      regs.dispose();
      wl.dispose();
      batchersRef.current = null;
    };
  }, [loadRegistrations, loadWaitlists]);

  const scheduleFetches = useCallback((regIds: string[], wlIds: string[]) => {
    const batchers = batchersRef.current;
    if (!batchers) return;
    regIds.forEach((id) => batchers.regs.push(id));
    wlIds.forEach((id) => batchers.wl.push(id));
  }, []);

  /**
   * Cheap reads of just the current member's own registration/waitlist docs
   * after a session's counts change, so the register/leave button and queue
   * position stay accurate without re-reading the whole roster.
   */
  const checkOwnStatus = useCallback(
    async (ids: string[]) => {
      try {
        const results = await Promise.all(
          ids.map(async (id) => {
            const [regSnap, wlSnap] = await Promise.all([
              getDoc(doc(registrationsRef(id), uid)),
              getDoc(doc(waitlistRef(id), uid)),
            ]);
            return { id, registered: regSnap.exists(), waitlisted: wlSnap.exists() };
          })
        );
        const old = myStatusRef.current;
        const entries = Object.fromEntries(
          results.map((r) => [r.id, { registered: r.registered, waitlisted: r.waitlisted }])
        );
        const promoted = results
          .filter((r) => r.registered && old[r.id]?.waitlisted)
          .map((r) => r.id);
        updateMyStatus(entries);
        if (promoted.length > 0) scheduleFetches(promoted, []);
      } catch (err) {
        console.error("Failed to check own status", err);
      }
    },
    [uid, updateMyStatus, scheduleFetches]
  );

  const subscribe = useCallback(() => {
    const unsub = onSnapshot(
      query(sessionsRef(), where("date", ">=", todayISODate())),
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          data: normalizeSession(d.data() as SessionDoc),
        }));
        setSessions(next);

        const plan = planRosterReads({
          next,
          counts: countsRef.current,
          loadedRegs: loadedRegsRef.current,
          loadedWl: loadedWlRef.current,
          myStatus: myStatusRef.current,
        });

        if (plan.removed.length > 0) {
          const nextLoadedRegs = new Set(loadedRegsRef.current);
          const nextLoadedWl = new Set(loadedWlRef.current);
          const nextMyStatus = { ...myStatusRef.current };
          plan.removed.forEach((id) => {
            nextLoadedRegs.delete(id);
            nextLoadedWl.delete(id);
            delete nextMyStatus[id];
          });
          loadedRegsRef.current = nextLoadedRegs;
          loadedWlRef.current = nextLoadedWl;
          myStatusRef.current = nextMyStatus;
          setRegistrations((prev) => {
            const nextReg = { ...prev };
            plan.removed.forEach((id) => delete nextReg[id]);
            return nextReg;
          });
          setWaitlists((prev) => {
            const nextWl = { ...prev };
            plan.removed.forEach((id) => delete nextWl[id]);
            return nextWl;
          });
          setMyStatus((prev) => {
            const next = { ...prev };
            plan.removed.forEach((id) => delete next[id]);
            return next;
          });
        }

        countsRef.current = Object.fromEntries(
          next.map(({ id, data }) => [id, `${data.count}|${data.waitlistCount ?? 0}`])
        );

        if (plan.newRegs.length > 0 || plan.newWl.length > 0 || plan.refreshWl.length > 0) {
          if (firstSnapshotRef.current) {
            void loadRegistrations(plan.newRegs);
            void loadWaitlists([...plan.newWl, ...plan.refreshWl]);
          } else {
            scheduleFetches(plan.newRegs, [...plan.newWl, ...plan.refreshWl]);
          }
        }
        firstSnapshotRef.current = false;
        if (plan.checkOwn.length > 0) {
          void checkOwnStatus(plan.checkOwn);
        }
      },
      (err) => {
        console.error("Failed to load sessions", err);
        setSessions([]);
      }
    );
    return unsub;
  }, [scheduleFetches, checkOwnStatus, loadRegistrations, loadWaitlists]);

  useWhenVisible(subscribe);

  const handleStatusChanged = useCallback(
    (id: string, status: MyStatus) => {
      updateMyStatus({ [id]: status });
      scheduleFetches([id], [id]);
    },
    [updateMyStatus, scheduleFetches]
  );

  const refreshRoster = useCallback(
    (id: string) => scheduleFetches([id], [id]),
    [scheduleFetches]
  );

  if (!sessions) return <Spinner />;

  const upcoming = sessions
    .filter((s) => !isSessionEnded(s.data))
    .sort((a, b) => {
      const dateCmp = (a.data.date ?? "").localeCompare(b.data.date ?? "");
      return dateCmp !== 0 ? dateCmp : (a.data.startTime ?? "").localeCompare(b.data.startTime ?? "");
    });

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">Upcoming sessions</h2>
        <span className="text-sm text-slate-500">{upcoming.length} found</span>
      </div>

      {upcoming.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No sessions scheduled yet. Check back soon!
        </p>
      ) : (
        <ul className="space-y-4">
          {upcoming.map((s) => {
            const wl = waitlists[s.id] ?? [];
            const status = myStatus[s.id];
            return (
              <li key={s.id}>
                <SessionCard
                  sessionId={s.id}
                  session={s.data}
                  registrations={registrations[s.id] ?? []}
                  rosterLoaded={registrations[s.id] !== undefined}
                  currentUid={uid}
                  currentNickname={userData?.nickname ?? ""}
                  currentPhotoUrl={userData?.photoUrl}
                  needsProfile={!userData?.nickname}
                  isRegistered={status?.registered ?? false}
                  isWaitlisted={status?.waitlisted ?? false}
                  waitlistPosition={
                    status?.waitlisted ? wl.findIndex((w) => w.uid === uid) + 1 : 0
                  }
                  onStatusChanged={handleStatusChanged}
                  onRefreshRoster={refreshRoster}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
