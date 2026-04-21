import { SetMetadata } from "@nestjs/common";
import { UserRole } from "@prisma/client";

export const REQUIRED_ROLES_KEY = "requiredRoles";
export const RequireRole = (...roles: UserRole[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
