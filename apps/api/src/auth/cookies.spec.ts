import type { CookieOptions, Response } from "express";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  clearAuthCookies,
  parseCookies,
  parseTtlSeconds,
  setAuthCookies,
} from "./cookies";
import type { EnvReader } from "../config/env.validation";

function makeConfig(env: Record<string, string>): EnvReader {
  return { get: (key: string) => env[key] };
}

function makeRes() {
  const cookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const cleared: Array<{ name: string; options: CookieOptions }> = [];
  const res = {
    cookie: (name: string, value: string, options: CookieOptions) => {
      cookies.push({ name, value, options });
      return res;
    },
    clearCookie: (name: string, options: CookieOptions) => {
      cleared.push({ name, options });
      return res;
    },
  } as unknown as Response;
  return { res, cookies, cleared };
}

const TOKENS = { accessToken: "access.jwt.token", refreshToken: "refresh.jwt.token", expiresIn: 900 };

describe("parseCookies", () => {
  it("parses a cookie header into a map", () => {
    expect(parseCookies("a=1; hushd_access=tok%20x; b=2")).toEqual({
      a: "1",
      hushd_access: "tok x",
      b: "2",
    });
  });

  it("returns an empty map for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });

  it("ignores malformed segments", () => {
    expect(parseCookies(";=;ok=1")).toEqual({ ok: "1" });
  });
});

describe("parseTtlSeconds", () => {
  it("parses s/m/h/d suffixes", () => {
    expect(parseTtlSeconds("15m", 0)).toBe(900);
    expect(parseTtlSeconds("30d", 0)).toBe(30 * 86400);
    expect(parseTtlSeconds("2h", 0)).toBe(7200);
    expect(parseTtlSeconds("45s", 0)).toBe(45);
  });

  it("falls back on missing or malformed input", () => {
    expect(parseTtlSeconds(undefined, 7)).toBe(7);
    expect(parseTtlSeconds("soon", 7)).toBe(7);
  });
});

describe("setAuthCookies", () => {
  it("sets HttpOnly access and refresh cookies with scoped paths", () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, TOKENS, makeConfig({ NODE_ENV: "production" }));

    const access = cookies.find((c) => c.name === ACCESS_COOKIE);
    const refresh = cookies.find((c) => c.name === REFRESH_COOKIE);
    expect(access?.value).toBe(TOKENS.accessToken);
    expect(access?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 900_000,
    });
    expect(refresh?.options).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: REFRESH_COOKIE_PATH,
    });
  });

  it("is not Secure outside production unless overridden", () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, TOKENS, makeConfig({ NODE_ENV: "development" }));
    expect(cookies.every((c) => c.options.secure === false)).toBe(true);
  });

  it("honours COOKIE_SECURE and COOKIE_SAMESITE overrides", () => {
    const { res, cookies } = makeRes();
    setAuthCookies(
      res,
      TOKENS,
      makeConfig({ NODE_ENV: "development", COOKIE_SECURE: "true", COOKIE_SAMESITE: "strict" }),
    );
    expect(cookies.every((c) => c.options.secure === true && c.options.sameSite === "strict")).toBe(true);
  });

  it("forces Secure when SameSite=None (browser requirement)", () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, TOKENS, makeConfig({ NODE_ENV: "development", COOKIE_SAMESITE: "none" }));
    expect(cookies.every((c) => c.options.secure === true && c.options.sameSite === "none")).toBe(true);
  });

  it("derives the refresh maxAge from JWT_REFRESH_TTL", () => {
    const { res, cookies } = makeRes();
    setAuthCookies(res, TOKENS, makeConfig({ NODE_ENV: "development", JWT_REFRESH_TTL: "7d" }));
    const refresh = cookies.find((c) => c.name === REFRESH_COOKIE);
    expect(refresh?.options.maxAge).toBe(7 * 86400 * 1000);
  });
});

describe("clearAuthCookies", () => {
  it("clears both cookies with the same paths used to set them", () => {
    const { res, cleared } = makeRes();
    clearAuthCookies(res, makeConfig({ NODE_ENV: "production" }));
    expect(cleared).toHaveLength(2);
    expect(cleared.find((c) => c.name === ACCESS_COOKIE)?.options.path).toBe("/");
    expect(cleared.find((c) => c.name === REFRESH_COOKIE)?.options.path).toBe(REFRESH_COOKIE_PATH);
  });
});
