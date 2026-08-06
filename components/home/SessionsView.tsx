"use client";

import { useCallback, useRef, useState } from "react";
import { getDocs, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/components/AuthProvider";
import { SessionCard } from "@/components/home/SessionCard";
import { Spinner } from "@/components/Spinner";
import { useWhenVisible } from "@/lib/useWhenVisible";
import { sessionsRef, registrationsRef } from "@/lib/db";
import type { Registration, SessionDoc } from "@/lib/types";

interface SessionEntry {
  id: string;
  data: SessionDoc;
}

export function SessionsView() {
  const { user, userData } = useAuth();
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration[]>>({});
  const countsRef = useRef<Record<string, number>>({});

  const loadRegistrations = useCallback(async (ids: string[]) => {
    try {
      const results = await Promise.all(ids.map((id) => getDocs(registrationsRef(id))));
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

  const subscribe = useCallback(() => {
    countsRef.current = {};
    const unsub = onSnapshot(
      sessionsRef(),
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          data: d.data() as SessionDoc,
        }));
        setSessions(next);

        const seen = new Set<string>();
        const changed: string[] = [];
        for (const { id, data } of next) {
          seen.add(id);
          if (countsRef.current[id] !== data.count) changed.push(id);
        }

        const removed = Object.keys(countsRef.current).filter((id) => !seen.has(id));
        if (removed.length > 0) {
          setRegistrations((prev) => {
            const nextReg = { ...prev };
            removed.forEach((id) => delete nextReg[id]);
            return nextReg;
          });
        }

        countsRef.current = Object.fromEntries(
          next.map(({ id, data }) => [id, data.count])
        );

        if (changed.length > 0) {
          void loadRegistrations(changed);
        }
      },
      (err) => {
        console.error("Failed to load sessions", err);
        setSessions([]);
      }
    );
    return unsub;
  }, [loadRegistrations]);

  useWhenVisible(subscribe);

  if (!sessions) return <Spinner />;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-bold">Upcoming sessions</h2>
        <span className="text-sm text-slate-500">{sessions.length} found</span>
      </div>

      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No sessions scheduled yet. Check back soon!
        </p>
      ) : (
        <ul className="space-y-4">
          {sessions
            .slice()
            .sort((a, b) => a.data.day.localeCompare(b.data.day))
            .map((s) => (
              <li key={s.id}>
                <SessionCard
                  sessionId={s.id}
                  session={s.data}
                  registrations={registrations[s.id] ?? []}
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
