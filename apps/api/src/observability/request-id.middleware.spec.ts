import type { NextFunction, Response } from "express";
import { REQUEST_ID_HEADER, requestIdMiddleware, type RequestWithId } from "./request-id.middleware";

function makeReq(header?: string | string[]): { req: RequestWithId; res: Response } {
  const req = {
    headers: header === undefined ? {} : { [REQUEST_ID_HEADER]: header },
  } as unknown as RequestWithId;
  const res = { setHeader: jest.fn() } as unknown as Response;
  return { req, res };
}

describe("requestIdMiddleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = jest.fn();
  });

  it("propagates a valid inbound request id", () => {
    const { req, res } = makeReq("req-abc-123");
    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe("req-abc-123");
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, "req-abc-123");
    expect(next).toHaveBeenCalled();
  });

  it("mints a UUID when no inbound id is present", () => {
    const { req, res } = makeReq();
    requestIdMiddleware(req, res, next);

    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, req.requestId);
  });

  it("rejects an inbound id with unsafe characters", () => {
    const { req, res } = makeReq("bad id\r\nwith\tspaces");
    requestIdMiddleware(req, res, next);

    expect(req.requestId).not.toContain("\r");
    expect(req.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("rejects an inbound id that is too long", () => {
    const tooLong = "a".repeat(200);
    const { req } = makeReq(tooLong);
    requestIdMiddleware(req, { setHeader: jest.fn() } as unknown as Response, next);

    expect(req.requestId).not.toBe(tooLong);
  });

  it("accepts an array header value by using the first entry", () => {
    const { req } = makeReq(["first-id", "second-id"]);
    requestIdMiddleware(req, { setHeader: jest.fn() } as unknown as Response, next);

    expect(req.requestId).toBe("first-id");
  });
});
