import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { MessagingService } from "./messaging.service";
import { SendMessageDto } from "./dto/send-message.dto";
import { TipDto } from "./dto/tip.dto";

@Controller("messages")
@UseGuards(VerificationPolicyGuard)
@RequireVerification("age")
export class MessagingController {
  constructor(private readonly messaging: MessagingService) {}

  @Post("send")
  send(@CurrentUser() user: RequestUser, @Body() dto: SendMessageDto) {
    return this.messaging.sendMessage(user, dto);
  }

  @Post(":messageId/unlock")
  @HttpCode(200)
  unlock(@CurrentUser() user: RequestUser, @Param("messageId") messageId: string) {
    return this.messaging.unlockPpv(user, messageId);
  }

  @Post("tips")
  tip(@CurrentUser() user: RequestUser, @Body() dto: TipDto) {
    return this.messaging.sendTip(user, dto);
  }

  @Get("conversation/:creatorId")
  conversation(
    @CurrentUser() user: RequestUser,
    @Param("creatorId") creatorId: string,
    @Query("fanUserId") fanUserId?: string,
  ) {
    return this.messaging.conversation(user, creatorId, fanUserId);
  }
}
