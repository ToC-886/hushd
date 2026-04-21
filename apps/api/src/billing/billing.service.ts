import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { SubscriptionStatus } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { ProcessorRegistry } from "../integrations/processor-registry";
import type { CreateSubscriptionDto } from "./dto/create-subscription.dto";
import type { CancelSubscriptionDto } from "./dto/cancel-subscription.dto";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly processors: ProcessorRegistry,
  ) {}

  async createSubscriptionCheckout(user: RequestUser, dto: CreateSubscriptionDto) {
    const tier = await this.prisma.subscriptionTier.findUnique({
      where: { id: dto.tierId },
      include: { creator: true },
    });
    if (!tier || !tier.active || tier.creator.slug !== dto.creatorSlug) {
      throw new NotFoundException("tier_not_found");
    }

    const processor = this.processors.getDefault();
    const result = await processor.createSubscriptionCheckout({
      fanUserId: user.id,
      creatorSlug: dto.creatorSlug,
      tierId: dto.tierId,
      successReturnUrl: dto.successReturnUrl,
      cancelReturnUrl: dto.cancelReturnUrl,
    });
    if (!result.ok) {
      throw new BadRequestException(result.message);
    }

    await this.prisma.subscription.upsert({
      where: {
        fanUserId_creatorId: {
          fanUserId: user.id,
          creatorId: tier.creatorId,
        },
      },
      create: {
        fanUserId: user.id,
        creatorId: tier.creatorId,
        tierId: tier.id,
        status: SubscriptionStatus.INCOMPLETE,
        processorRefs: { sessionRef: result.processorSessionRef, processor: processor.id },
      },
      update: {
        tierId: tier.id,
        status: SubscriptionStatus.INCOMPLETE,
        processorRefs: { sessionRef: result.processorSessionRef, processor: processor.id },
      },
    });

    return {
      processor: processor.id,
      redirectUrl: result.redirectUrl,
      processorSessionRef: result.processorSessionRef,
    };
  }

  async cancelSubscription(user: RequestUser, dto: CancelSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: dto.subscriptionId },
    });
    if (!subscription || subscription.fanUserId !== user.id) {
      throw new NotFoundException("subscription_not_found");
    }

    const refs = (subscription.processorRefs ?? {}) as { processor?: string; subscriptionRef?: string };
    const processor = this.processors.getById(refs.processor ?? "") ?? this.processors.getDefault();
    if (refs.subscriptionRef) {
      await processor.cancelSubscription(refs.subscriptionRef);
    }

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, status: SubscriptionStatus.CANCELED },
    });

    await this.prisma.auditLog.create({
      data: {
        actorType: "USER",
        actorUserId: user.id,
        action: "subscription_canceled",
        entityType: "subscription",
        entityId: subscription.id,
        diff: { reason: dto.reason ?? "user_requested" },
      },
    });

    return { ok: true as const };
  }

  async paymentHistory(user: RequestUser) {
    const txns = await this.prisma.transaction.findMany({
      where: { payerUserId: user.id },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
    return txns.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      grossCents: row.grossCents,
      feeCents: row.feeCents,
      netCents: row.netCents,
      currency: row.currency,
      processor: row.processor,
      processorTxnId: row.processorTxnId,
      occurredAt: row.occurredAt,
    }));
  }
}
