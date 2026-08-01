import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SubscriptionInterval } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { CreatePostDto } from "./dto/create-post.dto";
import type { CreateTierDto } from "./dto/create-tier.dto";
import type { UpdateCreatorProfileDto } from "./dto/update-profile.dto";
import type { UpdateTierDto } from "./dto/update-tier.dto";

const DASHBOARD_WINDOW_DAYS = 30;

@Injectable()
export class CreatorService {
  constructor(private readonly prisma: PrismaService) {}

  async listTiers(user: RequestUser) {
    await this.requireCreatorProfile(user.id);
    return this.prisma.subscriptionTier.findMany({
      where: { creatorId: user.id },
      orderBy: { createdAt: "desc" },
    });
  }

  async createTier(user: RequestUser, dto: CreateTierDto) {
    await this.requireCreatorProfile(user.id);
    return this.prisma.subscriptionTier.create({
      data: {
        creatorId: user.id,
        title: dto.title,
        description: dto.description,
        priceCents: dto.priceCents,
        interval: dto.interval ?? SubscriptionInterval.MONTH,
        trialDays: dto.trialDays ?? 0,
      },
    });
  }

  async updateTier(user: RequestUser, tierId: string, dto: UpdateTierDto) {
    const tier = await this.prisma.subscriptionTier.findUnique({ where: { id: tierId } });
    if (!tier || tier.creatorId !== user.id) {
      throw new NotFoundException("tier_not_found");
    }
    return this.prisma.subscriptionTier.update({
      where: { id: tierId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.priceCents !== undefined ? { priceCents: dto.priceCents } : {}),
        ...(dto.trialDays !== undefined ? { trialDays: dto.trialDays } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
  }

  async createPost(user: RequestUser, dto: CreatePostDto) {
    await this.requireCreatorProfile(user.id);

    if (dto.visibility === "TIER_LOCKED") {
      if (!dto.lockedTierId) {
        throw new BadRequestException("locked_tier_required");
      }
      const tier = await this.prisma.subscriptionTier.findUnique({ where: { id: dto.lockedTierId } });
      if (!tier || tier.creatorId !== user.id) {
        throw new BadRequestException("locked_tier_not_yours");
      }
    }

    if (dto.mediaIds?.length) {
      await this.assertAttachableMedia(user.id, dto.mediaIds);
    }

    const post = await this.prisma.post.create({
      data: {
        creatorId: user.id,
        body: dto.body,
        visibility: dto.visibility,
        lockedTierId: dto.visibility === "TIER_LOCKED" ? dto.lockedTierId : null,
        publishedAt: new Date(),
      },
    });

    if (dto.mediaIds?.length) {
      await this.prisma.postMedia.createMany({
        data: dto.mediaIds.map((mediaId, idx) => ({ postId: post.id, mediaId, ordering: idx })),
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorUserId: user.id,
        action: "post_created",
        entityType: "post",
        entityId: post.id,
        diff: { visibility: post.visibility, mediaCount: dto.mediaIds?.length ?? 0 },
      },
    });

    return post;
  }

  /**
   * countryCode drives payout jurisdiction checks, so changes are audit-logged
   * with the previous value — a creator flipping countries to evade a payout
   * block must leave a trail for review.
   */
  async updateProfile(user: RequestUser, dto: UpdateCreatorProfileDto) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!creator) {
      throw new ForbiddenException("creator_profile_required");
    }
    const countryCode = dto.countryCode?.trim().toUpperCase();
    const updated = await this.prisma.creatorProfile.update({
      where: { userId: user.id },
      data: {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
        ...(dto.bio !== undefined ? { bio: dto.bio } : {}),
        ...(dto.countryCode !== undefined ? { countryCode: countryCode ?? null } : {}),
      },
    });
    if (dto.countryCode !== undefined && creator.countryCode !== updated.countryCode) {
      await this.prisma.auditLog.create({
        data: {
          actorType: "USER",
          actorUserId: user.id,
          action: "creator_country_changed",
          entityType: "creator_profile",
          entityId: creator.userId,
          diff: { from: creator.countryCode, to: updated.countryCode },
        },
      });
    }
    return updated;
  }

  async creatorDashboard(user: RequestUser) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!creator) {
      throw new NotFoundException("creator_profile_not_found");
    }
    const windowStart = new Date(Date.now() - DASHBOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const [tiers, subs, txns] = await Promise.all([
      this.prisma.subscriptionTier.count({ where: { creatorId: user.id, active: true } }),
      this.prisma.subscription.count({ where: { creatorId: user.id, status: "ACTIVE" } }),
      this.prisma.transaction.findMany({
        where: { payeeCreatorId: user.id, status: "SUCCEEDED", occurredAt: { gte: windowStart } },
        orderBy: { occurredAt: "desc" },
      }),
    ]);

    const grossCents = txns.reduce((acc, row) => acc + row.grossCents, 0);
    const netCents = txns.reduce((acc, row) => acc + row.netCents, 0);
    return {
      windowDays: DASHBOARD_WINDOW_DAYS,
      activeTiers: tiers,
      activeSubscribers: subs,
      grossCents30d: grossCents,
      netCents30d: netCents,
    };
  }

  private async requireCreatorProfile(userId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId } });
    if (!creator) {
      throw new ForbiddenException("creator_profile_required");
    }
  }

  /**
   * Posts may only attach media the creator owns and that has cleared the
   * scan gate — attaching unscanned or foreign media would bypass quarantine.
   */
  private async assertAttachableMedia(creatorId: string, mediaIds: string[]) {
    const media = await this.prisma.media.findMany({
      where: { id: { in: mediaIds } },
      select: { id: true, ownerCreatorId: true, scanStatus: true },
    });
    if (media.length !== mediaIds.length) {
      throw new BadRequestException("media_not_found");
    }
    for (const item of media) {
      if (item.ownerCreatorId !== creatorId) {
        throw new ForbiddenException("media_not_yours");
      }
      if (item.scanStatus !== "OK") {
        throw new BadRequestException("media_not_cleared");
      }
    }
  }
}
