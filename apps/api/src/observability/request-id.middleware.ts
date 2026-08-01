import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export const REQUEST_ID_HEADER = "x-request-id";

/** Request augmented with a correlation id by requestIdMiddleware. */
export type RequestWithId = Request & { requestId?: string };

const MAX_INBOUND_ID_LENGTH = 128;
// Allow common correlation-id shapes (UUIDs, hex, base64url-ish); reject
// anything that could smuggle control chars into logs/headers.
const SAFE_ID = /^[A-Za-z0-9._~-]+$/;

/**
 * Propagates an inbound `x-request-id` when it's safe, otherwise mints a new
 * UUID. The id is attached to the request, echoed back on the response header,
 * and surfaced to Sentry + error logs by the exception filter so a single
 * request can be traced across logs and error reports.
 */
export function requestIdMiddleware(req: RequestWithId, res: Response, next: NextFunction): void {
  const inbound = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
  const id =
    candidate && candidate.length <= MAX_INBOUND_ID_LENGTH && SAFE_ID.test(candidate)
      ? candidate
      : randomUUID();

  req.requestId = id;
  res.setHeader(REQUEST_ID_HEADER, id);
  next();
}
