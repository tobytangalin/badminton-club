"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { Spinner } from "@/components/Spinner";
import { SetupNotice } from "@/components/SetupNotice";
import { ProfileCard } from "@/components/home/ProfileCard";
import { SessionsView } from "@/components/home/SessionsView";

export function HomeContent() {
  const { user, isApproved, loading, configured } = useAuth();

  if (!configured) {
    return (
      <div className="py-16">
        <SetupNotice />
      </div>
    );
  }

  if (loading) return <Spinner />;

  if (!user) return <PublicLanding />;

  if (!isApproved) {
    return (
      <div className="space-y-6">
        <ProfileCard />
        <PendingApproval />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ProfileCard />
      <SessionsView />
    </div>
  );
}

function PendingApproval() {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">Membership pending approval</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
        Your request is with the club admins. Once they approve your account,
        you&apos;ll be able to see sessions and register your spot.
      </p>
    </section>
  );
}

function PublicLanding() {
  return (
    <div className="space-y-8 py-8">
      <section className="text-center">
        <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Social &amp; Badminton Club
        </h1>
        <p className="mx-auto mt-3 text-slate-600">
          Are you looking for a place to play badminton? You&apos;ve come to the
          right place!
        </p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- hero is pre-optimized WebP from Firebase Storage */}
        <img
          src="https://firebasestorage.googleapis.com/v0/b/social-badminton.firebasestorage.app/o/landing%2Fhero.webp?alt=media"
          alt="Badminton players at Social &amp; Badminton Club"
          className="h-auto w-full"
        />
      </section>

      <section className="space-y-4 text-slate-700">
        <p>
          At our club we welcome everyone, whether you&apos;re a total beginner
          or an experienced player. Our focus is on creating a relaxed,
          inclusive environment where people of all skill levels can enjoy the
          game, meet new people, and have a great time on and off the court.
        </p>
        <p>
          We play every Sunday, usually at DGI Byen in Copenhagen (unless the
          court is unavailable). Just check our sessions page to see upcoming
          sessions and register your spot.
        </p>
        <p>
          No racket? No problem! You&apos;re welcome to come without one. Many
          players are happy to share, and we provide shuttlecocks for all
          games.
        </p>
        <p>
          We simply split the court fee equally among all players, based on the
          number of hours played, so everyone just pays their fair share.
        </p>
        <p>
          After playing, we occasionally go out for dinner together; a great
          way to unwind, chat, and connect with fellow players in a casual
          setting.
        </p>
        <p>
          So whether you&apos;re here to improve your skills, stay active, or
          just enjoy a friendly match, you&apos;ll find a warm and welcoming
          community that shares your love for badminton.
        </p>
      </section>

      <section className="rounded-2xl bg-teal-50 p-6 text-center">
        <h2 className="text-lg font-semibold text-teal-900">Come join us</h2>
        <p className="mt-1 text-sm text-teal-800">
          We can&apos;t wait to meet you!
        </p>
        <div className="mt-5 flex justify-center">
          <Link
            href="/login?mode=signup"
            className="rounded-xl bg-teal-600 px-6 py-3 font-medium text-white hover:bg-teal-700"
          >
            Sign up
          </Link>
        </div>
      </section>
    </div>
  );
}
