import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { CreatorService } from "./creator.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { CreateTierDto } from "./dto/create-tier.dto";

@Controller("creator")
@UseGuards(VerificationPolicyGuard)
@RequireVerification("creator")
export class CreatorController {
  constructor(private readonly creator: CreatorService) {}

  @Post("tiers")
  createTier(@CurrentUser() user: RequestUser, @Body() dto: CreateTierDto) {
    return this.creator.createTier(user, dto);
  }

  @Post("posts")
  createPost(@CurrentUser() user: RequestUser, @Body() dto: CreatePostDto) {
    return this.creator.createPost(user, dto);
  }

  @Get("dashboard")
  dashboard(@CurrentUser() user: RequestUser) {
    return this.creator.creatorDashboard(user);
  }
}
