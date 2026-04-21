import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
import { AdminService } from "./admin.service";

@Controller("admin")
@RequireRole(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("moderation/queue")
  moderationQueue() {
    return this.admin.moderationQueue();
  }

  @Post("moderation/queue/:id/resolve")
  resolveModeration(@Param("id") id: string) {
    return this.admin.resolveModeration(id);
  }

  @Post("payouts/:payoutId/approve")
  approvePayout(@Param("payoutId") payoutId: string, @CurrentUser() user: RequestUser) {
    return this.admin.approvePayout(payoutId, user.id);
  }

  @Post("payouts/:payoutId/paid")
  markPaid(@Param("payoutId") payoutId: string) {
    return this.admin.markPayoutPaid(payoutId);
  }

  @Get("fraud/dashboard")
  fraudDashboard() {
    return this.admin.fraudDashboard();
  }

  @Get("compliance/export")
  complianceExport(@Query("limit") limit?: string) {
    return this.admin.complianceExports(limit ? Number(limit) : 200);
  }
}
