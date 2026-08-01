import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RiskModule } from "../risk/risk.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [PrismaModule, RiskModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
