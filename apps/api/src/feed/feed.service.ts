import { Injectable } from "@nestjs/common";
import type { Post } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService) {}

  async fanFeed(user: RequestUser) {
    const activeSubs = await this.prisma.subscription.findMany({
      where: { fanUserId: user.id, status: "ACTIVE" },
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
        postMedia: { include: { media: true } },
        creator: { select: { slug: true, displayName: true } },
      },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });

    return posts.filter((post) => this.isEntitled(post, tierIds)).map((post) => this.toDto(post));
  }

  async creatorFeed(slug: string, user: RequestUser) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { slug } });
    if (!creator) return [];
    const sub = await this.prisma.subscription.findUnique({
      where: {
        fanUserId_creatorId: {
          fanUserId: user.id,
          creatorId: creator.userId,
        },
      },
    });
    const posts = await this.prisma.post.findMany({
      where: { creatorId: creator.userId, publishedAt: { not: null } },
      include: { postMedia: { include: { media: true } }, creator: { select: { slug: true, displayName: true } } },
      orderBy: { publishedAt: "desc" },
      take: 100,
    });
    const tierSet = new Set(sub ? [sub.tierId] : []);
    return posts.filter((post) => this.isEntitled(post, tierSet, Boolean(sub))).map((post) => this.toDto(post));
  }

  private isEntitled(post: Post, tierIds: Set<string>, hasSub = true) {
    if (post.visibility === "PUBLIC") return true;
    if (post.visibility === "SUBSCRIBERS") return hasSub;
    if (post.visibility === "TIER_LOCKED") {
      return post.lockedTierId ? tierIds.has(post.lockedTierId) : false;
    }
    return false;
  }

  private toDto(
    post: Post & {
      creator: { slug: string; displayName: string | null };
      postMedia: Array<{ media: { id: string; type: string; r2PublicKey: string | null; streamUid: string | null } }>;
    },
  ) {
    return {
      id: post.id,
      creator: post.creator,
      body: post.body,
      visibility: post.visibility,
      lockedTierId: post.lockedTierId,
      publishedAt: post.publishedAt,
      media: post.postMedia.map((m) => ({
        id: m.media.id,
        type: m.media.type,
        r2PublicKey: m.media.r2PublicKey,
        streamUid: m.media.streamUid,
      })),
    };
  }
}
