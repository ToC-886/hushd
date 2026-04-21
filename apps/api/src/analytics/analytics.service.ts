import { Injectable } from "@nestjs/common";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async creatorAnalytics(user: RequestUser) {
    const [earningsRows, activeSubs, posts] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { payeeCreatorId: user.id, status: "SUCCEEDED" },
        orderBy: { occurredAt: "desc" },
        take: 500,
      }),
      this.prisma.subscription.count({ where: { creatorId: user.id, status: "ACTIVE" } }),
      this.prisma.post.findMany({
        where: { creatorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);
    const gross = earningsRows.reduce((sum, row) => sum + row.grossCents, 0);
    const net = earningsRows.reduce((sum, row) => sum + row.netCents, 0);
    return {
      grossCents: gross,
      netCents: net,
      activeSubscribers: activeSubs,
      topPosts: posts
        .sort((a, b) => b.likeCount + b.commentCount - (a.likeCount + a.commentCount))
        .slice(0, 10)
        .map((post) => ({ id: post.id, score: post.likeCount + post.commentCount })),
    };
  }

  async platformChurnSummary() {
    const [active, canceled, pastDue] = await Promise.all([
      this.prisma.subscription.count({ where: { status: "ACTIVE" } }),
      this.prisma.subscription.count({ where: { status: "CANCELED" } }),
      this.prisma.subscription.count({ where: { status: "PAST_DUE" } }),
    ]);
    const total = active + canceled + pastDue;
    return {
      active,
      canceled,
      pastDue,
      churnRate: total > 0 ? canceled / total : 0,
    };
  }
}
