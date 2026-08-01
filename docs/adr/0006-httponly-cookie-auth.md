# ADR 0006: HttpOnly cookie auth for browser clients

- Status: Accepted
- Date: 2026-08-01

## Context

The web and admin frontends stored the access and refresh JWTs in
`localStorage` and attached them via `Authorization: Bearer` headers. Any XSS
payload — in first-party code, a dependency, or a browser extension — could
read and exfiltrate both tokens, and a stolen 30-day refresh token is a
full account takeover. This was the highest-severity residual risk in the
security audit (gap register G-005).

## Decision

Browser sessions are transported in HttpOnly cookies instead of web storage:

- The API sets two cookies on register/login/verify-email/refresh:
  - `hushd_access` — `Path=/`, max-age from the access TTL (15m default).
  - `hushd_refresh` — `Path=/v1/auth`, max-age from the refresh TTL (30d
    default), so the refresh token is only ever sent to the endpoints that
    consume it.
- Both cookies are `HttpOnly`, `SameSite=Lax` by default, and `Secure` in
  production (`COOKIE_SECURE` / `COOKIE_SAMESITE` env overrides;
  `SameSite=None` forces `Secure` and is rejected by startup validation
  otherwise).
- `JwtAuthGuard` accepts `Authorization: Bearer` first and falls back to the
  access cookie. Token bodies remain in JSON responses for non-browser
  clients (tests, CLI, future mobile apps); the browser clients ignore them.
- CSRF: `SameSite=Lax` blocks cross-site posts from carrying the cookies. As
  a backstop, a global middleware (`csrf.middleware.ts`) requires the custom
  header `X-Requested-With: XMLHttpRequest` on any mutating request that is
  authenticated purely by cookie. Cross-origin pages cannot set custom
  headers without passing a CORS preflight, and the CORS allowlist (now
  `credentials: true`) only contains the known frontends.
- Logout is idempotent: it revokes the session best-effort and always clears
  both cookies.
- The frontend fetch wrappers send `credentials: "include"` and perform one
  cookie-based refresh-and-retry on a 401. No token is ever written to
  `localStorage`.

## Consequences

- XSS can no longer exfiltrate tokens from web storage; the remaining XSS
  surface is riding same-origin requests while the payload runs (inherent to
  any session mechanism).
- Cross-origin frontend deployments must keep the API on the same site
  (e.g. `api.hushd.com` next to `app.hushd.com`) or set
  `COOKIE_SAMESITE=none` + `COOKIE_SECURE=true`.
- `Authorization` header auth continues to work, so existing scripts, tests,
  and non-browser clients are unaffected.
- Refresh-token rotation and reuse detection (already implemented at the
  session layer) are unchanged.
