import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { VerificationModule } from "../verification/verification.module";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";

@Module({
  imports: [PrismaModule, VerificationModule],
  controllers: [MessagingController],
  providers: [MessagingService],
})
export class MessagingModule {}
