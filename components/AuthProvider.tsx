"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { getAuthClient, getDb, isFirebaseConfigured } from "@/lib/firebase";
import { ensureUserDoc } from "@/lib/db";
import { useWhenVisible } from "@/lib/useWhenVisible";
import type { UserDoc } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  userData: UserDoc | null;
  loading: boolean;
  configured: boolean;
  isAdmin: boolean;
  isApproved: boolean;
  needsProfile: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const unsubscribeAuth = onAuthStateChanged(getAuthClient(), (fbUser) => {
      setUser(fbUser);
      if (!fbUser) {
        setUserData(null);
        setLoading(false);
      }
    });
    return unsubscribeAuth;
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !user) return;
    ensureUserDoc(user.uid, {
      email: user.email ?? undefined,
      photoUrl: user.photoURL ?? undefined,
      provider: user.providerData[0]?.providerId ?? "password",
    }).catch((err) => {
      console.error("Failed to create user profile", err);
      setLoading(false);
    });
  }, [user]);

  const subscribeUserDoc = useCallback(() => {
    if (!user) return;
    const unsubscribeDoc = onSnapshot(
      doc(getDb(), "users", user.uid),
      (snap) => {
        const data = snap.data() as UserDoc | undefined;
        if (data) {
          setUserData(data);
          setLoading(false);
        }
      },
      (err) => {
        console.error("Failed to load user profile", err);
        setLoading(false);
      }
    );
    return unsubscribeDoc;
  }, [user]);

  useWhenVisible(subscribeUserDoc);

  const signOut = useSignOut();

  const isAdmin = userData?.role === "admin";
  const isApproved = userData ? (userData.approved ?? true) : false;
  const needsProfile = Boolean(user && userData && !userData.nickname);

  return (
    <AuthContext.Provider
      value={{
        user,
        userData,
        loading,
        configured: isFirebaseConfigured,
        isAdmin,
        isApproved,
        needsProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function useSignOut() {
  return async () => {
    await fbSignOut(getAuthClient());
  };
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
