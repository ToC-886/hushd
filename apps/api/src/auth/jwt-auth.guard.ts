import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "./constants";
import { ACCESS_COOKIE, parseCookies } from "./cookies";
import type { RequestUser } from "./current-user.decorator";

type AccessPayload = {
  sub: string;
  email: string;
  roles: string[];
  typ?: string;
};

/**
 * Authenticates via `Authorization: Bearer` header first, falling back to the
 * HttpOnly access cookie set at login. Header auth covers API clients and
 * tests; cookie auth covers the browser frontends.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | undefined>; user?: RequestUser }>();
    const token = this.extractToken(req.headers);
    if (!token) {
      throw new UnauthorizedException("missing_credentials");
    }
    try {
      const payload = this.jwt.verify<AccessPayload>(token, {
        secret: this.config.getOrThrow<string>("JWT_ACCESS_SECRET"),
      });
      if (payload.typ && payload.typ !== "access") {
        throw new UnauthorizedException("invalid_token_type");
      }
      req.user = { id: payload.sub, email: payload.email, roles: payload.roles ?? [] };
      return true;
    } catch {
      throw new UnauthorizedException("invalid_token");
    }
  }

  private extractToken(headers: Record<string, string | undefined>): string | null {
    const header = headers.authorization ?? headers.Authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      const token = header.slice("Bearer ".length).trim();
      if (token) return token;
    }
    const cookieToken = parseCookies(headers.cookie)[ACCESS_COOKIE];
    return cookieToken || null;
  }
}
