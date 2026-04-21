import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ComplianceService } from "./compliance.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
