"use client";

import { useEffect, useState } from "react";
import { AdminSessions } from "@/components/admin/AdminSessions";
import { AdminUsers } from "@/components/admin/AdminUsers";
import { cn } from "@/lib/cn";

type Tab = "users" | "sessions";

export function AdminPanel({ uid }: { uid: string }) {
  const [tab, setTab] = useState<Tab>("sessions");

  // The admin Home banner links to /admin?tab=users. setState is deferred into
  // a microtask because react-hooks/set-state-in-effect forbids sync setState.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "users") {
      void Promise.resolve().then(() => setTab("users"));
    }
  }, []);

  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Admin</h1>

      <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-200 p-1 text-sm font-medium">
        {(["sessions", "users"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg py-2 capitalize",
              tab === t ? "bg-white shadow" : "text-slate-500"
            )}
          >
            {t === "users" ? "Users" : "Sessions"}
          </button>
        ))}
      </div>

      {tab === "users" ? <AdminUsers currentUid={uid} /> : <AdminSessions />}
    </section>
  );
}
