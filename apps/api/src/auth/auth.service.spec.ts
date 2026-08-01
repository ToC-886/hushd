import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash } from "node:crypto";
import { authenticator } from "otplib";
import { AuthService } from "./auth.service";
import { sealSecret } from "./secret-crypto";
import type { MailerService } from "../mailer/mailer.service";
import type { PrismaService } from "../prisma/prisma.service";

const ENCRYPTION_KEY = "test-encryption-key";
// Low cost keeps the suite fast; compare() is cost-agnostic.
const PASSWORD = "correct horse battery";
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

type HarnessOptions = {
  autoActivate?: boolean;
  user?: Record<string, unknown> | null;
  totpSecret?: string | null;
};

function makeHarness(opts: HarnessOptions = {}) {
  const user =
    opts.user === undefined
      ? {
          id: "user_1",
          email: "fan@example.com",
          roles: ["FAN"],
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
          passwordHash: PASSWORD_HASH,
        }
      : opts.user;
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      create: jest.fn().mockImplementation(({ data }) => ({ id: "user_new", ...data })),
      update: jest.fn().mockImplementation(({ data }) => ({ ...user, ...data })),
    },
    creatorProfile: { findUnique: jest.fn().mockResolvedValue(null) },
    totpSecret: {
      findUnique: jest.fn().mockResolvedValue(
        opts.totpSecret
          ? { userId: "user_1", secretEnc: sealSecret(opts.totpSecret, ENCRYPTION_KEY), enabledAt: new Date() }
          : null,
      ),
    },
    emailToken: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: "etok_1" }),
      findFirst: jest.fn(),
    },
    session: {
      create: jest.fn().mockResolvedValue({ id: "sess_1" }),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn().mockResolvedValue([]),
  } as unknown as PrismaService & { emailToken: { findFirst: jest.Mock; updateMany: jest.Mock } };

  const jwt = {
    signAsync: jest.fn().mockResolvedValue("signed-token"),
    verifyAsync: jest.fn(),
  } as unknown as JwtService;

  const config = {
    get: jest.fn((key: string) => {
      if (key === "AUTH_AUTO_ACTIVATE") return opts.autoActivate === false ? "false" : "true";
      return undefined;
    }),
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        JWT_ACCESS_SECRET: "access-secret",
        JWT_REFRESH_SECRET: "refresh-secret",
        ENCRYPTION_KEY,
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  const mailer = {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailerService;

  return { service: new AuthService(prisma, jwt, config, mailer), prisma, mailer };
}

describe("AuthService.register", () => {
  it("auto-activates and issues tokens when the dev bypass is on", async () => {
    const { service, mailer } = makeHarness({ user: null });
    const result = await service.register({ email: "new@example.com", password: PASSWORD });
    expect(result).toMatchObject({ accessToken: "signed-token" });
    expect(mailer.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("creates a PENDING account with a verification email and no tokens when auto-activate is off", async () => {
    const { service, prisma, mailer } = makeHarness({ autoActivate: false, user: null });
    const result = await service.register({ email: "new@example.com", password: PASSWORD });
    expect(result).toMatchObject({ pendingVerification: true });
    expect(result).not.toHaveProperty("accessToken");
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "PENDING", emailVerifiedAt: null }),
    });
    expect(prisma.emailToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: "VERIFY_EMAIL" }),
    });
    // The raw token lives only in the email; the DB stores its SHA-256 hash.
    const storedHash = (prisma.emailToken.create as jest.Mock).mock.calls[0][0].data.tokenHash as string;
    const sentUrl = (mailer.sendVerificationEmail as jest.Mock).mock.calls[0][1] as string;
    const rawToken = sentUrl.split("token=")[1];
    expect(sentUrl).toContain("/verify-email?token=");
    expect(storedHash).toBe(createHash("sha256").update(rawToken).digest("hex"));
  });
});

