import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Prisma, TransactionType } from "@prisma/client";
import { platformFeeCents } from "@hushd/shared";
import type { NormalizedBillingEvent } from "@hushd/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ProcessorRegistry } from "../integrations/processor-registry";

@Injectable()
export class BillingWebhookService {
  constructor(
    private readonly processors: ProcessorRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async ingestWebhook(
    processorId: string,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ) {
    const processor = this.processors.getById(processorId);
    if (!processor) {
      throw new UnauthorizedException("processor_disabled");
    }
    const rawBody = typeof body === "string" ? body : JSON.stringify(body ?? {});
    const ok = await processor.verifyWebhook({ rawBody, headers });
    if (!ok) {
      throw new UnauthorizedException("invalid_signature");
    }
    const events = await processor.parseWebhookPayload({ rawBody, headers });
    const results: Array<{ processorEventId: string; status: "processed" | "duplicate" | "failed" }> = [];
    for (const event of events) {
      const res = await this.processEvent(event, body);
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

  private async processEvent(event: NormalizedBillingEvent, payload: unknown) {
    const existing = await this.prisma.processorEvent.findUnique({
      where: {
        processor_processorEventId: {
          processor: event.processor,
          processorEventId: event.processorEventId,
        },
      },
    });
    if (existing) {
      return { processorEventId: event.processorEventId, status: "duplicate" as const };
    }

    const feeBps = 1500;
    const feeCents = platformFeeCents(Math.max(event.grossCents, 0), feeBps);
    const netCents = Math.max(event.grossCents - feeCents, 0);
    const txType = this.mapType(event.type);

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

        if (!event.fanUserId) {
          await tx.processorEvent.update({
            where: {
              processor_processorEventId: {
                processor: event.processor,
                processorEventId: event.processorEventId,
              },
            },
            data: { status: "PROCESSED", processedAt: new Date() },
          });
          return;
        }

        const txn = await tx.transaction.create({
          data: {
            payerUserId: event.fanUserId,
            payeeCreatorId: event.creatorId ?? null,
            type: txType,
            status: "SUCCEEDED",
            grossCents: Math.max(event.grossCents, 0),
            feeCents,
            netCents,
            currency: event.currency,
            processor: event.processor,
            processorTxnId: event.processorTxnId,
            subscriptionId: event.subscriptionId ?? null,
            occurredAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
            metadata: event.metadata as unknown as Prisma.JsonObject,
          },
        });

        await tx.ledgerEntry.createMany({
          data: [
            {
              transactionId: txn.id,
              accountCode: "cash_processor_clearing",
              direction: "DEBIT",
              amountCents: Math.max(event.grossCents, 0),
              currency: event.currency,
              metadata: {} as Prisma.JsonObject,
            },
            {
              transactionId: txn.id,
              accountCode: "creator_payable",
              direction: "CREDIT",
              amountCents: netCents,
              currency: event.currency,
              metadata: {} as Prisma.JsonObject,
            },
            {
              transactionId: txn.id,
              accountCode: "platform_revenue",
              direction: "CREDIT",
              amountCents: feeCents,
              currency: event.currency,
              metadata: {} as Prisma.JsonObject,
            },
          ],
        });

        await tx.processorEvent.update({
          where: {
            processor_processorEventId: {
              processor: event.processor,
              processorEventId: event.processorEventId,
            },
          },
          data: { status: "PROCESSED", processedAt: new Date() },
        });
      });
      return { processorEventId: event.processorEventId, status: "processed" as const };
    } catch (err) {
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
