import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
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

  @Post("reports/:reportId/triage")
  @RequireRole(UserRole.ADMIN)
  triage(
    @CurrentUser() user: RequestUser,
    @Param("reportId") reportId: string,
    @Body() body: { status: "TRIAGED" | "RESOLVED" | "DISMISSED" },
  ) {
    return this.moderation.triageReport(reportId, user.id, body.status);
  }
}
