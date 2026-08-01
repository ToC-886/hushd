import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { FeedService } from "./feed.service";

@Controller("feed")
@UseGuards(VerificationPolicyGuard)
@RequireVerification("age")
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get("me")
  fanFeed(@CurrentUser() user: RequestUser) {
    return this.feed.fanFeed(user);
  }

  @Get("creator/:slug/profile")
  creatorProfile(@CurrentUser() user: RequestUser, @Param("slug") slug: string) {
    return this.feed.creatorProfile(slug, user);
  }

  @Get("creator/:slug")
  creatorFeed(@CurrentUser() user: RequestUser, @Param("slug") slug: string) {
    return this.feed.creatorFeed(slug, user);
  }
}
