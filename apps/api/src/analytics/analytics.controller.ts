import { Controller, Get } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
import { AnalyticsService } from "./analytics.service";

@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get("creator/me")
  creatorAnalytics(@CurrentUser() user: RequestUser) {
    return this.analytics.creatorAnalytics(user);
  }

  @Get("admin/churn")
  @RequireRole(UserRole.ADMIN)
  churn() {
    return this.analytics.platformChurnSummary();
  }
}
