import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { GeoBlockScope, UserRole, type DMCAStatus, type PayoutStatus } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
import { AdminService } from "./admin.service";
import { CreateGeoBlockDto } from "./dto/create-geo-block.dto";
import { UpdateDmcaStatusDto } from "./dto/update-dmca-status.dto";

@Controller("admin")
@RequireRole(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get("moderation/queue")
  moderationQueue() {
    return this.admin.moderationQueue();
  }

  @Post("moderation/queue/:id/resolve")
  resolveModeration(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.admin.resolveModeration(id, user.id);
  }

  @Get("payouts")
  payouts(@Query("status") status?: PayoutStatus) {
    return this.admin.listPayouts(status);
  }

  @Post("payouts/:payoutId/approve")
  approvePayout(@Param("payoutId") payoutId: string, @CurrentUser() user: RequestUser) {
    return this.admin.approvePayout(payoutId, user.id);
  }

  @Post("payouts/:payoutId/paid")
  markPaid(
    @Param("payoutId") payoutId: string,
    @CurrentUser() user: RequestUser,
    @Body() body?: { processorRef?: string },
  ) {
    return this.admin.markPayoutPaid(payoutId, user.id, body?.processorRef);
  }

  @Post("payouts/:payoutId/cancel")
  cancelPayout(
    @Param("payoutId") payoutId: string,
    @CurrentUser() user: RequestUser,
    @Body() body?: { reason?: string },
  ) {
    return this.admin.cancelPayout(payoutId, user.id, body?.reason);
  }

  @Get("risk/holds")
  holds() {
    return this.admin.listHolds();
  }

  @Post("risk/holds/:holdId/release")
  releaseHold(@Param("holdId") holdId: string, @CurrentUser() user: RequestUser) {
    return this.admin.releaseHold(holdId, user.id);
  }

  @Get("fraud/dashboard")
  fraudDashboard() {
    return this.admin.fraudDashboard();
  }

  @Get("compliance/export")
  complianceExport(@Query("limit") limit?: string) {
    return this.admin.complianceExports(limit ? Number(limit) : 200);
  }

  @Get("geo-blocks")
  geoBlocks() {
    return this.admin.listGeoBlocks();
  }

  @Post("geo-blocks")
  createGeoBlock(@CurrentUser() user: RequestUser, @Body() body: CreateGeoBlockDto) {
    return this.admin.createGeoBlock(user.id, body.countryCode, body.scope, body.reason);
  }

  @Delete("geo-blocks/:countryCode")
  removeGeoBlock(
    @CurrentUser() user: RequestUser,
    @Param("countryCode") countryCode: string,
    @Query("scope") scope?: GeoBlockScope,
  ) {
    const resolvedScope = scope ?? GeoBlockScope.ACCESS;
    if (!Object.values(GeoBlockScope).includes(resolvedScope)) {
      throw new BadRequestException("invalid_scope");
    }
    return this.admin.removeGeoBlock(user.id, countryCode, resolvedScope);
  }

  @Get("dmca")
  dmca(@Query("status") status?: DMCAStatus) {
    return this.admin.listDmcaRequests(status);
  }

  @Post("dmca/:id/status")
  updateDmca(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: UpdateDmcaStatusDto,
  ) {
    return this.admin.updateDmcaStatus(id, user.id, body.status, body.legalHold);
  }

  @Get("audit-logs")
  auditLogs(
    @Query("entityType") entityType?: string,
    @Query("entityId") entityId?: string,
    @Query("take") take?: string,
  ) {
    return this.admin.auditLogs({
      entityType,
      entityId,
      take: take ? Number(take) : undefined,
    });
  }
}