describe("AuthService.login", () => {
  it("rejects PENDING accounts that never verified their email", async () => {
    const { service } = makeHarness({
      user: {
        id: "user_1",
        email: "fan@example.com",
        roles: ["FAN"],
        status: "PENDING",
        emailVerifiedAt: null,
        passwordHash: PASSWORD_HASH,
      },
    });
    await expect(service.login({ email: "fan@example.com", password: PASSWORD }, {})).rejects.toMatchObject({
      message: "email_not_verified",
    });
  });

  it("requires a TOTP code when the account has TOTP enabled", async () => {
    const secret = authenticator.generateSecret();
    const { service } = makeHarness({ totpSecret: secret });
    await expect(service.login({ email: "fan@example.com", password: PASSWORD }, {})).rejects.toMatchObject({
      message: "totp_required",
    });
  });

  it("rejects a wrong TOTP code", async () => {
    const secret = authenticator.generateSecret();
    const { service } = makeHarness({ totpSecret: secret });
    const valid = authenticator.generate(secret);
    const wrong = valid === "000000" ? "111111" : "000000";
    await expect(
      service.login({ email: "fan@example.com", password: PASSWORD, totpCode: wrong }, {}),
    ).rejects.toMatchObject({ message: "invalid_totp" });
  });

  it("issues tokens with a valid TOTP code", async () => {
    const secret = authenticator.generateSecret();
    const { service } = makeHarness({ totpSecret: secret });
    const result = await service.login(
      { email: "fan@example.com", password: PASSWORD, totpCode: authenticator.generate(secret) },
      {},
    );
    expect(result).toMatchObject({ accessToken: "signed-token", refreshToken: "signed-token" });
  });

  it("does not disclose TOTP configuration to callers without the password", async () => {
    const secret = authenticator.generateSecret();
    const { service } = makeHarness({ totpSecret: secret });
    await expect(service.login({ email: "fan@example.com", password: "wrong password" }, {})).rejects.toMatchObject(
      { message: "invalid_credentials" },
    );
  });
});

describe("AuthService.verifyEmail", () => {
  const tokenRow = {
    id: "etok_1",
    userId: "user_1",
    purpose: "VERIFY_EMAIL",
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
  };

  it("activates the account, marks the email verified, and issues tokens", async () => {
    const { service, prisma } = makeHarness();
    prisma.emailToken.findFirst.mockResolvedValue(tokenRow);
    const result = await service.verifyEmail("a".repeat(64), {});
    expect(result).toMatchObject({ accessToken: "signed-token" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: expect.objectContaining({ status: "ACTIVE", emailVerifiedAt: expect.any(Date) }),
    });
    expect(prisma.emailToken.updateMany).toHaveBeenCalledWith({
      where: { id: "etok_1", consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it("rejects expired or unknown tokens", async () => {
    const { service, prisma } = makeHarness();
    prisma.emailToken.findFirst.mockResolvedValue(null);
    await expect(service.verifyEmail("x".repeat(64), {})).rejects.toBeInstanceOf(BadRequestException);

    prisma.emailToken.findFirst.mockResolvedValue({ ...tokenRow, expiresAt: new Date(Date.now() - 1000) });
    await expect(service.verifyEmail("x".repeat(64), {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects when the token was already consumed (race-safe)", async () => {
    const { service, prisma } = makeHarness();
    prisma.emailToken.findFirst.mockResolvedValue(tokenRow);
    prisma.emailToken.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.verifyEmail("x".repeat(64), {})).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AuthService password reset", () => {
  it("does not reveal whether the email exists", async () => {
    const { service, prisma, mailer } = makeHarness({ user: null });
    await expect(service.requestPasswordReset("ghost@example.com")).resolves.toEqual({ ok: true });
    expect(prisma.emailToken.create).not.toHaveBeenCalled();
    expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("creates a reset token and emails the link for real accounts", async () => {
    const { service, prisma, mailer } = makeHarness({
      user: { id: "user_1", email: "fan@example.com", passwordHash: PASSWORD_HASH },
    });
    await service.requestPasswordReset("fan@example.com");
    expect(prisma.emailToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ purpose: "PASSWORD_RESET" }),
    });
    const sentUrl = (mailer.sendPasswordResetEmail as jest.Mock).mock.calls[0][1] as string;
    expect(sentUrl).toContain("/reset-password?token=");
  });

  it("updates the password and revokes all sessions on confirm", async () => {
    const { service, prisma } = makeHarness();
    prisma.emailToken.findFirst.mockResolvedValue({
      id: "etok_1",
      userId: "user_1",
      purpose: "PASSWORD_RESET",
      expiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
    });
    await expect(service.confirmPasswordReset("t".repeat(64), "new password 123")).resolves.toEqual({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });
});
