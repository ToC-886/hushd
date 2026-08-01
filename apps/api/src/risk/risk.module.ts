import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { JurisdictionService } from "./jurisdiction.service";
import { RiskController } from "./risk.controller";
import { RiskService } from "./risk.service";

@Module({
  imports: [PrismaModule],
  controllers: [RiskController],
  providers: [RiskService, JurisdictionService],
  exports: [RiskService, JurisdictionService],
})
export class RiskModule {}
