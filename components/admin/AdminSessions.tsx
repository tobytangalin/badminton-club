"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { onSnapshot } from "firebase/firestore";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";
import { formatSessionDate, isSessionEnded, normalizeSession } from "@/lib/date";
import { getSavedLocations, persistSavedLocations } from "@/lib/locations";
import {
  adminAddRegistration,
  createSession,
  deleteSession,
  registrationsRef,
  sessionsRef,
  unregisterFromSession,
  updateSession,
  usersRef,
} from "@/lib/db";
import { useWhenVisible } from "@/lib/useWhenVisible";
import type { Registration, SessionDoc, UserDoc } from "@/lib/types";

interface SessionEntry {
  id: string;
  data: SessionDoc;
}

interface FormState {
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  capacity: string;
  cost: string;
  playersOverride: string;
}

const emptyForm: FormState = {
  date: "",
  startTime: "19:00",
  endTime: "21:00",
  location: "",
  capacity: "",
  cost: "",
  playersOverride: "",
};

const PREVIEW_COUNT = 8;

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
  const [users, setUsers] = useState<{ uid: string; data: UserDoc }[] | null>(null);
  const [form, setForm] = useState<FormState>(() => ({ ...emptyForm, date: todayString() }));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [expandedPlayers, setExpandedPlayers] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState<Record<string, boolean>>({});
  const [addSelected, setAddSelected] = useState<Record<string, string[]>>({});
  const [addSearch, setAddSearch] = useState<Record<string, string>>({});
  const [addBusy, setAddBusy] = useState<string | null>(null);

  useEffect(() => {
    void Promise.resolve(getSavedLocations()).then(setSavedLocations);
  }, []);

  const subscribeSessions = useCallback(() => {
    const unsub = onSnapshot(sessionsRef(), (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, data: normalizeSession(d.data() as SessionDoc) })));
    });
    return unsub;
  }, []);

  const subscribeRegistrations = useCallback(() => {
    if (!sessions) return;
    const unsubs = sessions.map((s) =>
      onSnapshot(registrationsRef(s.id), (snap) => {
        setRegistrations((prev) => ({
          ...prev,
          [s.id]: snap.docs.map((d) => d.data() as Registration),
        }));
      })
    );
    return () => unsubs.forEach((u) => u());
  }, [sessions]);

  const subscribeUsers = useCallback(() => {
    const unsub = onSnapshot(usersRef(), (snap) => {
      setUsers(snap.docs.map((d) => ({ uid: d.id, data: d.data() as UserDoc })));
    });
    return unsub;
  }, []);

  useWhenVisible(subscribeSessions);
  useWhenVisible(subscribeRegistrations);
  useWhenVisible(subscribeUsers);

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

  function startEdit(s: SessionEntry) {
    setEditingId(s.id);
    setForm({
      date: s.data.date,
      startTime: s.data.startTime,
      endTime: s.data.endTime,
      location: s.data.location,
      capacity: s.data.capacity ? String(s.data.capacity) : "",
      cost: s.data.cost ? String(s.data.cost) : "",
      playersOverride: s.data.playersOverride ? String(s.data.playersOverride) : "",
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm({ ...emptyForm, date: todayString() });
    setError("");
  }

  function duplicate(s: SessionEntry) {
    setEditingId(null);
    setForm({
      date: s.data.date,
      startTime: s.data.startTime,
      endTime: s.data.endTime,
      location: s.data.location,
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
    try {
      for (const uid of toAdd) {
        const user = users?.find((u) => u.uid === uid);
        if (!user) continue;
        await adminAddRegistration(sessionId, uid, {
          nickname: user.data.nickname,
          photoUrl: user.data.photoUrl,
        });
      }
      for (const uid of toRemove) {
        await unregisterFromSession(sessionId, uid);
      }
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
            <p className="text-sm text-slate-500">
              {regs.length}
              {typeof s.data.capacity === "number" ? `/${s.data.capacity}` : ""} signed up
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
              placeholder="e.g. City Sports Hall, Court 2"
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
          {editingId && (
            <button
              type="button"
              onClick={cancelEdit}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div>
        <h2 className="mb-3 font-bold">Sessions</h2>
        {!sessions ? (
          <p className="py-8 text-center text-slate-400">Loading sessions…</p>
        ) : sessions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No sessions yet. Add your first one above.
          </p>
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
                  onClick={() => setShowPast((v) => !v)}
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
