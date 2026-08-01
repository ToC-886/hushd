import { API_BASE_URL } from "./config";

/**
 * Thin fetch wrapper around the hushd API.
 *
 * Authentication rides on HttpOnly cookies set by the API at login — tokens
 * are never persisted in web storage, so an XSS payload cannot exfiltrate a
 * session. Every request sends `credentials: "include"` and the
 * `X-Requested-With` header the API requires for cookie-authenticated
 * mutations (CSRF backstop).
 *
 * On a single 401, attempts exactly one cookie-based refresh, then retries.
 */

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

type ErrorBody = {
  statusCode?: number;
  message?: string | string[];
  error?: string;
};

async function parseError(res: Response): Promise<ApiError> {
  let body: ErrorBody = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // non-JSON error body — fall through to generic
  }
  const raw = body.message;
  const message = Array.isArray(raw) ? raw.join(", ") : raw ?? body.error ?? res.statusText;
  return new ApiError(res.status, body.error ?? message, message);
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Requested-With", "XMLHttpRequest");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    throw await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Cookie-based refresh: the refresh token travels in its HttpOnly cookie. */
async function tryRefresh(): Promise<boolean> {
  try {
    await rawRequest<AuthTokens>("/auth/refresh", { method: "POST" });
    return true;
  } catch {
    return false;
  }
}

export type ApiRequestInit = Omit<RequestInit, "body"> & {
  body?: unknown;
  /** Skip the auto-refresh retry (used by auth endpoints themselves). */
  skipAuthRetry?: boolean;
};

export async function api<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { body, skipAuthRetry, ...rest } = init;
  const serialized = body !== undefined ? JSON.stringify(body) : undefined;

  try {
    return await rawRequest<T>(path, { ...rest, body: serialized });
  } catch (err) {
    const isAuth = err instanceof ApiError && err.status === 401;
    if (!isAuth || skipAuthRetry) {
      throw err;
    }
  }

  const refreshed = await tryRefresh();
  if (!refreshed) {
    throw new ApiError(401, "session_expired", "Your session has expired. Please sign in again.");
  }
  return rawRequest<T>(path, { ...rest, body: serialized });
}

export const get = <T>(path: string, init?: ApiRequestInit) => api<T>(path, { ...init, method: "GET" });
export const post = <T>(path: string, body?: unknown, init?: ApiRequestInit) =>
  api<T>(path, { ...init, method: "POST", body });
export const patch = <T>(path: string, body?: unknown, init?: ApiRequestInit) =>
  api<T>(path, { ...init, method: "PATCH", body });
export const del = <T>(path: string, init?: ApiRequestInit) => api<T>(path, { ...init, method: "DELETE" });
