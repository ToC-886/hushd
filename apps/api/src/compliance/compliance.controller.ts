import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { ComplianceService } from "./compliance.service";
import { Submit2257Dto } from "./dto/submit-2257.dto";

@Controller("compliance")
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Post("2257")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("creator")
  submit2257(@CurrentUser() user: RequestUser, @Body() dto: Submit2257Dto) {
    return this.compliance.submit2257Record(user, dto);
  }

  @Get("2257/me")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("creator")
  my2257(@CurrentUser() user: RequestUser) {
    return this.compliance.my2257Record(user);
  }

  @Get("2257/records")
  @RequireRole(UserRole.ADMIN)
  list2257() {
    return this.compliance.list2257Records();
  }
}
