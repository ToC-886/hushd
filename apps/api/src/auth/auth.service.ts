import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus, type User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { authenticator } from "otplib";
import type { RequestUser } from "./current-user.decorator";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { sealSecret, openSecret } from "./secret-crypto";
import { PrismaService } from "../prisma/prisma.service";

type RefreshPayload = {
  sub: string;
  sid: string;
  typ: "refresh";
};

type IssueMeta = { userAgent?: string; ip?: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
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

  private autoActivate(): boolean {
    return this.config.get<string>("AUTH_AUTO_ACTIVATE") !== "false";
  }

  async register(dto: RegisterDto) {
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
    const status = this.autoActivate() ? UserStatus.ACTIVE : UserStatus.PENDING;

    const baseSlug = this.slugify(email);
    const slug = await this.uniqueSlug(baseSlug);
    const referralCode = await this.uniqueReferralCode();

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        roles,
        status,
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

    return this.issueTokens(user, {});
  }

  async login(dto: LoginDto, meta: IssueMeta) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("invalid_credentials");
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("invalid_credentials");
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException("account_not_active");
    }
    return this.issueTokens(user, meta);
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
