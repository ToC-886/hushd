import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser, type RequestUser } from "../auth/current-user.decorator";
import { VerificationPolicyGuard } from "../verification/verification-policy.guard";
import { RequireVerification } from "../verification/verification.decorator";
import { CreatorService } from "./creator.service";
import { CreatePostDto } from "./dto/create-post.dto";
import { CreateTierDto } from "./dto/create-tier.dto";
import { UpdateCreatorProfileDto } from "./dto/update-profile.dto";
import { UpdateTierDto } from "./dto/update-tier.dto";

@Controller("creator")
@UseGuards(VerificationPolicyGuard)
@RequireVerification("creator")
export class CreatorController {
  constructor(private readonly creator: CreatorService) {}

  @Patch("profile")
  updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateCreatorProfileDto) {
    return this.creator.updateProfile(user, dto);
  }

  @Get("tiers")
  listTiers(@CurrentUser() user: RequestUser) {
    return this.creator.listTiers(user);
  }

  @Post("tiers")
  createTier(@CurrentUser() user: RequestUser, @Body() dto: CreateTierDto) {
    return this.creator.createTier(user, dto);
  }

  @Patch("tiers/:tierId")
  updateTier(@CurrentUser() user: RequestUser, @Param("tierId") tierId: string, @Body() dto: UpdateTierDto) {
    return this.creator.updateTier(user, tierId, dto);
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
