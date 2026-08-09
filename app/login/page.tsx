"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
} from "firebase/auth";
import { getAuthClient, requireFirebaseConfigured } from "@/lib/firebase";
import { ensureUserDoc, updateUserProfile } from "@/lib/db";
import { useAuth } from "@/components/AuthProvider";
import { SetupNotice } from "@/components/SetupNotice";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const { user, configured } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  if (!configured) {
    return (
      <div className="py-16">
        <SetupNotice />
      </div>
    );
  }

  if (user) return null;

  async function handleGoogle() {
    setError("");
    setBusy(true);
    try {
      requireFirebaseConfigured();
      await signInWithPopup(getAuthClient(), new GoogleAuthProvider());
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (mode === "signup" && !nickname.trim()) {
      setError("Please choose a nickname.");
      return;
    }
    setBusy(true);
    try {
      requireFirebaseConfigured();
      const auth = getAuthClient();
      if (mode === "signup") {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserDoc(cred.user.uid, {
          email,
          provider: "password",
        });
        await updateUserProfile(cred.user.uid, { nickname: nickname.trim() });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.replace("/");
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!resetEmail.trim()) {
      setError("Please enter your email address.");
      return;
    }
    setBusy(true);
    try {
      requireFirebaseConfigured();
      await sendPasswordResetEmail(getAuthClient(), resetEmail.trim());
      setResetSent(true);
    } catch (err) {
      if ((err as { code?: string })?.code === "auth/user-not-found") {
        setResetSent(true);
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm py-8">
      <h1 className="mb-6 text-center text-2xl font-bold">
        {mode === "signin" ? "Welcome back" : "Join the club"}
      </h1>

      {showReset ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <h2 className="mb-1 text-center font-semibold">Reset password</h2>
          <p className="mb-3 text-center text-sm text-slate-500">
            Enter your email and we&apos;ll send you a link to set a new password.
          </p>
          {resetSent ? (
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-700">
              If an account exists for that email, a password reset link is on its way.
            </p>
          ) : (
            <form onSubmit={handleReset} className="space-y-3">
              <label htmlFor="reset-email" className="mb-1 block text-sm font-medium">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                required
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              />
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
          <button
            type="button"
            onClick={() => {
              setShowReset(false);
              setResetSent(false);
              setError("");
            }}
            className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            ← Back to sign in
          </button>
        </div>
      ) : (
        <>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-medium hover:bg-slate-50 disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>

      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or with email
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <div className="mb-4 grid grid-cols-2 rounded-xl bg-slate-200 p-1 text-sm font-medium">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`rounded-lg py-1.5 ${mode === "signin" ? "bg-white shadow" : "text-slate-500"}`}
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`rounded-lg py-1.5 ${mode === "signup" ? "bg-white shadow" : "text-slate-500"}`}
        >
          Create account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <div>
            <label htmlFor="nickname" className="mb-1 block text-sm font-medium">
              Nickname
            </label>
            <input
              id="nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Smash King"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
            />
          </div>
        )}
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </div>
        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
          />
        </div>
        {mode === "signin" && (
          <div className="text-right">
            <button
              type="button"
              onClick={() => {
                setResetEmail(email);
                setShowReset(true);
                setError("");
              }}
              className="text-sm font-medium text-teal-700 hover:underline"
            >
              Forgot password?
            </button>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-teal-600 px-4 py-2.5 font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {busy
            ? "Please wait…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/" className="text-teal-700 hover:underline">
          ← Back to home
        </Link>
      </p>
      </>
      )}
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/email-already-in-use": "An account already exists for that email.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/popup-closed-by-user": "Sign-in was cancelled.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}
