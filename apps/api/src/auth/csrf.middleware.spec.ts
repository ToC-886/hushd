import type { NextFunction, Request, Response } from "express";
import { csrfHeaderMiddleware } from "./csrf.middleware";

function makeReq(overrides: { method?: string; headers?: Record<string, string> }): Request {
  return { method: overrides.method ?? "POST", headers: overrides.headers ?? {} } as unknown as Request;
}

function makeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown };
}

describe("csrfHeaderMiddleware", () => {
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    next = jest.fn();
  });

  it("passes safe methods through untouched", () => {
    const res = makeRes();
    csrfHeaderMiddleware(makeReq({ method: "GET", headers: { cookie: "hushd_access=x" } }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("passes requests authenticated by Authorization header", () => {
    const res = makeRes();
    csrfHeaderMiddleware(makeReq({ headers: { authorization: "Bearer x", cookie: "hushd_access=x" } }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("passes requests without auth cookies (webhooks, public endpoints)", () => {
    const res = makeRes();
    csrfHeaderMiddleware(makeReq({ headers: {} }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects cookie-authenticated mutations without the custom header", () => {
    const res = makeRes();
    csrfHeaderMiddleware(makeReq({ headers: { cookie: "hushd_access=x" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({ message: "csrf_header_missing" });
  });

  it("also guards the refresh cookie", () => {
    const res = makeRes();
    csrfHeaderMiddleware(makeReq({ headers: { cookie: "hushd_refresh=x" } }), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });

  it("passes cookie-authenticated mutations carrying the custom header", () => {
    const res = makeRes();
    csrfHeaderMiddleware(
      makeReq({ headers: { cookie: "hushd_access=x", "x-requested-with": "XMLHttpRequest" } }),
      res,
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
