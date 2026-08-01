import { Body, Controller, ForbiddenException, Get, Param, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { InitUploadDto } from "./dto/init-upload.dto";
import { MediaService } from "./media.service";

@Controller("media")
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post("uploads/init")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("creator")
  init(@CurrentUser() user: RequestUser, @Body() body: InitUploadDto) {
    if (body.ownerCreatorId !== user.id) {
      throw new ForbiddenException("owner_mismatch");
    }
    return this.media.initUpload({
      ownerCreatorId: body.ownerCreatorId,
      mediaType: body.mediaType,
      contentType: body.contentType,
      byteSize: body.byteSize,
    });
  }

  @Get(":mediaId")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("creator")
  status(@CurrentUser() user: RequestUser, @Param("mediaId") mediaId: string) {
    return this.media.mediaStatus(user.id, mediaId);
  }

  @Post("uploads/complete")
  @UseGuards(VerificationPolicyGuard)
  @RequireVerification("creator")
  complete(
    @CurrentUser() user: RequestUser,
    @Body()
    body: {
      mediaId: string;
      ownerCreatorId: string;
      stagingKey: string;
      mediaType: string;
      contentType?: string;
      sha256?: string;
    },
  ) {
    if (body.ownerCreatorId !== user.id) {
      throw new ForbiddenException("owner_mismatch");
    }
    return this.media.completeUpload({
      mediaId: body.mediaId,
      ownerCreatorId: body.ownerCreatorId,
      stagingKey: body.stagingKey,
      mediaType: body.mediaType as never,
      contentType: body.contentType,
      sha256: body.sha256,
    });
  }
}
