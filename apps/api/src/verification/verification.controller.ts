import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { RequireRole } from "../auth/role.decorator";
import { StartVerificationDto } from "./dto/start-verification.dto";
import { VerificationService } from "./verification.service";

@Controller("verification")
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get("status")
  status(@CurrentUser() user: RequestUser) {
    return this.verification.status(user);
  }

  @Post("age/start")
  @HttpCode(200)
  startAge(@CurrentUser() user: RequestUser, @Body() dto: StartVerificationDto) {
    return this.verification.startAgeVerification(user, dto);
  }

  @Post("id/start")
  @HttpCode(200)
  startId(@CurrentUser() user: RequestUser, @Body() dto: StartVerificationDto) {
    return this.verification.startIdVerification(user, dto);
  }

  @Post("admin/age/:verificationId/approve")
  @HttpCode(200)
  @RequireRole(UserRole.ADMIN)
  approveAge(@Param("verificationId") verificationId: string) {
    return this.verification.adminSetAgeStatus(verificationId, "APPROVED");
  }

  @Post("admin/age/:verificationId/reject")
  @HttpCode(200)
  @RequireRole(UserRole.ADMIN)
  rejectAge(@Param("verificationId") verificationId: string) {
    return this.verification.adminSetAgeStatus(verificationId, "REJECTED");
  }

  @Post("admin/id/:verificationId/approve")
  @HttpCode(200)
  @RequireRole(UserRole.ADMIN)
  approveId(@Param("verificationId") verificationId: string) {
    return this.verification.adminSetIdStatus(verificationId, "APPROVED");
  }

  @Post("admin/id/:verificationId/reject")
  @HttpCode(200)
  @RequireRole(UserRole.ADMIN)
  rejectId(@Param("verificationId") verificationId: string) {
    return this.verification.adminSetIdStatus(verificationId, "REJECTED");
  }
}
