import { ForbiddenException } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import { VerificationPolicyGuard } from "./verification-policy.guard";
import type { PrismaService } from "../prisma/prisma.service";

function makeContext(user: { id: string; roles: string[] }): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(policy: string | undefined, prismaOverrides: Partial<Record<"age" | "id", object | null>> = {}) {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(policy) } as unknown as Reflector;
  const prisma = {
    ageVerification: { findFirst: jest.fn().mockResolvedValue(prismaOverrides.age ?? null) },
    idVerification: { findFirst: jest.fn().mockResolvedValue(prismaOverrides.id ?? null) },
  } as unknown as PrismaService;
  return { guard: new VerificationPolicyGuard(reflector, prisma), prisma };
}

describe("VerificationPolicyGuard", () => {
  const user = { id: "user_1", roles: ["CREATOR"] };

  it("allows requests when no policy is set", async () => {
    const { guard } = makeGuard(undefined);
    await expect(guard.canActivate(makeContext(user))).resolves.toBe(true);
  });

  it("passes the age policy with an approved unexpired verification", async () => {
    const { guard, prisma } = makeGuard("age", { age: { id: "age_1" } });
    await expect(guard.canActivate(makeContext(user))).resolves.toBe(true);
    expect(prisma.ageVerification.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: "user_1",
          status: "APPROVED",
          OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });

  it("rejects when no approved unexpired age verification exists", async () => {
    const { guard } = makeGuard("age", { age: null });
    await expect(guard.canActivate(makeContext(user))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("enforces id verification for the creator policy", async () => {
    const { guard } = makeGuard("creator", { age: { id: "age_1" }, id: null });
    await expect(guard.canActivate(makeContext(user))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("passes the creator policy with both verifications approved", async () => {
    const { guard } = makeGuard("creator", { age: { id: "age_1" }, id: { id: "idv_1" } });
    await expect(guard.canActivate(makeContext(user))).resolves.toBe(true);
  });
});
