"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/Spinner";
import { SetupNotice } from "@/components/SetupNotice";
import { RankingClient } from "@/components/ranking/RankingClient";

export default function RankingPage() {
  const { user, loading, configured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!configured || loading) return;
    if (!user) router.replace("/login");
  }, [configured, loading, user, router]);

  if (!configured) {
    return (
      <div className="py-16">
        <SetupNotice />
      </div>
    );
  }

  if (loading || !user) return <Spinner />;

  return <RankingClient currentUid={user.uid} />;
}
