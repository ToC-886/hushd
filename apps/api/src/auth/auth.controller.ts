import { Body, Controller, Get, HttpCode, Ip, Post, Req, Res, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser, type RequestUser } from "./current-user.decorator";
import { REFRESH_COOKIE, clearAuthCookies, parseCookies, setAuthCookies } from "./cookies";
import { EmailAddressDto } from "./dto/email-address.dto";
import { LoginDto } from "./dto/login.dto";
import { PasswordResetConfirmDto } from "./dto/password-reset-confirm.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { TotpEnableDto } from "./dto/totp-enable.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { Public } from "./public.decorator";

/**
 * Session endpoints set HttpOnly cookies in addition to returning the token
 * bodies. Browsers rely on the cookies (never persisting tokens in
 * localStorage); non-browser clients keep using the response bodies.
 */
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.register(dto);
    if ("accessToken" in result) {
      setAuthCookies(res, result, this.config);
    }
    return result;
  }

  @Public()
  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.login(dto, { userAgent: req.headers["user-agent"], ip });
    setAuthCookies(res, tokens, this.config);
    return tokens;
  }

  @Public()
  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.refreshToken ?? parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    if (!token) {
      throw new UnauthorizedException("invalid_refresh");
    }
    const tokens = await this.auth.refresh(token, { userAgent: req.headers["user-agent"], ip });
    setAuthCookies(res, tokens, this.config);
    return tokens;
  }

  /**
   * Idempotent: always clears the auth cookies and reports success, even when
   * the presented refresh token is already invalid — the client's goal (no
   * session) is achieved either way.
   */
  @Public()
  @Post("logout")
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = dto.refreshToken ?? parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    try {
      if (token) {
        await this.auth.logout(token);
      }
    } catch {
      // best-effort revocation — cookies are cleared regardless
    }
    clearAuthCookies(res, this.config);
    return { ok: true as const };
  }

  @Public()
  @Post("verify-email")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() req: Request,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.auth.verifyEmail(dto.token, { userAgent: req.headers["user-agent"], ip });
    setAuthCookies(res, tokens, this.config);
    return tokens;
  }

  @Public()
  @Post("verify-email/resend")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resendVerification(@Body() dto: EmailAddressDto) {
    return this.auth.resendVerification(dto.email);
  }

  @Public()
  @Post("password-reset/request")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestPasswordReset(@Body() dto: EmailAddressDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Public()
  @Post("password-reset/confirm")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirmPasswordReset(@Body() dto: PasswordResetConfirmDto) {
    return this.auth.confirmPasswordReset(dto.token, dto.password);
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser) {
    return this.auth.me(user);
  }

  @Post("totp/setup")
  setupTotp(@CurrentUser() user: RequestUser) {
    return this.auth.setupTotp(user);
  }

  @Post("totp/enable")
  enableTotp(@CurrentUser() user: RequestUser, @Body() dto: TotpEnableDto) {
    return this.auth.enableTotp(user, dto.code);
  }
}
