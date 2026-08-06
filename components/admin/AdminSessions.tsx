"use client";

import { useCallback, useState, type FormEvent } from "react";
import { onSnapshot } from "firebase/firestore";
import { Avatar } from "@/components/Avatar";
import {
  createSession,
  deleteSession,
  registrationsRef,
  sessionsRef,
  unregisterFromSession,
  updateSession,
} from "@/lib/db";
import { useWhenVisible } from "@/lib/useWhenVisible";
import type { Registration, SessionDoc } from "@/lib/types";

interface SessionEntry {
  id: string;
  data: SessionDoc;
}

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface FormState {
  title: string;
  day: string;
  time: string;
  location: string;
  capacity: string;
  cost: string;
  playersOverride: string;
}

const emptyForm: FormState = {
  title: "",
  day: "Monday",
  time: "19:00",
  location: "",
  capacity: "16",
  cost: "",
  playersOverride: "",
};

export function AdminSessions() {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [registrations, setRegistrations] = useState<Record<string, Registration[]>>({});
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const subscribeSessions = useCallback(() => {
    const unsub = onSnapshot(sessionsRef(), (snap) => {
      setSessions(snap.docs.map((d) => ({ id: d.id, data: d.data() as SessionDoc })));
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

  useWhenVisible(subscribeSessions);
  useWhenVisible(subscribeRegistrations);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit(s: SessionEntry) {
    setEditingId(s.id);
    setForm({
      title: s.data.title,
      day: s.data.day,
      time: s.data.time,
      location: s.data.location,
      capacity: String(s.data.capacity),
      cost: s.data.cost ? String(s.data.cost) : "",
      playersOverride: s.data.playersOverride ? String(s.data.playersOverride) : "",
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const capacity = parseInt(form.capacity, 10);
    if (!form.title.trim() || !form.location.trim()) {
      setError("Title and location are required.");
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 1) {
      setError("Capacity must be at least 1.");
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
        title: form.title.trim(),
        day: form.day,
        time: form.time,
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

  async function removeUser(sessionId: string, uid: string) {
    setError("");
    try {
      await unregisterFromSession(sessionId, uid);
    } catch (err) {
      console.error(err);
      setError("Could not remove player.");
    }
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      <form
        onSubmit={submit}
        className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <h2 className="font-bold">{editingId ? "Edit session" : "Add session"}</h2>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Title (e.g. Social Night)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Day
            <select
              value={form.day}
              onChange={(e) => set("day", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Time
            <input
              type="time"
              value={form.time}
              onChange={(e) => set("time", e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </label>
        </div>
        <input
          type="text"
          value={form.location}
          onChange={(e) => set("location", e.target.value)}
          placeholder="Location (e.g. City Sports Hall, Court 2)"
          className="w-full rounded-xl border border-slate-300 px-3 py-2"
        />
        <label className="block text-sm font-medium">
          Capacity
          <input
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2"
          />
        </label>
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
            Players that played
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
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl border border-slate-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{s.data.title}</p>
                    <p className="text-sm text-slate-600">
                      {s.data.day} · {s.data.time} · {s.data.location}
                    </p>
                    <p className="text-sm text-slate-500">
                      {registrations[s.id]?.length ?? 0}/{s.data.capacity} signed up
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
                      onClick={() => remove(s.id)}
                      className="rounded-lg border border-red-200 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {(registrations[s.id] ?? []).length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {(registrations[s.id] ?? []).map((r) => (
                      <li
                        key={r.uid}
                        className="flex items-center gap-2 text-sm"
                      >
                        <Avatar src={r.photoUrl} name={r.nickname} size="sm" />
                        <span className="flex-1">{r.nickname}</span>
                        <button
                          type="button"
                          onClick={() => removeUser(s.id, r.uid)}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
