/**
 * Auth session context: holds the current bearer token + public user
 * profile, bootstraps them from persisted storage on app start, and
 * exposes `register`/`login`/`logout`.
 *
 * Must be rendered inside `QueryClientProvider` (see `app/app/_layout.tsx`)
 * since `logout` clears the TanStack Query cache so a signed-out session
 * never shows another account's cached words/progress/stats.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import {
  clearCachedUser,
  clearStoredToken,
  getCachedUser,
  getStoredToken,
  setCachedUser,
  setStoredToken,
} from "../api/authStorage";
import { loginRequest, registerRequest, type WireUser } from "../api/endpoints";
import { ApiError } from "../api/client";

interface AuthContextValue {
  /** True while the initial SecureStore/AsyncStorage read is in flight. */
  isBootstrapping: boolean;
  token: string | null;
  user: WireUser | null;
  isAuthenticated: boolean;
  /**
   * Returns the freshly-created user (rather than `void`) so the caller
   * (`(onboarding)/account.tsx`) can branch on `hasCompletedAssessment`
   * immediately, without waiting for a re-render to see the updated
   * `user` from this context - registering always yields a brand new
   * account, so this is always `hasCompletedAssessment: false`, but
   * reading it off the return value keeps both code paths (register/login)
   * symmetrical.
   */
  register: (params: { email: string; password: string; minutesPerDay?: number }) => Promise<WireUser>;
  /** Returns the logged-in user so the caller can branch on `hasCompletedAssessment`. */
  login: (params: { email: string; password: string }) => Promise<WireUser>;
  logout: () => Promise<void>;
  /**
   * Merges a partial update into the cached user (in memory + persisted
   * storage), without a round trip - for cases where a mutation elsewhere
   * (e.g. submitting the entrance assessment) already tells us the new
   * field value server-side, so re-fetching the whole user would be
   * redundant. In particular, keeps `hasCompletedAssessment` in sync right
   * after a successful assessment submit, so the root-layout redirect
   * (app/_layout.tsx) doesn't send the user back into the assessment if
   * they close and reopen the app immediately after finishing it.
   */
  updateUser: (patch: Partial<WireUser>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<WireUser | null>(null);

  useEffect(() => {
    (async () => {
      const [storedToken, cachedUser] = await Promise.all([getStoredToken(), getCachedUser()]);
      setToken(storedToken);
      setUser((cachedUser as WireUser | null) ?? null);
      setIsBootstrapping(false);
    })();
  }, []);

  async function persistSession(nextToken: string, nextUser: WireUser) {
    await Promise.all([setStoredToken(nextToken), setCachedUser(nextUser)]);
    setToken(nextToken);
    setUser(nextUser);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      isBootstrapping,
      token,
      user,
      isAuthenticated: token !== null,

      async register({ email, password, minutesPerDay }) {
        const { token: newToken, user: newUser } = await registerRequest({
          email,
          password,
          minutesPerDay,
        });
        await persistSession(newToken, newUser);
        return newUser;
      },

      async login({ email, password }) {
        const { token: newToken, user: newUser } = await loginRequest({ email, password });
        await persistSession(newToken, newUser);
        return newUser;
      },

      async logout() {
        await Promise.all([clearStoredToken(), clearCachedUser()]);
        setToken(null);
        setUser(null);
        queryClient.clear();
      },

      async updateUser(patch) {
        setUser((current) => {
          if (!current) return current;
          const next = { ...current, ...patch };
          // Fire-and-forget persist - the in-memory state update above is
          // what matters for this render; a slow/failed AsyncStorage write
          // just means the next cold start re-reads the slightly stale
          // cached copy, which is harmless here.
          void setCachedUser(next);
          return next;
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBootstrapping, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export { ApiError };
