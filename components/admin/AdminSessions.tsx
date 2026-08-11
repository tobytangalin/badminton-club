"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { getDocs, onSnapshot, query, where } from "firebase/firestore";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";
import { daysAgoISODate, formatSessionDate, isSessionEnded, normalizeSession } from "@/lib/date";
import { getSavedLocations, persistSavedLocations } from "@/lib/locations";
import {
  adminApplyParticipantChanges,
  createSession,
  deleteSession,
  registrationsRef,
  sessionsRef,
  updateSession,
  usersRef,
  waitlistRef,
} from "@/lib/db";
import { useWhenVisible } from "@/lib/useWhenVisible";
import type { ParticipantToAdd } from "@/lib/db";
import type { Registration, SessionDoc, UserDoc, WaitlistEntry } from "@/lib/types";

interface SessionEntry {
  id: string;
  data: SessionDoc;
}

interface FormState {
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
  capacity: string;
  cost: string;
  playersOverride: string;
}

const emptyForm: FormState = {
  date: "",
  startTime: "19:00",
  endTime: "21:00",
  location: "",
  description: "",
  capacity: "",
  cost: "",
  playersOverride: "",
};

const PREVIEW_COUNT = 8;

/** Older sessions are not fetched by the admin list (records stay in Firestore). */
const PAST_WINDOW_DAYS = 60;

