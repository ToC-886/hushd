import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Prisma,
  Subscription,
  SubscriptionInterval,
  SubscriptionStatus,
  SubscriptionTier,
  TransactionStatus,
  TransactionType,
} from "@prisma/client";
import { platformFeeCents } from "@hushd/shared";
import type { NormalizedBillingEvent } from "@hushd/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProcessorRegistry } from "../integrations/processor-registry";

const DEFAULT_PLATFORM_FEE_BPS = 1500;
const REVERSAL_TYPES = new Set<TransactionType>([TransactionType.REFUND, TransactionType.CHARGEBACK]);

type SubscriptionWithTier = Subscription & { tier: SubscriptionTier };

@Injectable()
export class BillingWebhookService {
  private readonly logger = new Logger(BillingWebhookService.name);

  constructor(
    private readonly processors: ProcessorRegistry,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async ingestWebhook(
    processorId: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: string | Buffer,
    parsedBody: unknown,
  ) {
    const processor = this.processors.getById(processorId);
    if (!processor) {
      throw new UnauthorizedException("processor_disabled");
    }
    const ok = await processor.verifyWebhook({ rawBody, headers });
    if (!ok) {
      throw new UnauthorizedException("invalid_signature");
    }
    const events = await processor.parseWebhookPayload({ rawBody, headers });
    const results: Array<{ processorEventId: string; status: "processed" | "duplicate" | "failed" }> = [];
    for (const event of events) {
      const res = await this.processEvent(event, parsedBody);
      results.push(res);
    }
    return { received: true, processed: results.length, results };
  }

  private mapType(type: NormalizedBillingEvent["type"]): TransactionType {
    switch (type) {
      case "subscription_charge":
      case "renewal":
        return TransactionType.SUBSCRIPTION_CHARGE;
      case "refund":
        return TransactionType.REFUND;
      case "chargeback":
        return TransactionType.CHARGEBACK;
      default:
        return TransactionType.ADJUSTMENT;
    }
  }

  private platformFeeBps(): number {
    const raw = this.config.get<string>("PLATFORM_FEE_BPS");
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 10_000 ? parsed : DEFAULT_PLATFORM_FEE_BPS;
  }

  private async resolveSubscription(
    tx: Prisma.TransactionClient,
    event: NormalizedBillingEvent,
  ): Promise<SubscriptionWithTier | null> {
    if (event.subscriptionId) {
      const byId = await tx.subscription.findUnique({
        where: { id: event.subscriptionId },
        include: { tier: true },
      });
      if (byId) return byId;
    }
    const sessionRef = event.metadata?.sessionRef;
    if (sessionRef) {
      const bySession = await tx.subscription.findFirst({
        where: { processorRefs: { path: ["sessionRef"], equals: sessionRef } },
        include: { tier: true },
      });
      if (bySession) return bySession;
    }
    return null;
  }

  private static periodEndFrom(interval: SubscriptionInterval, start: Date): Date {
    const end = new Date(start);
    if (interval === SubscriptionInterval.YEAR) {
      end.setUTCFullYear(end.getUTCFullYear() + 1);
    } else {
      end.setUTCMonth(end.getUTCMonth() + 1);
    }
    return end;
  }

  private async applySubscriptionLifecycle(
    tx: Prisma.TransactionClient,
    subscription: SubscriptionWithTier,
    event: NormalizedBillingEvent,
  ) {
    const now = new Date();
    const occurredAt = event.occurredAt ? new Date(event.occurredAt) : now;
    const subscriptionRef = event.metadata?.subscriptionRef;

    switch (event.type) {
      case "subscription_charge": {
        const periodStart = subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
          ? subscription.currentPeriodEnd
          : occurredAt;
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            cancelAtPeriodEnd: false,
            currentPeriodStart: periodStart,
            currentPeriodEnd: BillingWebhookService.periodEndFrom(subscription.tier.interval, periodStart),
            ...(subscriptionRef
              ? { processorRefs: { ...(subscription.processorRefs as object), subscriptionRef } }
              : {}),
          },
        });
        return;
      }
      case "renewal": {
        const base = subscription.currentPeriodEnd && subscription.currentPeriodEnd > now
          ? subscription.currentPeriodEnd
          : occurredAt;
        await tx.subscription.update({
          where: { id: subscription.id },
          data: {
            status: SubscriptionStatus.ACTIVE,
            currentPeriodStart: base,
            currentPeriodEnd: BillingWebhookService.periodEndFrom(subscription.tier.interval, base),
          },
        });
        return;
      }
      case "cancel": {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.CANCELED, cancelAtPeriodEnd: true },
        });
        return;
      }
      case "chargeback": {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: SubscriptionStatus.PAST_DUE },
        });
        return;
      }
      default:
        return;
    }
  }

  private async processEvent(event: NormalizedBillingEvent, payload: unknown) {
    const dedupeKey = {
      processor: event.processor,
      processorEventId: event.processorEventId,
    };
    const existing = await this.prisma.processorEvent.findUnique({
      where: { processor_processorEventId: dedupeKey },
    });
    if (existing && existing.status !== "FAILED") {
      return { processorEventId: event.processorEventId, status: "duplicate" as const };
    }
    if (existing) {
      // A prior attempt failed AFTER its transaction rolled back, so no
      // partial financial state exists. Clear the tombstone and reprocess —
      // otherwise a transient failure would permanently drop a money event.
      await this.prisma.processorEvent.delete({ where: { processor_processorEventId: dedupeKey } });
    }

    const feeBps = this.platformFeeBps();
    const grossCents = Math.max(event.grossCents, 0);
    const feeCents = platformFeeCents(grossCents, feeBps);
    const netCents = Math.max(grossCents - feeCents, 0);
    const txType = this.mapType(event.type);
    const isReversal = REVERSAL_TYPES.has(txType);
    // Lifecycle-only events (e.g. cancel) move no money: they must not
    // create zero-value Transaction/LedgerEntry noise.
    const hasFinancialEffect = txType !== TransactionType.ADJUSTMENT || grossCents > 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.processorEvent.create({
          data: {
            processor: event.processor,
            processorEventId: event.processorEventId,
            eventType: event.type,
            status: "RECEIVED",
            payload: payload as Prisma.JsonObject,
            canonicalData: event as unknown as Prisma.JsonObject,
          },
        });

        const subscription = await this.resolveSubscription(tx, event);
        const fanUserId = event.fanUserId ?? subscription?.fanUserId;
        const creatorId = event.creatorId ?? subscription?.creatorId ?? null;

        if (fanUserId && hasFinancialEffect) {
          const txn = await tx.transaction.create({
            data: {
              payerUserId: fanUserId,
              payeeCreatorId: creatorId,
              type: txType,
              status: TransactionStatus.SUCCEEDED,
              grossCents,
              feeCents,
              netCents,
              currency: event.currency,
              processor: event.processor,
              processorTxnId: event.processorTxnId,
              subscriptionId: subscription?.id ?? event.subscriptionId ?? null,
              occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
              metadata: event.metadata as unknown as Prisma.JsonObject,
            },
          });

          // Money-in events debit processor clearing and credit creator payable +
          // platform revenue. Refunds/chargebacks reverse the direction so the
          // ledger stays balanced without negative amounts.
          const entries = isReversal
            ? [
                { accountCode: "creator_payable", direction: "DEBIT" as const, amountCents: netCents },
                { accountCode: "platform_revenue", direction: "DEBIT" as const, amountCents: feeCents },
                { accountCode: "cash_processor_clearing", direction: "CREDIT" as const, amountCents: grossCents },
              ]
            : [
                { accountCode: "cash_processor_clearing", direction: "DEBIT" as const, amountCents: grossCents },
                { accountCode: "creator_payable", direction: "CREDIT" as const, amountCents: netCents },
                { accountCode: "platform_revenue", direction: "CREDIT" as const, amountCents: feeCents },
              ];

          await tx.ledgerEntry.createMany({
            data: entries.map((entry) => ({
              transactionId: txn.id,
              accountCode: entry.accountCode,
              direction: entry.direction,
              amountCents: entry.amountCents,
              currency: event.currency,
              metadata: {} as Prisma.JsonObject,
            })),
          });

          if (isReversal && event.metadata?.originalProcessorTxnId) {
            await tx.transaction.updateMany({
              where: {
                processor: event.processor,
                processorTxnId: event.metadata.originalProcessorTxnId,
              },
              data: { status: TransactionStatus.REVERSED },
            });
          }
        }

        if (subscription) {
          await this.applySubscriptionLifecycle(tx, subscription, event);
        }

        await tx.processorEvent.update({
          where: { processor_processorEventId: dedupeKey },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
      });
      return { processorEventId: event.processorEventId, status: "processed" as const };
    } catch (err) {
      this.logger.error(
        `processor_event_failed ${event.processor}/${event.processorEventId}`,
        err instanceof Error ? err.stack : String(err),
      );
      await this.prisma.processorEvent.upsert({
        where: {
          processor_processorEventId: {
            processor: event.processor,
            processorEventId: event.processorEventId,
          },
        },
        create: {
          processor: event.processor,
          processorEventId: event.processorEventId,
          eventType: event.type,
          status: "FAILED",
          payload: payload as Prisma.JsonObject,
          canonicalData: event as unknown as Prisma.JsonObject,
          failureReason: err instanceof Error ? err.message : "unknown_error",
        },
        update: {
          status: "FAILED",
          failureReason: err instanceof Error ? err.message : "unknown_error",
        },
      });
      return { processorEventId: event.processorEventId, status: "failed" as const };
    }
  }
}
