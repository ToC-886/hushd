import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { VERIFICATION_POLICY_KEY, type VerificationPolicy } from "./verification.decorator";

@Injectable()
export class VerificationPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<VerificationPolicy>(VERIFICATION_POLICY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!policy) return true;

    const req = context.switchToHttp().getRequest<{ user: RequestUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("auth_required");

    // An APPROVED record only counts while it is unexpired — documents lapse
    // and must be re-verified (see the worker expiry sweep).
    const notExpired = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };

    const ageApproved = await this.prisma.ageVerification.findFirst({
      where: { userId: user.id, status: "APPROVED", ...notExpired },
      select: { id: true },
    });
    if (!ageApproved) {
      throw new ForbiddenException("age_verification_required");
    }

    if (policy === "age") return true;

    const isCreator = user.roles.includes(UserRole.CREATOR);
    if (!isCreator) {
      throw new ForbiddenException("creator_role_required");
    }
    const idApproved = await this.prisma.idVerification.findFirst({
      where: { userId: user.id, status: "APPROVED", ...notExpired },
      select: { id: true },
    });
    if (!idApproved) {
      throw new ForbiddenException("creator_id_verification_required");
    }
    return true;
  }
}
