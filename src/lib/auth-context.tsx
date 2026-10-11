"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { getFirebaseAuth, getDataConnectInstance } from "@/lib/firebase";
import { me, hasOrganisation, registerUser } from "@/lib/dataconnect-generated";
import { markFreshLogin, clearFreshLogin } from "@/lib/welcome";

/**
 * The app-facing shape is unchanged from the pre-Firebase version: snake_case
 * fields and a string `id`. Firebase Auth UIDs are strings, so `id` is typed
 * string here where it was number before. Callers comparing
 * `member.user_id === user.id` keep working because both sides are UIDs.
 */
interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  company_name?: string;
  role: string;
  account_type?: "applicant" | "issuer";
  onboarding_completed?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    full_name: string,
    password: string,
    company_name?: string,
    account_type?: "applicant" | "issuer"
  ) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Loads the app-level profile from SQL Connect and creates the tenancy layer
   * on first sign-in. RegisterUser is not idempotent, so it only runs when
   * HasOrganisation reports no membership.
   *
   * `me` is read with SERVER_ONLY. DataConnect defaults queries to
   * PREFER_CACHE, and this instance is created without cacheSettings, so the
   * QueryManager answers from its in-memory subscriptionCache instead of the
   * server. Mutations do not invalidate it, so after CompleteOnboarding wrote
   * onboardingCompleted=true the cached pre-mutation row was replayed and the
   * app stayed on the onboarding screen with a success toast. Callers that run
   * after a write must always see committed server state.
   */
  const loadProfile = useCallback(async (fbUser: FirebaseUser) => {
    const dc = getDataConnectInstance();

    const existing = await hasOrganisation(dc, { fetchPolicy: "SERVER_ONLY" });
    const memberships = existing.data.user?.memberships_on_user ?? [];

    if (memberships.length === 0) {
      await registerUser(dc, {
        fullName: fbUser.displayName || fbUser.email?.split("@")[0] || "New user",
        organisationName: `${fbUser.email?.split("@")[0] || "New user"}'s Organisation`,
        companyName: null,
        accountType: "applicant",
      });
    }

    const res = await me(dc, { fetchPolicy: "SERVER_ONLY" });
    const row = res.data.user;
    if (!row) {
      setUser(null);
      return;
    }
    setUser({
      id: row.id,
      email: row.email,
      full_name: row.fullName,
      company_name: row.companyName ?? undefined,
      role: row.role,
      account_type: row.accountType as "applicant" | "issuer",
      onboarding_completed: row.onboardingCompleted,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const fbUser = getFirebaseAuth().currentUser;
    if (!fbUser) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      await loadProfile(fbUser);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadProfile]);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), async (fbUser) => {
      if (!fbUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        await loadProfile(fbUser);
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
  }, [loadProfile]);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    markFreshLogin();
  };

  const register = async (
    email: string,
    full_name: string,
    password: string,
    _company_name?: string,
    _account_type?: "applicant" | "issuer"
  ) => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await updateProfile(cred.user, { displayName: full_name });
    markFreshLogin();

    // Record bidder vs issuer on the backend. The backend user row is created on
    // this very request, so without this every account stayed an applicant and
    // the issuer portal could never be reached.
    const type = _account_type === "issuer" ? "issuer" : "applicant";
    try {
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/auth/account-type", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ account_type: type }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          localStorage.setItem("tenderflow_user", JSON.stringify(data.user));
        }
      }
    } catch {
      // A failed preference must never block sign-up; the account still works.
    }
    // The profile row and tenancy are written by the onAuthStateChanged
    // handler via loadProfile, so the caller does not write them here.
  };

  const logout = () => {
    clearFreshLogin();
    signOut(getFirebaseAuth());
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
