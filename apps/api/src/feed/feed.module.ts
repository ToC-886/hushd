import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { PrismaModule } from "../prisma/prisma.module";
import { VerificationModule } from "../verification/verification.module";
import { FeedController } from "./feed.controller";
import { FeedService } from "./feed.service";

@Module({
  imports: [PrismaModule, VerificationModule, MediaModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
