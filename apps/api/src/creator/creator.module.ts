import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { PrismaModule } from "../prisma/prisma.module";
import { VerificationModule } from "../verification/verification.module";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";

@Module({
  imports: [PrismaModule, VerificationModule, ComplianceModule],
  controllers: [CreatorController],
  providers: [CreatorService],
})
export class CreatorModule {}
