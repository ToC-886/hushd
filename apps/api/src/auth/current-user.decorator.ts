import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export type RequestUser = {
  id: string;
  email: string;
  roles: string[];
};

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): RequestUser => {
  const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
  if (!req.user) {
    throw new Error("CurrentUser used without JwtAuthGuard");
  }
  return req.user;
});
