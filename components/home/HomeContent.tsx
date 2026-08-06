"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/Spinner";
import { SetupNotice } from "@/components/SetupNotice";
import { ProfileCard } from "@/components/home/ProfileCard";
import { SessionsView } from "@/components/home/SessionsView";

export function HomeContent() {
  const { user, loading, configured } = useAuth();

  if (!configured) {
    return (
      <div className="py-16">
        <SetupNotice />
      </div>
    );
  }

  if (loading) return <Spinner />;

  if (!user) return <PublicLanding />;

  return (
    <div className="space-y-6">
      <ProfileCard />
      <SessionsView />
    </div>
  );
}

function PublicLanding() {
  return (
    <div className="space-y-8 py-8">
      <section className="text-center">
        <span className="text-6xl" aria-hidden>
          🏸
        </span>
        <h1 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Social Badminton Club
        </h1>
        <p className="mx-auto mt-3 max-w-md text-slate-600">
          Weekly social badminton sessions, friendly skill rankings and a great group of
          players. Join us for fun games for all levels.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/login?mode=signup"
            className="rounded-xl bg-teal-600 px-6 py-3 font-medium text-white hover:bg-teal-700"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-medium text-slate-700 hover:bg-slate-50"
          >
            Sign in
          </Link>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: "Book sessions",
            body: "See who's coming, how many slots are left, and grab your spot.",
          },
          {
            title: "Skill rankings",
            body: "Rate players 1–5 stars and see how the club ranks itself.",
          },
          {
            title: "All levels",
            body: "Casual social games for every standard, from beginner to pro.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h2 className="font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-1 text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl bg-teal-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-teal-900">Where to find us</h2>
        <p className="mt-1 text-sm text-teal-800">
          Sessions and locations are shown to members after you sign in.
        </p>
      </section>
    </div>
  );
}
