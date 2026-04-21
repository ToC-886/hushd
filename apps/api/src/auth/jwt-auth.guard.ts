import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { IS_PUBLIC_KEY } from "./constants";
import type { RequestUser } from "./current-user.decorator";

type AccessPayload = {
  sub: string;
  email: string;
  roles: string[];
  typ?: string;
};

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

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined>; user?: RequestUser }>();
    const header = req.headers.authorization ?? req.headers.Authorization;
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("missing_bearer");
    }
    const token = header.slice("Bearer ".length).trim();
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
}
