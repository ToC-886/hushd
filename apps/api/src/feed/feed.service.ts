import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Post, Prisma } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { R2SignerService } from "../media/r2-signer.service";
import { SignedUrlPolicy } from "../media/signed-url.policy";
import { PrismaService } from "../prisma/prisma.service";

/**
 * A subscription only entitles while ACTIVE and inside its paid period.
 * Rows linger after cancel/expiry — without the period check, lapsed fans
 * would keep access forever.
 */
function activeSubscriptionWhere(now: Date): Prisma.SubscriptionWhereInput {
  return {
    status: "ACTIVE",
    OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }],
  };
}

@Injectable()
export class FeedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly signer: R2SignerService,
    private readonly urls: SignedUrlPolicy,
  ) {}

  async fanFeed(user: RequestUser) {
    const activeSubs = await this.prisma.subscription.findMany({
      where: { fanUserId: user.id, ...activeSubscriptionWhere(new Date()) },
      select: { creatorId: true, tierId: true },
    });
    const creatorIds = activeSubs.map((s) => s.creatorId);
    const tierIds = new Set(activeSubs.map((s) => s.tierId));
    if (creatorIds.length === 0) return [];

    const posts = await this.prisma.post.findMany({
      where: {
        creatorId: { in: creatorIds },
        publishedAt: { not: null },
      },
      include: {
        postMedia: { include: { media: true }, orderBy: { ordering: "asc" } },
        creator: { select: { userId: true, slug: true, displayName: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });

    const entitled = posts.filter((post) => this.isEntitled(post, tierIds));
    return Promise.all(entitled.map((post) => this.toDto(post)));
  }

  /**
   * Public creator card for fan discovery/subscribe UX. Empty post feeds must
   * not be treated as "creator not found" — this endpoint is the source of truth.
   */
  async creatorProfile(slug: string, user: RequestUser) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { slug } });
    if (!creator) {
      throw new NotFoundException("creator_not_found");
    }
    const [tiers, subscription] = await Promise.all([
      this.prisma.subscriptionTier.findMany({
        where: { creatorId: creator.userId, active: true },
        orderBy: { priceCents: "asc" },
        select: {
          id: true,
          title: true,
          description: true,
          priceCents: true,
          interval: true,
          trialDays: true,
        },
      }),
      this.prisma.subscription.findFirst({
        where: {
          fanUserId: user.id,
          creatorId: creator.userId,
          ...activeSubscriptionWhere(new Date()),
        },
        select: { id: true, tierId: true, status: true, currentPeriodEnd: true },
      }),
    ]);
    return {
      userId: creator.userId,
      slug: creator.slug,
      displayName: creator.displayName,
      bio: creator.bio,
      tiers,
      activeSubscription: subscription,
    };
  }

  async creatorFeed(slug: string, user: RequestUser) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { slug } });
    if (!creator) return [];
    const isOwner = creator.userId === user.id;
    const sub = isOwner
      ? null
      : await this.prisma.subscription.findFirst({
          where: {
            fanUserId: user.id,
            creatorId: creator.userId,
            ...activeSubscriptionWhere(new Date()),
          },
        });
    const posts = await this.prisma.post.findMany({
      where: { creatorId: creator.userId, publishedAt: { not: null } },
      include: {
        postMedia: { include: { media: true }, orderBy: { ordering: "asc" } },
        creator: { select: { userId: true, slug: true, displayName: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });
    const tierSet = new Set(sub ? [sub.tierId] : []);
    const entitled = posts.filter((post) => this.isEntitled(post, tierSet, isOwner || Boolean(sub)));
    return Promise.all(entitled.map((post) => this.toDto(post)));
  }

  private isEntitled(post: Post, tierIds: Set<string>, hasActiveSub = true) {
    if (post.visibility === "PUBLIC") return true;
    if (post.visibility === "SUBSCRIBERS") return hasActiveSub;
    if (post.visibility === "TIER_LOCKED") {
      return post.lockedTierId ? tierIds.has(post.lockedTierId) : false;
    }
    return false;
  }

  private async toDto(
    post: Post & {
      creator: { userId: string; slug: string; displayName: string | null };
      postMedia: Array<{
        media: { id: string; type: string; r2PublicKey: string | null; streamUid: string | null; scanStatus: string };
      }>;
    },
  ) {
    const bucket = this.config.get<string>("R2_BUCKET_PUBLIC") ?? "local-public";
    const ttl = this.urls.publicReadTtlSeconds();
    return {
      id: post.id,
      creator: post.creator,
      body: post.body,
      visibility: post.visibility,
      lockedTierId: post.lockedTierId,
      publishedAt: post.publishedAt,
      media: await Promise.all(
        post.postMedia.map(async (m) => ({
          id: m.media.id,
          type: m.media.type,
          streamUid: m.media.streamUid,
          url: m.media.r2PublicKey
            ? await this.signer.signPublicGet({ bucket, key: m.media.r2PublicKey, expiresInSeconds: ttl })
            : null,
        })),
      ),
    };
  }
}
