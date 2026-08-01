import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { EmailTokenPurpose, UserRole, UserStatus, type User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { authenticator } from "otplib";
import type { RequestUser } from "./current-user.decorator";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { sealSecret, openSecret } from "./secret-crypto";
import { MailerService } from "../mailer/mailer.service";
import { PrismaService } from "../prisma/prisma.service";

type RefreshPayload = {
  sub: string;
  sid: string;
  typ: "refresh";
};

type IssueMeta = { userAgent?: string; ip?: string };

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: { id: string; email: string; roles: UserRole[] };
};

export type RegisterResult = AuthTokens | { pendingVerification: true; user: { id: string; email: string } };

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  private get refreshSecret(): string {
    return this.config.getOrThrow<string>("JWT_REFRESH_SECRET");
  }

  private get accessSecret(): string {
    return this.config.getOrThrow<string>("JWT_ACCESS_SECRET");
  }

  private get encryptionKey(): string {
    return this.config.getOrThrow<string>("ENCRYPTION_KEY");
  }

  /**
   * Dev/test bypass: with AUTH_AUTO_ACTIVATE=true (the default outside
   * production) accounts activate immediately without email verification.
   * Startup config validation refuses this combination in production.
   */
  private autoActivate(): boolean {
    return this.config.get<string>("AUTH_AUTO_ACTIVATE") !== "false";
  }

  private webUrl(): string {
    return (this.config.get<string>("APP_WEB_URL") ?? "http://localhost:3000").replace(/\/+$/, "");
  }

  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException("email_in_use");
    }

    const requested = dto.role ?? UserRole.FAN;
    if (requested === UserRole.ADMIN) {
      throw new BadRequestException("cannot_self_register_admin");
    }

    const roles: UserRole[] = requested === UserRole.CREATOR ? [UserRole.CREATOR, UserRole.FAN] : [UserRole.FAN];
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const autoActivate = this.autoActivate();
    const status = autoActivate ? UserStatus.ACTIVE : UserStatus.PENDING;

    const baseSlug = this.slugify(email);
    const slug = await this.uniqueSlug(baseSlug);
    const referralCode = await this.uniqueReferralCode();

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        roles,
        status,
        // The dev bypass counts as verified; production activation sets this
        // only after the email token round-trips.
        emailVerifiedAt: autoActivate ? new Date() : null,
        fanProfile: { create: {} },
        ...(requested === UserRole.CREATOR
          ? {
              creatorProfile: {
                create: {
                  slug,
                  referralCode,
                },
              },
            }
          : {}),
      },
    });

    if (autoActivate) {
      return this.issueTokens(user, {});
    }

    // Pending accounts get no tokens — a session for an unverified account
    // would be indistinguishable from a verified one at the JWT layer.
    const token = await this.createEmailToken(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_EMAIL_TTL_MS);
    await this.mailer.sendVerificationEmail(email, `${this.webUrl()}/verify-email?token=${token}`);
    return { pendingVerification: true, user: { id: user.id, email: user.email } };
  }

  async login(dto: LoginDto, meta: IssueMeta): Promise<AuthTokens> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("invalid_credentials");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("invalid_credentials");
    }
    // Second factor is verified before any account-status disclosure.
    await this.assertTotpIfEnabled(user.id, dto.totpCode);
    if (user.status !== UserStatus.ACTIVE) {
      if (user.status === UserStatus.PENDING && !user.emailVerifiedAt) {
        throw new ForbiddenException("email_not_verified");
      }
      throw new ForbiddenException("account_not_active");
    }
    return this.issueTokens(user, meta);
  }

  async verifyEmail(rawToken: string, meta: IssueMeta): Promise<AuthTokens> {
    const token = await this.consumeEmailToken(rawToken, EmailTokenPurpose.VERIFY_EMAIL);
    // PENDING accounts activate on verification; other statuses untouched.
    const user = await this.prisma.user.update({
      where: { id: token.userId },
      data: {
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
      },
    });
    return this.issueTokens(user, meta);
  }

  /** Always succeeds — the response must not reveal whether the email exists. */
  async resendVerification(emailRaw: string): Promise<{ ok: true }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return { ok: true };
    }
    const token = await this.createEmailToken(user.id, EmailTokenPurpose.VERIFY_EMAIL, VERIFY_EMAIL_TTL_MS);
    await this.mailer.sendVerificationEmail(email, `${this.webUrl()}/verify-email?token=${token}`);
    return { ok: true };
  }

  /** Always succeeds — the response must not reveal whether the email exists. */
  async requestPasswordReset(emailRaw: string): Promise<{ ok: true }> {
    const email = emailRaw.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      return { ok: true };
    }
    const token = await this.createEmailToken(user.id, EmailTokenPurpose.PASSWORD_RESET, PASSWORD_RESET_TTL_MS);
    await this.mailer.sendPasswordResetEmail(email, `${this.webUrl()}/reset-password?token=${token}`);
    return { ok: true };
  }

  async confirmPasswordReset(rawToken: string, newPassword: string): Promise<{ ok: true }> {
    const token = await this.consumeEmailToken(rawToken, EmailTokenPurpose.PASSWORD_RESET);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash },
    });
    // A reset proves mailbox access, not session legitimacy — kill everything.
    await this.revokeAllSessionsForUser(token.userId);
    return { ok: true };
  }

  async refresh(refreshToken: string, meta: IssueMeta) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("invalid_refresh");
    }
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("invalid_refresh");
    }

    const session = await this.prisma.session.findUnique({ where: { id: payload.sid } });
    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException("invalid_refresh");
    }
    if (session.revokedAt) {
      await this.revokeAllSessionsForUser(session.userId);
      throw new UnauthorizedException("refresh_reuse");
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
    return this.issueTokens(user, meta);
  }

  async logout(refreshToken: string) {
    let payload: RefreshPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshPayload>(refreshToken, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("invalid_refresh");
    }
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("invalid_refresh");
    }
    await this.prisma.session.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true as const };
  }

  async me(user: RequestUser) {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        roles: true,
        status: true,
        emailVerifiedAt: true,
        createdAt: true,
        totpSecret: { select: { enabledAt: true } },
        creatorProfile: { select: { slug: true } },
      },
    });
    if (!row) {
      throw new UnauthorizedException();
    }
    return {
      id: row.id,
      email: row.email,
      roles: row.roles,
      status: row.status,
      emailVerified: Boolean(row.emailVerifiedAt),
      createdAt: row.createdAt,
      creatorSlug: row.creatorProfile?.slug ?? null,
      totpEnabled: Boolean(row.totpSecret?.enabledAt),
    };
  }

  async setupTotp(user: RequestUser) {
    if (!user.roles.includes(UserRole.CREATOR)) {
      throw new ForbiddenException("creators_only");
    }
    const secret = authenticator.generateSecret();
    const sealed = sealSecret(secret, this.encryptionKey);
    await this.prisma.totpSecret.upsert({
      where: { userId: user.id },
      create: { userId: user.id, secretEnc: sealed },
      update: { secretEnc: sealed, enabledAt: null },
    });
    const otpauthUrl = authenticator.keyuri(user.email, "hushd", secret);
    return { otpauthUrl };
  }

  async enableTotp(user: RequestUser, code: string) {
    if (!user.roles.includes(UserRole.CREATOR)) {
      throw new ForbiddenException("creators_only");
    }
    const row = await this.prisma.totpSecret.findUnique({ where: { userId: user.id } });
    if (!row) {
      throw new BadRequestException("totp_not_setup");
    }
    if (row.enabledAt) {
      throw new BadRequestException("totp_already_enabled");
    }
    const secret = openSecret(row.secretEnc, this.encryptionKey);
    const ok = authenticator.verify({ token: code, secret });
    if (!ok) {
      throw new UnauthorizedException("invalid_totp");
    }
    await this.prisma.totpSecret.update({
      where: { userId: user.id },
      data: { enabledAt: new Date() },
    });
    return { ok: true as const };
  }

  /**
   * Enforces the second factor at login. A missing code and a wrong code get
   * distinct errors so the client can render the code prompt; both are 401
   * and neither reveals whether TOTP is configured to anyone without the
   * password.
   */
  private async assertTotpIfEnabled(userId: string, totpCode?: string) {
    const row = await this.prisma.totpSecret.findUnique({ where: { userId } });
    if (!row?.enabledAt) return;
    if (!totpCode) {
      throw new UnauthorizedException("totp_required");
    }
    const secret = openSecret(row.secretEnc, this.encryptionKey);
    const ok = authenticator.verify({ token: totpCode, secret });
    if (!ok) {
      throw new UnauthorizedException("invalid_totp");
    }
  }

  /**
   * Issues a single-use email token. Only the SHA-256 hash is stored; any
   * previous unconsumed tokens for the same purpose are invalidated so only
   * the latest link works.
   */
  private async createEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMs: number): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await this.prisma.$transaction([
      this.prisma.emailToken.updateMany({
        where: { userId, purpose, consumedAt: null },
        data: { consumedAt: new Date() },
      }),
      this.prisma.emailToken.create({
        data: { userId, purpose, tokenHash, expiresAt: new Date(Date.now() + ttlMs) },
      }),
    ]);
    return raw;
  }

  /**
   * Atomically marks a token consumed so concurrent uses of the same link
   * resolve exactly once (the update matches only unconsumed rows).
   */
  private async consumeEmailToken(rawToken: string, purpose: EmailTokenPurpose) {
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const token = await this.prisma.emailToken.findFirst({
      where: { tokenHash, purpose, consumedAt: null },
    });
    if (!token || token.expiresAt <= new Date()) {
      throw new BadRequestException("invalid_or_expired_token");
    }
    const consumed = await this.prisma.emailToken.updateMany({
      where: { id: token.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException("invalid_or_expired_token");
    }
    return token;
  }

  private async issueTokens(user: User, meta: IssueMeta) {
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: "jwt",
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    const roles = user.roles;
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, roles, typ: "access" },
      { secret: this.accessSecret, expiresIn: this.config.get<string>("JWT_ACCESS_TTL") ?? "15m" },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, sid: session.id, typ: "refresh" } satisfies RefreshPayload,
      { secret: this.refreshSecret, expiresIn: this.config.get<string>("JWT_REFRESH_TTL") ?? "30d" },
    );

    return {
      accessToken,
      refreshToken,
      tokenType: "Bearer" as const,
      expiresIn: this.parseExpirySeconds(this.config.get<string>("JWT_ACCESS_TTL") ?? "15m"),
      user: { id: user.id, email: user.email, roles },
    };
  }

  private parseExpirySeconds(ttl: string): number {
    const m = /^(\d+)(s|m|h|d)$/.exec(ttl.trim());
    if (!m) return 900;
    const n = Number(m[1]);
    const u = m[2];
    const mult = u === "s" ? 1 : u === "m" ? 60 : u === "h" ? 3600 : 86400;
    return n * mult;
  }

  private async revokeAllSessionsForUser(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private slugify(email: string) {
    const local = email
      .split("@")[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24);
    return local && local.length > 1 ? local : "creator";
  }

  private async uniqueSlug(base: string) {
    for (let i = 0; i < 12; i++) {
      const slug = `${base}-${randomBytes(3).toString("hex")}`;
      const exists = await this.prisma.creatorProfile.findUnique({ where: { slug } });
      if (!exists) return slug;
    }
    throw new ConflictException("slug_collision");
  }

  private async uniqueReferralCode() {
    for (let i = 0; i < 16; i++) {
      const code = randomBytes(5).toString("hex").toUpperCase();
      const exists = await this.prisma.creatorProfile.findUnique({ where: { referralCode: code } });
      if (!exists) return code;
    }
    throw new ConflictException("referral_collision");
  }
}
