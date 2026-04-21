import { Controller, Get, Param } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { RequireRole } from "../auth/role.decorator";
import { RiskService } from "./risk.service";

@Controller("risk")
@RequireRole(UserRole.ADMIN)
export class RiskController {
  constructor(private readonly risk: RiskService) {}

  @Get("payout/:creatorId")
  payoutRisk(@Param("creatorId") creatorId: string) {
    return this.risk.payoutRiskScore(creatorId);
  }
}
