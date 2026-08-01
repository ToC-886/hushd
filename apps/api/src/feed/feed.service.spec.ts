import { NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { FeedService } from "./feed.service";
import type { R2SignerService } from "../media/r2-signer.service";
import type { SignedUrlPolicy } from "../media/signed-url.policy";
import type { PrismaService } from "../prisma/prisma.service";

const CREATOR = { userId: "creator_1", slug: "creator", displayName: "Creator", bio: "hello" };

function makePost(overrides: Record<string, unknown> = {}) {
  return {
    id: "post_1",
    creatorId: CREATOR.userId,
    visibility: "SUBSCRIBERS",
    lockedTierId: null,
    body: "hello",
    publishedAt: new Date(),
    creator: { userId: CREATOR.userId, slug: CREATOR.slug, displayName: CREATOR.displayName },
    postMedia: [],
    ...overrides,
  };
}

function makeHarness(sub: unknown) {
  const prisma = {
    creatorProfile: { findUnique: jest.fn().mockResolvedValue(CREATOR) },
    subscription: {
      findFirst: jest.fn().mockResolvedValue(sub),
      findMany: jest.fn().mockResolvedValue(sub ? [sub] : []),
    },
    subscriptionTier: {
      findMany: jest.fn().mockResolvedValue([
        { id: "tier_1", title: "Basic", description: null, priceCents: 999, interval: "MONTH", trialDays: 0 },
      ]),
    },
    post: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const signer = { signPublicGet: jest.fn().mockResolvedValue(null) } as unknown as R2SignerService;
  const urls = { publicReadTtlSeconds: jest.fn().mockReturnValue(60) } as unknown as SignedUrlPolicy;
  return { service: new FeedService(prisma, config, signer, urls), prisma };
}

describe("FeedService entitlements", () => {
  const user = { id: "fan_1", roles: ["FAN"] } as never;

  it("hides SUBSCRIBERS posts when no active subscription exists (expired/canceled subs are filtered by the query)", async () => {
    const { service, prisma } = makeHarness(null);
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      makePost({ id: "sub_post", visibility: "SUBSCRIBERS" }),
      makePost({ id: "pub_post", visibility: "PUBLIC" }),
    ]);

    const feed = await service.creatorFeed("creator", user);

    expect(feed.map((p) => p.id)).toEqual(["pub_post"]);
    expect(prisma.subscription.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });

  it("shows SUBSCRIBERS and matching TIER_LOCKED posts to active subscribers", async () => {
    const sub = { tierId: "tier_1", status: "ACTIVE" };
    const { service, prisma } = makeHarness(sub);
    (prisma.post.findMany as jest.Mock).mockResolvedValue([
      makePost({ id: "sub_post", visibility: "SUBSCRIBERS" }),
      makePost({ id: "tier_post", visibility: "TIER_LOCKED", lockedTierId: "tier_1" }),
      makePost({ id: "other_tier_post", visibility: "TIER_LOCKED", lockedTierId: "tier_2" }),
    ]);

    const feed = await service.creatorFeed("creator", user);

    expect(feed.map((p) => p.id)).toEqual(["sub_post", "tier_post"]);
  });

  it("fanFeed only queries subscriptions that are active and unexpired", async () => {
    const { service, prisma } = makeHarness(null);
    const feed = await service.fanFeed(user);
    expect(feed).toEqual([]);
    expect(prisma.subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: expect.any(Date) } }],
        }),
      }),
    );
  });
});

describe("FeedService.creatorProfile", () => {
  const user = { id: "fan_1", roles: ["FAN"] } as never;

  it("returns tiers even when the creator has no posts", async () => {
    const { service } = makeHarness(null);
    const profile = await service.creatorProfile("creator", user);
    expect(profile.userId).toBe(CREATOR.userId);
    expect(profile.tiers).toHaveLength(1);
    expect(profile.activeSubscription).toBeNull();
  });

  it("throws when the creator slug does not exist", async () => {
    const { service, prisma } = makeHarness(null);
    (prisma.creatorProfile.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.creatorProfile("missing", user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
