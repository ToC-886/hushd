import type { CookieOptions, Response } from "express";
import type { EnvReader } from "../config/env.validation";

/**
 * HttpOnly cookie transport for auth tokens.
 *
 * Browsers authenticate via these cookies (set by login/register/verify-email/
 * refresh) instead of localStorage, which removes the dominant XSS token-theft
 * vector. The refresh cookie is path-scoped to /v1/auth so it is only sent to
 * the endpoints that consume it. Non-browser clients can still use the token
 * bodies returned in responses.
 */
export const ACCESS_COOKIE = "hushd_access";
export const REFRESH_COOKIE = "hushd_refresh";
export const REFRESH_COOKIE_PATH = "/v1/auth";

const DEFAULT_ACCESS_TTL_SECONDS = 900;
const DEFAULT_REFRESH_TTL_SECONDS = 30 * 86400;

type SameSite = "lax" | "strict" | "none";

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

/** Minimal Cookie header parser — avoids a cookie-parser dependency for the two keys we read. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

export function parseTtlSeconds(ttl: string | undefined, fallback: number): number {
  if (!ttl) return fallback;
  const m = /^(\d+)(s|m|h|d)$/.exec(ttl.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const mult = m[2] === "s" ? 1 : m[2] === "m" ? 60 : m[2] === "h" ? 3600 : 86400;
  return n * mult;
}

function resolveSameSite(config: EnvReader): SameSite {
  const raw = (config.get("COOKIE_SAMESITE") ?? "lax").trim().toLowerCase();
  return raw === "strict" || raw === "none" ? raw : "lax";
}

function resolveSecure(config: EnvReader): boolean {
  const override = config.get("COOKIE_SECURE")?.trim().toLowerCase();
  if (override === "true") return true;
  if (override === "false") return false;
  return config.get("NODE_ENV") === "production";
}

function baseOptions(config: EnvReader): CookieOptions {
  const sameSite = resolveSameSite(config);
  return {
    httpOnly: true,
    // Browsers reject SameSite=None without Secure; env validation enforces
    // the pairing at startup, this is the runtime backstop.
    secure: resolveSecure(config) || sameSite === "none",
    sameSite,
  };
}

export function setAuthCookies(res: Response, tokens: IssuedTokens, config: EnvReader): void {
  const base = baseOptions(config);
  const accessMaxAge = tokens.expiresIn > 0 ? tokens.expiresIn * 1000 : DEFAULT_ACCESS_TTL_SECONDS * 1000;
  const refreshMaxAge =
    parseTtlSeconds(config.get("JWT_REFRESH_TTL"), DEFAULT_REFRESH_TTL_SECONDS) * 1000;
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, path: "/", maxAge: accessMaxAge });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshMaxAge,
  });
}

export function clearAuthCookies(res: Response, config: EnvReader): void {
  const base = baseOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
}
