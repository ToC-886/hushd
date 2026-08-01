import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException, HttpException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { GeoBlockGuard } from "./geo-block.guard";
import type { PrismaService } from "../prisma/prisma.service";

function makeContext(path: string, country?: string, edgeSecret?: string): ExecutionContext {
  const headers: Record<string, string> = {};
  if (country) headers["cf-ipcountry"] = country;
  if (edgeSecret) headers["x-geo-edge-secret"] = edgeSecret;
  return {
    switchToHttp: () => ({
      getRequest: () => ({ path, headers }),
    }),
  } as unknown as ExecutionContext;
}

type HarnessOptions = {
  edgeSecret?: string;
  nodeEnv?: string;
};

function makeHarness(blocked: string[], opts: HarnessOptions = {}) {
  const prisma = {
    geoBlock: {
      findMany: jest.fn().mockResolvedValue(blocked.map((countryCode) => ({ countryCode }))),
    },
  } as unknown as PrismaService;
  const config = {
    get: jest.fn((key: string) => {
      if (key === "GEO_EDGE_SHARED_SECRET") return opts.edgeSecret;
      if (key === "NODE_ENV") return opts.nodeEnv;
      return undefined;
    }),
  } as unknown as ConfigService;
  return { guard: new GeoBlockGuard(prisma, config), prisma };
}

describe("GeoBlockGuard", () => {
  it("rejects requests from blocked countries with 451", async () => {
    const { guard } = makeHarness(["IR"]);
    await expect(guard.canActivate(makeContext("/v1/feed", "IR"))).rejects.toMatchObject({
      status: 451,
    } as Partial<HttpException>);
  });

  it("is case-insensitive on the country header", async () => {
    const { guard } = makeHarness(["ir"]);
    await expect(guard.canActivate(makeContext("/v1/feed", "Ir"))).rejects.toBeInstanceOf(HttpException);
  });

  it("allows requests from non-blocked countries", async () => {
    const { guard } = makeHarness(["IR"]);
    await expect(guard.canActivate(makeContext("/v1/feed", "DE"))).resolves.toBe(true);
  });

  it("allows requests without a country header", async () => {
    const { guard } = makeHarness(["IR"]);
    await expect(guard.canActivate(makeContext("/v1/feed"))).resolves.toBe(true);
  });

  it("ignores the XX unknown marker", async () => {
    const { guard } = makeHarness(["XX"]);
    await expect(guard.canActivate(makeContext("/v1/feed", "XX"))).resolves.toBe(true);
  });

  it("never blocks ops probes", async () => {
    const { guard } = makeHarness(["IR"]);
    await expect(guard.canActivate(makeContext("/health", "IR"))).resolves.toBe(true);
    await expect(guard.canActivate(makeContext("/metrics", "IR"))).resolves.toBe(true);
  });

  it("only loads ACCESS-scoped blocks into the cache", async () => {
    const { guard, prisma } = makeHarness([]);
    await guard.canActivate(makeContext("/v1/feed", "DE"));
    expect(prisma.geoBlock.findMany).toHaveBeenCalledWith({
      where: { active: true, scope: "ACCESS" },
      select: { countryCode: true },
    });
  });

  it("rejects requests without a valid edge secret in production", async () => {
    const { guard } = makeHarness(["IR"], { edgeSecret: "s3cret", nodeEnv: "production" });
    await expect(guard.canActivate(makeContext("/v1/feed", "DE"))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      guard.canActivate(makeContext("/v1/feed", "DE", "wrong")),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("enforces geo blocks when the edge secret is valid", async () => {
    const { guard } = makeHarness(["IR"], { edgeSecret: "s3cret", nodeEnv: "production" });
    await expect(
      guard.canActivate(makeContext("/v1/feed", "IR", "s3cret")),
    ).rejects.toMatchObject({ status: 451 } as Partial<HttpException>);
    await expect(guard.canActivate(makeContext("/v1/feed", "DE", "s3cret"))).resolves.toBe(true);
  });

  it("treats the country header as untrusted outside production when the secret is wrong", async () => {
    const { guard } = makeHarness(["IR"], { edgeSecret: "s3cret", nodeEnv: "development" });
    await expect(guard.canActivate(makeContext("/v1/feed", "IR"))).resolves.toBe(true);
  });

  it("disables enforcement in production when no edge secret is configured", async () => {
    // A spoofable header must not create false compliance assurance: with no
    // shared secret the guard fails open (startup validation warns loudly).
    const { guard, prisma } = makeHarness(["IR"], { nodeEnv: "production" });
    await expect(guard.canActivate(makeContext("/v1/feed", "IR"))).resolves.toBe(true);
    expect(prisma.geoBlock.findMany).not.toHaveBeenCalled();
  });

  it("still enforces blocks without a secret outside production (local testing)", async () => {
    const { guard } = makeHarness(["IR"], { nodeEnv: "development" });
    await expect(guard.canActivate(makeContext("/v1/feed", "IR"))).rejects.toMatchObject({
      status: 451,
    } as Partial<HttpException>);
  });
});