function todayString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function AdminSessions() {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration[]>>({});
  const [waitlists, setWaitlists] = useState<Record<string, WaitlistEntry[]>>({});
  const [users, setUsers] = useState<{ uid: string; data: UserDoc }[] | null>(null);
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm, date: todayString() }));
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [showPast, setShowPast] = useState(false);
  const showPastRef = useRef(false);
  const [expandedPlayers, setExpandedPlayers] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState<Record<string, boolean>>({});
  const [addSelected, setAddSelected] = useState<Record<string, string[]>>({});
  const [addSearch, setAddSearch] = useState<Record<string, string>>({});
  const [addBusy, setAddBusy] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve(getSavedLocations()).then(setSavedLocations);
  }, []);

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

  const loadPastDetails = useCallback(() => {
    const pastIds = (sessions ?? [])
      .filter((s) => isSessionEnded(s.data))
      .map((s) => s.id);
    const needRegs = pastIds.filter((id) => !loadedRegsRef.current.has(id));
    const needWl = pastIds.filter((id) => !loadedWlRef.current.has(id));
    if (needRegs.length > 0) void loadRegistrations(needRegs);
    if (needWl.length > 0) void loadWaitlists(needWl);
  }, [sessions, loadRegistrations, loadWaitlists]);

  const subscribeSessions = useCallback(() => {
    const unsub = onSnapshot(
      query(sessionsRef(), where("date", ">=", daysAgoISODate(PAST_WINDOW_DAYS))),
      (snap) => {
        const next = snap.docs.map((d) => ({
          id: d.id,
          data: normalizeSession(d.data() as SessionDoc),
        }));
        setSessions(next);

        const seen = new Set(next.map((s) => s.id));
        const changedRegs: string[] = [];
        const changedWl: string[] = [];
        for (const { id, data } of next) {
          if (isSessionEnded(data) && !showPastRef.current) continue;
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
      }
    );
    return unsub;
  }, [loadRegistrations, loadWaitlists]);

  const usersLoadedAtRef = useRef(0);
  const loadUsers = useCallback(async (force = false) => {
    if (!force && usersLoadedAtRef.current > Date.now() - 60_000) return;
    const snap = await getDocs(usersRef());
    setUsers(snap.docs.map((d) => ({ uid: d.id, data: d.data() as UserDoc })));
    usersLoadedAtRef.current = Date.now();
  }, []);

  useWhenVisible(subscribeSessions);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function saveLocation() {
    const loc = form.location.trim();
    if (!loc || savedLocations.includes(loc)) return;
    const next = [...savedLocations, loc];
    persistSavedLocations(next);
    setSavedLocations(next);
  }

  function removeLocation(loc: string) {
    const next = savedLocations.filter((l) => l !== loc);
    persistSavedLocations(next);
    setSavedLocations(next);
  }

  function openNew() {
    setFormOpen(true);
    setEditingId(null);
    setForm({ ...emptyForm, date: todayString() });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEdit(s: SessionEntry) {
    setFormOpen(true);
    setEditingId(s.id);
    setForm({
      date: s.data.date,
      startTime: s.data.startTime,
      endTime: s.data.endTime,
      location: s.data.location,
      description: s.data.description ?? "",
      capacity: s.data.capacity ? String(s.data.capacity) : "",
      cost: s.data.cost ? String(s.data.cost) : "",
      playersOverride: s.data.playersOverride ? String(s.data.playersOverride) : "",
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setFormOpen(false);
    setEditingId(null);
    setForm({ ...emptyForm, date: todayString() });
    setError("");
  }

  function duplicate(s: SessionEntry) {
    setFormOpen(true);
    setEditingId(null);
    setForm({
      date: s.data.date,
      startTime: s.data.startTime,
      endTime: s.data.endTime,
      location: s.data.location,
      description: s.data.description ?? "",
      capacity: s.data.capacity ? String(s.data.capacity) : "",
      cost: "",
      playersOverride: "",
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.date || !form.location.trim()) {
      setError("Date and location are required.");
      return;
    }
    if (!editingId && form.date < todayString()) {
      setError("Date cannot be earlier than today.");
      return;
    }
    const capacity = form.capacity.trim() ? parseInt(form.capacity, 10) : null;
    if (capacity !== null && (!Number.isFinite(capacity) || capacity < 1)) {
      setError("Capacity must be at least 1.");
      return;
    }
    if (!form.startTime || !form.endTime) {
      setError("Start and end time are required.");
      return;
    }
    if (form.endTime <= form.startTime) {
      setError("End time must be after the start time.");
      return;
    }
    const cost = parseFloat(form.cost);
    const override = form.playersOverride.trim()
      ? parseInt(form.playersOverride.trim(), 10)
      : null;
    if (override !== null && (!Number.isFinite(override) || override < 1)) {
      setError("Players that played must be at least 1.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const payload: Omit<SessionDoc, "count" | "createdAt"> = {
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        location: form.location.trim(),
        capacity,
        cost: Number.isFinite(cost) && cost > 0 ? cost : null,
        playersOverride: override,
      };
      if (form.description.trim()) {
        payload.description = form.description.trim();
      }
      if (editingId) {
        await updateSession(editingId, payload);
      } else {
        await createSession(payload);
      }
      cancelEdit();
    } catch (err) {
      console.error(err);
      setError("Could not save session.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(sessionId: string) {
    if (!window.confirm("Delete this session and its registrations?")) return;
    setError("");
    try {
      await deleteSession(sessionId);
    } catch (err) {
      console.error(err);
      setError("Could not delete session.");
    }
  }

  function toggleSelect(sessionId: string, uid: string) {
    setAddSelected((prev) => {
      const cur = prev[sessionId] ?? [];
      const next = cur.includes(uid)
        ? cur.filter((u) => u !== uid)
        : [...cur, uid];
      return { ...prev, [sessionId]: next };
    });
  }

  async function applyChanges(sessionId: string, regs: Registration[]) {
    const selected = addSelected[sessionId] ?? [];
    const selectedSet = new Set(selected);
    const toAdd = selected.filter((uid) => !regs.some((r) => r.uid === uid));
    const toRemove = regs.filter((r) => !selectedSet.has(r.uid)).map((r) => r.uid);
    if (toAdd.length === 0 && toRemove.length === 0) {
      setAddOpen((prev) => ({ ...prev, [sessionId]: false }));
      return;
    }
    setAddBusy(sessionId);
    setError("");
    if (toAdd.length > 0 && !users) {
      try {
        await loadUsers(true);
      } catch (err) {
        console.error(err);
        setError("Could not load members.");
        setAddBusy(null);
        return;
      }
    }
    try {
      const add = toAdd
        .map((uid): ParticipantToAdd | null => {
          const user = users?.find((u) => u.uid === uid);
          if (!user) return null;
          return {
            uid,
            nickname: user.data.nickname,
            photoUrl: user.data.photoUrl,
          };
        })
        .filter((x): x is ParticipantToAdd => x !== null);
      await adminApplyParticipantChanges(sessionId, { add, remove: toRemove });
      setAddOpen((prev) => ({ ...prev, [sessionId]: false }));
      setAddSelected((prev) => ({ ...prev, [sessionId]: [] }));
      setAddSearch((prev) => ({ ...prev, [sessionId]: "" }));
    } catch (err) {
      console.error(err);
      setError("Could not save member changes.");
    } finally {
      setAddBusy(null);
    }
  }

  function renderSession(s: SessionEntry) {
    const regs = registrations[s.id] ?? [];
    const wl = waitlists[s.id] ?? [];
    const expanded = !!expandedPlayers[s.id];
    const shown = expanded ? regs : regs.slice(0, PREVIEW_COUNT);
    const members = (users ?? [])
      .slice()
      .sort((a, b) => a.data.nickname.localeCompare(b.data.nickname));
    const search = (addSearch[s.id] ?? "").toLowerCase();
    const filtered = search
      ? members.filter((u) => (u.data.nickname || "").toLowerCase().includes(search))
      : members;
    const selected = addSelected[s.id] ?? [];
    const selectedSet = new Set(selected);
    const toAdd = selected.filter((uid) => !regs.some((r) => r.uid === uid));
    const toRemove = regs.filter((r) => !selectedSet.has(r.uid));
    const pickerOpen = !!addOpen[s.id];
    return (
      <li key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-bold">
              {s.data.location} - {formatSessionDate(s.data.date)}
            </p>
            <p className="text-sm text-slate-600">{s.data.startTime}–{s.data.endTime}</p>
            {s.data.description && (
              <p className="text-sm text-slate-500">{s.data.description}</p>
            )}
            <p className="text-sm text-slate-500">
              {regs.length}
              {typeof s.data.capacity === "number" ? `/${s.data.capacity}` : ""} signed up
              {wl.length > 0 && ` · ${wl.length} on waitlist`}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => startEdit(s)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => duplicate(s)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm font-medium hover:bg-slate-50"
            >
              Copy settings
            </button>
            <button
              type="button"
              onClick={() => remove(s.id)}
              className="rounded-lg border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        </div>

        {regs.length > 0 && (
          <ul className="mt-3 space-y-1">
            {shown.map((r) => (
              <li key={r.uid} className="flex items-center gap-2 text-sm">
                <Avatar src={r.photoUrl} name={r.nickname} size="sm" />
                <span className="flex-1">{r.nickname}</span>
              </li>
            ))}
          </ul>
        )}

        {regs.length > PREVIEW_COUNT && (
          <button
            type="button"
            onClick={() =>
              setExpandedPlayers((prev) => ({ ...prev, [s.id]: !expanded }))
            }
            className="mt-2 text-sm font-semibold text-teal-700 hover:text-teal-800"
          >
            {expanded ? "Show fewer" : `Show all (${regs.length})`}
          </button>
        )}

        {wl.length > 0 && (
          <div className="mt-3 rounded-lg bg-indigo-50 p-2.5">
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-indigo-700">
              Waitlist ({wl.length})
            </p>
            <ul className="space-y-1">
              {wl.map((w) => (
                <li key={w.uid} className="flex items-center gap-2 text-sm">
                  <Avatar src={w.photoUrl} name={w.nickname} size="sm" />
                  <span className="flex-1">{w.nickname}</span>
                  <span className="text-xs text-slate-500">auto-promoted on spot open</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 border-t border-slate-100 pt-3">
          {pickerOpen ? (
            <div>
              <input
                type="text"
                value={addSearch[s.id] ?? ""}
                onChange={(e) =>
                  setAddSearch((prev) => ({ ...prev, [s.id]: e.target.value }))
                }
                placeholder="Search members…"
                className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <ul className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-200 p-1">
                {filtered.length === 0 ? (
                  <li className="px-2 py-3 text-center text-sm text-slate-500">
                    No members found.
                  </li>
                ) : (
                  filtered.map((u) => (
                    <li key={u.uid}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={selected.includes(u.uid)}
                          onChange={() => toggleSelect(s.id, u.uid)}
                          className="size-4"
                        />
                        <Avatar src={u.data.photoUrl} name={u.data.nickname} size="sm" />
                        <span className="truncate">{u.data.nickname || "Unnamed"}</span>
                      </label>
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3 text-sm text-slate-600">
                  <span>
                    {toAdd.length > 0 || toRemove.length > 0
                      ? `${toAdd.length} to add · ${toRemove.length} to remove`
                      : "No changes"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAddOpen((prev) => ({ ...prev, [s.id]: false }));
                      setAddSelected((prev) => ({ ...prev, [s.id]: [] }));
                      setAddSearch((prev) => ({ ...prev, [s.id]: "" }));
                    }}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={addBusy === s.id || (toAdd.length === 0 && toRemove.length === 0)}
                    onClick={() => applyChanges(s.id, regs)}
                    className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                  >
                    {addBusy === s.id ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                void loadUsers();
                setAddOpen((prev) => ({ ...prev, [s.id]: true }));
                setAddSelected((prev) => ({ ...prev, [s.id]: regs.map((r) => r.uid) }));
              }}
              className="rounded-lg border border-teal-600 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              Manage participants
            </button>
          )}
        </div>
      </li>
    );
  }

  const upcoming = (sessions ?? [])
    .filter((s) => !isSessionEnded(s.data))
    .sort((a, b) => {
      const c = (a.data.date ?? "").localeCompare(b.data.date ?? "");
      return c !== 0 ? c : (a.data.startTime ?? "").localeCompare(b.data.startTime ?? "");
    });
  const past = (sessions ?? [])
    .filter((s) => isSessionEnded(s.data))
    .sort((a, b) => {
      const c = (b.data.date ?? "").localeCompare(a.data.date ?? "");
      return c !== 0 ? c : (b.data.startTime ?? "").localeCompare(a.data.startTime ?? "");
    });

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {formOpen ? (
        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
        >
        <h2 className="font-bold">{editingId ? "Edit session" : "Add session"}</h2>
        <label className="block text-sm font-medium">
          Date
          <input
            type="date"
            value={form.date}
            min={editingId ? undefined : todayString()}
            onChange={(e) => set("date", e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            From
            <input
              type="time"
              value={form.startTime}
              onChange={(e) => set("startTime", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            To
            <input
              type="time"
              value={form.endTime}
              onChange={(e) => set("endTime", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Location
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              value={form.location}
              onChange={(e) => set("location", e.target.value)}
              list="saved-locations"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={saveLocation}
              disabled={!form.location.trim()}
              className="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Save
            </button>
          </div>
          <datalist id="saved-locations">
            {savedLocations.map((loc) => (
              <option key={loc} value={loc} />
            ))}
          </datalist>
          {savedLocations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {savedLocations.map((loc) => (
                <span
                  key={loc}
                  className="flex items-center overflow-hidden rounded-full border border-slate-300 bg-slate-50"
                >
                  <button
                    type="button"
                    onClick={() => set("location", loc)}
                    className="py-1 pl-2.5 pr-1 text-xs text-slate-600 hover:bg-slate-100"
                  >
                    {loc}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeLocation(loc)}
                    aria-label={`Remove ${loc}`}
                    className="py-1 pr-2 text-xs text-slate-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </label>
        <label className="block text-sm font-medium">
          Description
          <textarea
            rows={3}
            maxLength={500}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Capacity
          <input
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value)}
            placeholder="Leave empty = no limit"
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
        {editingId && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm font-medium">
                Total cost
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                  placeholder="e.g. 36 (leave empty = free)"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm font-medium">
                How many joined
                <input
                  type="number"
                  min={1}
                  value={form.playersOverride}
                  onChange={(e) => set("playersOverride", e.target.value)}
                  placeholder="Optional"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Each player pays <span className="font-semibold">total ÷ players that played</span>.
              Leave the players field empty to use the number of registered players.
            </p>
          </>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Add session"}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openNew}
          className="w-full rounded-2xl border-2 border-dashed border-teal-300 bg-teal-50 px-4 py-4 text-sm font-semibold text-teal-700 hover:bg-teal-100"
        >
          + New session
        </button>
      )}

      <div>
        <h2 className="mb-3 font-bold">Sessions</h2>
        {!sessions ? (
          <p className="py-8 text-center text-slate-400">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center">
            <p className="text-slate-500">No sessions yet.</p>
            {!formOpen && (
              <button
                type="button"
                onClick={openNew}
                className="mt-4 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                Add your first session
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Upcoming ({upcoming.length})
              </h3>
              {upcoming.length === 0 ? (
                <p className="text-sm text-slate-500">No upcoming sessions.</p>
              ) : (
                <ul className="space-y-3">{upcoming.map(renderSession)}</ul>
              )}
            </section>

            {past.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => {
                    const next = !showPast;
                    setShowPast(next);
                    showPastRef.current = next;
                    if (next) loadPastDetails();
                  }}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3"
                >
                  <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                    Past sessions ({past.length})
                  </span>
                  <span
                    className={cn(
                      "text-slate-400 transition-transform",
                      showPast && "rotate-180"
                    )}
                  >
                    ▾
                  </span>
                </button>
                {showPast && (
                  <ul className="mt-3 space-y-3">{past.map(renderSession)}</ul>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
