import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard";

type HeaderMap = Record<string, string>;

function makeContext(headers: HeaderMap): { ctx: ExecutionContext; req: { headers: HeaderMap; user?: unknown } } {
  const req: { headers: HeaderMap; user?: unknown } = { headers };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

const PAYLOAD = { sub: "user-1", email: "u@example.com", roles: ["FAN"], typ: "access" };

function makeGuard(verifyImpl?: () => unknown) {
  const jwt = { verify: jest.fn(verifyImpl ?? (() => PAYLOAD)) };
  const reflector = { getAllAndOverride: jest.fn(() => false) };
  const config = { getOrThrow: jest.fn(() => "test-secret") };
  const guard = new JwtAuthGuard(jwt as never, reflector as never, config as never);
  return { guard, jwt };
}

describe("JwtAuthGuard", () => {
  it("authenticates via the Authorization header", () => {
    const { guard } = makeGuard();
    const { ctx, req } = makeContext({ authorization: "Bearer header-token" });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(req.user).toEqual({ id: "user-1", email: "u@example.com", roles: ["FAN"] });
  });

  it("authenticates via the HttpOnly access cookie when no header is present", () => {
    const { guard, jwt } = makeGuard();
    const { ctx, req } = makeContext({ cookie: "other=1; hushd_access=cookie-token" });
    expect(guard.canActivate(ctx)).toBe(true);
    expect(jwt.verify).toHaveBeenCalledWith("cookie-token", { secret: "test-secret" });
    expect(req.user).toMatchObject({ id: "user-1" });
  });

  it("prefers the header over the cookie when both are present", () => {
    const { guard, jwt } = makeGuard();
    const { ctx } = makeContext({ authorization: "Bearer header-token", cookie: "hushd_access=cookie-token" });
    guard.canActivate(ctx);
    expect(jwt.verify).toHaveBeenCalledWith("header-token", expect.anything());
  });

  it("rejects when neither header nor cookie carries a token", () => {
    const { guard } = makeGuard();
    const { ctx } = makeContext({});
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects non-access token types", () => {
    const { guard } = makeGuard(() => ({ ...PAYLOAD, typ: "refresh" }));
    const { ctx } = makeContext({ authorization: "Bearer x" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("rejects when verification fails", () => {
    const { guard } = makeGuard(() => {
      throw new Error("bad signature");
    });
    const { ctx } = makeContext({ cookie: "hushd_access=x" });
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it("skips authentication for @Public routes", () => {
    const jwt = { verify: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn(() => true) };
    const config = { getOrThrow: jest.fn(() => "test-secret") };
    const guard = new JwtAuthGuard(jwt as never, reflector as never, config as never);
    const { ctx } = makeContext({});
    expect(guard.canActivate(ctx)).toBe(true);
    expect(jwt.verify).not.toHaveBeenCalled();
  });
});
