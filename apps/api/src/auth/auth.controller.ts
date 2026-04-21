import { Body, Controller, Get, HttpCode, Ip, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { CurrentUser, type RequestUser } from "./current-user.decorator";
import { LoginDto } from "./dto/login.dto";
import { RefreshDto } from "./dto/refresh.dto";
import { RegisterDto } from "./dto/register.dto";
import { TotpEnableDto } from "./dto/totp-enable.dto";
import { Public } from "./public.decorator";

@Controller("auth")
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("register")
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.login(dto, { userAgent: req.headers["user-agent"], ip });
  }

  @Public()
  @Post("refresh")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto, @Req() req: Request, @Ip() ip: string) {
    return this.auth.refresh(dto.refreshToken, { userAgent: req.headers["user-agent"], ip });
  }

  @Public()
  @Post("logout")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  logout(@Body() dto: RefreshDto) {
    return this.auth.logout(dto.refreshToken);
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
