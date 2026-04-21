import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { MediaController } from "./media.controller";
import { MediaService } from "./media.service";
import { R2SignerService } from "./r2-signer.service";
import { SignedUrlPolicy } from "./signed-url.policy";

@Module({
  imports: [PrismaModule],
  controllers: [MediaController],
  providers: [MediaService, SignedUrlPolicy, R2SignerService],
  exports: [MediaService, SignedUrlPolicy, R2SignerService],
})
export class MediaModule {}
