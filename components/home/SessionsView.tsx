"use client";

import { useCallback, useRef, useState } from "react";
import { getDocs, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { SessionCard } from "@/components/home/SessionCard";
import { Spinner } from "@/components/Spinner";
import { useWhenVisible } from "@/lib/useWhenVisible";
import { isSessionEnded, normalizeSession, todayISODate } from "@/lib/date";
import { sessionsRef, registrationsRef, waitlistRef } from "@/lib/db";
import type { Registration, SessionDoc, WaitlistEntry } from "@/lib/types";

interface SessionEntry {
  id: string;
  data: SessionDoc;
}

export function SessionsView() {
  const { user, userData } = useAuth();
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration[]>>({});
  const [waitlists, setWaitlists] = useState<Record<string, WaitlistEntry[]>>({});
  const countsRef = useRef<Record<string, string>>({});
  const loadedRegsRef = useRef<Set<string>>(new Set());
  const loadedWlRef = useRef<Set<string>>(new Set());

  const loadRegistrations = useCallback(async (ids: string[]) => {
    try {
      const results = await Promise.all(ids.map((id) => getDocs(registrationsRef(id))));
      loadedRegsRef.current = new Set([...loadedRegsRef.current, ...ids]);
      setRegistrations((prev) => {
        const nextReg = { ...prev };
        results.forEach((snap, i) => {
          nextReg[ids[i]] = snap.docs.map((d) => d.data() as Registration);
        });
        return nextReg;
      });
    } catch (err) {
      console.error("Failed to load registrations", err);
    }
  }, []);

  const loadWaitlists = useCallback(async (ids: string[]) => {
    try {
      const results = await Promise.all(ids.map((id) => getDocs(waitlistRef(id))));
      loadedWlRef.current = new Set([...loadedWlRef.current, ...ids]);
      setWaitlists((prev) => {
        const nextWl = { ...prev };
        results.forEach((snap, i) => {
          nextWl[ids[i]] = snap.docs.map((d) => d.data() as WaitlistEntry);
        });
        return nextWl;
      });
    } catch (err) {
      console.error("Failed to load waitlists", err);
    }
  }, []);

  const subscribe = useCallback(() => {
    const unsub = onSnapshot(
      query(sessionsRef(), where("date", ">=", todayISODate())),
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          data: normalizeSession(d.data() as SessionDoc),
        }));
        setSessions(next);

        const seen = new Set<string>();
        const changedRegs: string[] = [];
        const changedWl: string[] = [];
        for (const { id, data } of next) {
          seen.add(id);
          if (isSessionEnded(data)) continue;
          const [prevCount, prevWl] = countsRef.current[id]?.split("|") ?? [undefined, undefined];
          const count = String(data.count);
          const wl = String(data.waitlistCount ?? 0);
          if (prevCount !== count || !loadedRegsRef.current.has(id)) changedRegs.push(id);
          if (prevWl !== wl || !loadedWlRef.current.has(id)) changedWl.push(id);
        }

        const removed = Object.keys(countsRef.current).filter((id) => !seen.has(id));
        if (removed.length > 0) {
          const nextLoadedRegs = new Set(loadedRegsRef.current);
          const nextLoadedWl = new Set(loadedWlRef.current);
          removed.forEach((id) => {
            nextLoadedRegs.delete(id);
            nextLoadedWl.delete(id);
          });
          loadedRegsRef.current = nextLoadedRegs;
          loadedWlRef.current = nextLoadedWl;
          setRegistrations((prev) => {
            const nextReg = { ...prev };
            removed.forEach((id) => delete nextReg[id]);
            return nextReg;
          });
          setWaitlists((prev) => {
            const nextWl = { ...prev };
            removed.forEach((id) => delete nextWl[id]);
            return nextWl;
          });
        }

        countsRef.current = Object.fromEntries(
          next.map(({ id, data }) => [id, `${data.count}|${data.waitlistCount ?? 0}`])
        );

        if (changedRegs.length > 0) {
          void loadRegistrations(changedRegs);
        }
        if (changedWl.length > 0) {
          void loadWaitlists(changedWl);
        }
      },
      (err) => {
        console.error("Failed to load sessions", err);
        setSessions([]);
      }
    );
    return unsub;
  }, [loadRegistrations, loadWaitlists]);

  useWhenVisible(subscribe);

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
          {upcoming.map((s) => (
            <li key={s.id}>
              <SessionCard
                sessionId={s.id}
                session={s.data}
                registrations={registrations[s.id] ?? []}
                waitlist={waitlists[s.id] ?? []}
                currentUid={user?.uid ?? ""}
                currentNickname={userData?.nickname ?? ""}
                currentPhotoUrl={userData?.photoUrl}
                needsProfile={!userData?.nickname}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
