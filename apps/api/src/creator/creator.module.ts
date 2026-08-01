import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { VerificationModule } from "../verification/verification.module";
import { CreatorController } from "./creator.controller";
import { CreatorService } from "./creator.service";

@Module({
  imports: [PrismaModule, VerificationModule],
  controllers: [CreatorController],
  providers: [CreatorService],
})
export class CreatorModule {}
