import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { UserRole, type ModerationQueueStatus } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
import { CreateDmcaDto } from "./dto/create-dmca.dto";
import { CreateReportDto } from "./dto/create-report.dto";
import { ModerationService } from "./moderation.service";

@Controller("moderation")
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Post("reports")
  createReport(@CurrentUser() user: RequestUser, @Body() dto: CreateReportDto) {
    return this.moderation.createReport(user, dto);
  }

  @Get("reports/me")
  myReports(@CurrentUser() user: RequestUser) {
    return this.moderation.myReports(user);
  }

  @Post("dmca")
  submitDmca(@Body() dto: CreateDmcaDto) {
    return this.moderation.submitDmca(dto);
  }

  @Get("queue")
  @RequireRole(UserRole.ADMIN)
  queue(@Query("status") status?: ModerationQueueStatus) {
    return this.moderation.listQueue(status);
  }

  @Post("reports/:reportId/triage")
  @HttpCode(200)
  @RequireRole(UserRole.ADMIN)
  triage(
    @CurrentUser() user: RequestUser,
    @Param("reportId") reportId: string,
    @Body() body: { status: "TRIAGED" | "RESOLVED" | "DISMISSED" },
  ) {
    return this.moderation.triageReport(reportId, user.id, body.status);
  }
}
