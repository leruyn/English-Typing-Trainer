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

import type { AssessmentAnswer } from "@art/shared";
import {
  clearCachedUser,
  clearStoredToken,
  getCachedUser,
  getStoredToken,
  setCachedUser,
  setStoredToken,
} from "../api/authStorage";
import { loginRequest, registerRequest, submitAssessment, type WireUser } from "../api/endpoints";
import { ApiError } from "../api/client";

interface AuthContextValue {
  /** True while the initial SecureStore/AsyncStorage read is in flight. */
  isBootstrapping: boolean;
  token: string | null;
  user: WireUser | null;
  isAuthenticated: boolean;
  register: (params: {
    email: string;
    password: string;
    minutesPerDay?: number;
    /** Optional completed-assessment answers, submitted right after the
     * account is created so onboarding only needs one network round trip
     * from the user's perspective. */
    assessmentAnswers?: AssessmentAnswer[];
  }) => Promise<void>;
  login: (params: { email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
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

      async register({ email, password, minutesPerDay, assessmentAnswers }) {
        const { token: newToken, user: newUser } = await registerRequest({
          email,
          password,
          minutesPerDay,
        });
        await persistSession(newToken, newUser);

        if (assessmentAnswers && assessmentAnswers.length === 5) {
          try {
            await submitAssessment(assessmentAnswers, newToken);
          } catch (err) {
            // Don't fail account creation over the assessment record - the
            // account/track choice already stands; just log it.
            // eslint-disable-next-line no-console
            console.warn("Failed to submit assessment result:", err);
          }
        }
      },

      async login({ email, password }) {
        const { token: newToken, user: newUser } = await loginRequest({ email, password });
        await persistSession(newToken, newUser);
      },

      async logout() {
        await Promise.all([clearStoredToken(), clearCachedUser()]);
        setToken(null);
        setUser(null);
        queryClient.clear();
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
