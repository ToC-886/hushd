import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { VerificationController } from "./verification.controller";
import { VerificationPolicyGuard } from "./verification-policy.guard";
import { VerificationService } from "./verification.service";

@Module({
  imports: [PrismaModule, IntegrationsModule, ComplianceModule],
  controllers: [VerificationController],
  providers: [VerificationService, VerificationPolicyGuard],
  exports: [VerificationService, VerificationPolicyGuard],
})
export class VerificationModule {}
