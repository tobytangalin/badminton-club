"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/Spinner";
import { SetupNotice } from "@/components/SetupNotice";
import { AdminPanel } from "@/components/admin/AdminPanel";

export default function AdminPage() {
  const { user, isAdmin, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!configured || loading) return;
    if (!user) router.replace("/login");
    else if (!isAdmin) router.replace("/");
  }, [configured, loading, user, isAdmin, router]);

  if (!configured) {
    return (
      <div className="py-16">
        <SetupNotice />
      </div>
    );
  }

  if (loading || !user || !isAdmin) return <Spinner />;

  return <AdminPanel uid={user.uid} />;
}
