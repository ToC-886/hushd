import type { NextFunction, Request, Response } from "express";
import { ACCESS_COOKIE, REFRESH_COOKIE, parseCookies } from "./cookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
export const CSRF_HEADER = "x-requested-with";
export const CSRF_HEADER_VALUE = "XMLHttpRequest";

/**
 * CSRF backstop for cookie-authenticated requests.
 *
 * SameSite=Lax already prevents cross-site posts from carrying the auth
 * cookies; this middleware adds defense in depth for the case where a request
 * is authenticated purely by cookie (no Authorization header): it must carry a
 * custom header. Cross-origin pages cannot set custom headers without passing
 * a CORS preflight, and the CORS origin allowlist does not include them.
 *
 * Requests with a Bearer header (API clients, tests) and requests without auth
 * cookies (webhooks, public endpoints) are unaffected.
 */
export function csrfHeaderMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }
  if (req.headers.authorization) {
    next();
    return;
  }
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies[ACCESS_COOKIE] && !cookies[REFRESH_COOKIE]) {
    next();
    return;
  }
  if (req.headers[CSRF_HEADER] === CSRF_HEADER_VALUE) {
    next();
    return;
  }
  res.status(403).json({ statusCode: 403, message: "csrf_header_missing", error: "Forbidden" });
}
