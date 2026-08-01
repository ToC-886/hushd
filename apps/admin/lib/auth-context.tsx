"use client";

import * as React from "react";
import { get, post, ApiError } from "./api";
import type { Me } from "./types";

type AuthState = {
  me: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (input: { email: string; password: string; totpCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = React.createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  // Session state lives in HttpOnly cookies, so "am I logged in?" can only be
  // answered by the API — /auth/me (the fetch wrapper refreshes once on 401).
  const refreshMe = React.useCallback(async () => {
    try {
      const profile = await get<Me>("/auth/me");
      setMe(profile);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setMe(null);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const login = React.useCallback(
    async (input: { email: string; password: string; totpCode?: string }) => {
      await post(
        "/auth/login",
        { email: input.email, password: input.password, totpCode: input.totpCode },
        { skipAuthRetry: true },
      );
      const profile = await get<Me>("/auth/me");
      if (!profile.roles.includes("ADMIN")) {
        // Non-admin sessions must not linger in the admin app — revoke them.
        await post("/auth/logout", {}, { skipAuthRetry: true }).catch(() => undefined);
        setMe(null);
        throw new ApiError(403, "not_admin", "This account does not have admin access.");
      }
      setMe(profile);
    },
    [],
  );

  const logout = React.useCallback(async () => {
    try {
      await post("/auth/logout", {}, { skipAuthRetry: true });
    } catch {
      // best-effort logout — always clear local state
    } finally {
      setMe(null);
    }
  }, []);

  const value = React.useMemo<AuthState>(
    () => ({
      me,
      isLoading,
      isAuthenticated: Boolean(me),
      isAdmin: Boolean(me?.roles.includes("ADMIN")),
      login,
      logout,
    }),
    [me, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = React.useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within <AuthProvider>");
  }
  return ctx;
}
