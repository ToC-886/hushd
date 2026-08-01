"use client";

import * as React from "react";
import { get, post, ApiError } from "./api";
import type { Me, RegisterResult, UserRole } from "./types";

type AuthState = {
  me: Me | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  hasRole: (role: UserRole) => boolean;
  login: (input: { email: string; password: string; totpCode?: string }) => Promise<void>;
  register: (input: { email: string; password: string; role?: UserRole }) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
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
      // transient errors keep the previous state
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
      await refreshMe();
    },
    [refreshMe],
  );

  const register = React.useCallback(
    async (input: { email: string; password: string; role?: UserRole }) => {
      const result = await post<RegisterResult>(
        "/auth/register",
        { email: input.email, password: input.password, role: input.role },
        { skipAuthRetry: true },
      );
      if ("accessToken" in result) {
        // Auto-activated (dev) account — cookies are already set by the API.
        await refreshMe();
      }
      return result;
    },
    [refreshMe],
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

  const hasRole = React.useCallback((role: UserRole) => Boolean(me?.roles.includes(role)), [me]);

  const value = React.useMemo<AuthState>(
    () => ({
      me,
      isLoading,
      isAuthenticated: Boolean(me),
      hasRole,
      login,
      register,
      logout,
      refreshMe,
    }),
    [me, isLoading, hasRole, login, register, logout, refreshMe],
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
