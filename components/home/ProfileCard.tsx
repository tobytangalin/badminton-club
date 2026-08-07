"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { uploadProfilePhoto, updateUserProfile } from "@/lib/db";
import { resizeAvatar } from "@/lib/image";
import { cn } from "@/lib/cn";

export function ProfileCard() {
  const { user, userData, needsProfile } = useAuth();
  const [editing, setEditing] = useState(needsProfile);
  const [nickname, setNickname] = useState(userData?.nickname ?? "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  if (!user || !userData) return null;

  const uid = user.uid;

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Photo must be under 5 MB.");
      return;
    }
    setError("");
    setPhoto(URL.createObjectURL(file));
    setUploading(true);
    try {
      const resized = await resizeAvatar(file);
      const url = await uploadProfilePhoto(resized, uid);
      setPhoto(url);
    } catch (err) {
      console.error(err);
      setError("Could not upload photo.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!nickname.trim()) {
      setError("Please choose a nickname.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateUserProfile(uid, {
        nickname: nickname.trim(),
        ...(photo ? { photoUrl: photo } : {}),
      });
      setEditing(false);
    } catch (err) {
      console.error(err);
      setError("Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border p-5",
        needsProfile ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      )}
    >
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative shrink-0"
          aria-label="Change photo"
        >
          <Avatar
            src={photo ?? userData.photoUrl}
            name={(userData.nickname || user.displayName) ?? undefined}
            size="lg"
          />
          {editing && (
            <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-teal-600 text-xs text-white">
              ✎
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />
        <div className="min-w-0 flex-1">
          {needsProfile && (
            <p className="mb-1 text-sm font-medium text-amber-800">
              Choose a nickname to register for sessions.
            </p>
          )}
          {editing ? (
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Your nickname"
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          ) : (
            <h2 className="truncate text-xl font-bold text-slate-900">
              {userData.nickname || user.displayName || "Member"}
            </h2>
          )}
          {!editing && userData.email && (
            <p className="text-sm text-slate-500">{userData.email}</p>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setNickname(userData.nickname);
              setPhoto(null);
              setError("");
              setEditing(true);
            }}
            className="shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
          >
            Edit
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-4 space-y-3">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving || uploading}
              className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
