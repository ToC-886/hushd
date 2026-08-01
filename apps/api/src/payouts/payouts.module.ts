import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RiskModule } from "../risk/risk.module";
import { VerificationModule } from "../verification/verification.module";
import { PayoutsController } from "./payouts.controller";
import { PayoutsService } from "./payouts.service";

@Module({
  imports: [PrismaModule, VerificationModule, RiskModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
})
export class PayoutsModule {}
