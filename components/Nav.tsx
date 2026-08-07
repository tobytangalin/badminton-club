"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/cn";

const primaryLinks = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/members", label: "Members", icon: "🏆" },
  { href: "/committee", label: "Committee", icon: "👥" },
];

const memberLinks = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/committee", label: "Committee", icon: "👥" },
];

export function Nav() {
  const { user, userData, isAdmin, signOut, configured } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  if (!configured) return null;

  const links = isAdmin
    ? [...primaryLinks, { href: "/admin", label: "Admin", icon: "⚙️" }]
    : user
      ? primaryLinks
      : memberLinks;

  async function handleSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-900">
            <img
              src="https://firebasestorage.googleapis.com/v0/b/social-badminton.firebasestorage.app/o/landing%2Flogo.webp?alt=media"
              alt="Social &amp; Badminton Club logo"
              className="size-8 rounded-lg"
            />
            <span className="hidden sm:inline">Social &amp; Badminton Club</span>
          </Link>

          <nav className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-teal-50 text-teal-700"
                      : "text-slate-600 hover:bg-slate-100"
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            {user && (
              <>
                <Link href="/" className="hidden items-center gap-2 sm:flex">
                  <Avatar src={userData?.photoUrl} name={(userData?.nickname || user.displayName) ?? undefined} size="sm" />
                </Link>
                <button
                  onClick={handleSignOut}
                  className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
                >
                  Sign out
                </button>
              </>
            )}
            {!user && (
              <Link
                href="/login"
                className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {user && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className={cn("grid", isAdmin ? "grid-cols-4" : "grid-cols-3")}>
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium",
                    active ? "text-teal-700" : "text-slate-500"
                  )}
                >
                  <span className="text-lg leading-none">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
