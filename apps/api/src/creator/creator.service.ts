import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SubscriptionInterval } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { ComplianceService } from "../compliance/compliance.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreatePostDto } from "./dto/create-post.dto";
import type { CreateTierDto } from "./dto/create-tier.dto";

@Injectable()
export class CreatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
  ) {}

  async createTier(user: RequestUser, dto: CreateTierDto) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!creator) {
      throw new ForbiddenException("creator_profile_required");
    }
    return this.prisma.subscriptionTier.create({
      data: {
        creatorId: user.id,
        title: dto.title,
        description: dto.description,
        priceCents: dto.priceCents,
        interval: SubscriptionInterval.MONTH,
        trialDays: dto.trialDays ?? 0,
      },
    });
  }

  async createPost(user: RequestUser, dto: CreatePostDto) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!creator) {
      throw new ForbiddenException("creator_profile_required");
    }

    if (dto.visibility === "TIER_LOCKED" && !dto.lockedTierId) {
      throw new ForbiddenException("locked_tier_required");
    }

    const post = await this.prisma.post.create({
      data: {
        creatorId: user.id,
        body: dto.body,
        visibility: dto.visibility,
        lockedTierId: dto.lockedTierId,
        publishedAt: new Date(),
      },
    });

    if (dto.mediaIds?.length) {
      await this.prisma.postMedia.createMany({
        data: dto.mediaIds.map((mediaId, idx) => ({ postId: post.id, mediaId, ordering: idx })),
      });
    }

    await this.compliance.emit({
      eventType: "ID_VERIFICATION_APPROVED",
      creatorId: user.id,
      payload: { action: "post_created", postId: post.id },
    });

    return post;
  }

  async creatorDashboard(user: RequestUser) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!creator) {
      throw new NotFoundException("creator_profile_not_found");
    }
    const [tiers, subs, txns] = await Promise.all([
      this.prisma.subscriptionTier.count({ where: { creatorId: user.id, active: true } }),
      this.prisma.subscription.count({ where: { creatorId: user.id, status: "ACTIVE" } }),
      this.prisma.transaction.findMany({
        where: { payeeCreatorId: user.id, status: "SUCCEEDED" },
        orderBy: { occurredAt: "desc" },
        take: 30,
      }),
    ]);

    const grossCents = txns.reduce((acc, row) => acc + row.grossCents, 0);
    const netCents = txns.reduce((acc, row) => acc + row.netCents, 0);
    return {
      activeTiers: tiers,
      activeSubscribers: subs,
      grossCents30d: grossCents,
      netCents30d: netCents,
    };
  }
}
