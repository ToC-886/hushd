import { UnauthorizedException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { NormalizedBillingEvent, PaymentProcessor } from "@hushd/shared";
import { BillingWebhookService } from "./billing-webhook.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ProcessorRegistry } from "../integrations/processor-registry";

type MockTx = {
  processorEvent: { create: jest.Mock; update: jest.Mock };
  subscription: { findUnique: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  transaction: { create: jest.Mock; updateMany: jest.Mock };
  ledgerEntry: { createMany: jest.Mock };
};

function makeEvent(overrides: Partial<NormalizedBillingEvent> = {}): NormalizedBillingEvent {
  return {
    processor: "segpay_stub",
    processorEventId: "evt_1",
    processorTxnId: "txn_1",
    type: "subscription_charge",
    grossCents: 1000,
    currency: "EUR",
    occurredAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makeHarness(event: NormalizedBillingEvent, verifyOk = true) {
  const processor: PaymentProcessor = {
    id: "segpay_stub",
    createSubscriptionCheckout: jest.fn(),
    verifyWebhook: jest.fn().mockResolvedValue(verifyOk),
    parseWebhookPayload: jest.fn().mockResolvedValue([event]),
    cancelSubscription: jest.fn(),
    fetchBillingHistory: jest.fn(),
  };
  const processors = { getById: jest.fn().mockReturnValue(processor) } as unknown as ProcessorRegistry;

  const tx: MockTx = {
    processorEvent: { create: jest.fn(), update: jest.fn() },
    subscription: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    transaction: { create: jest.fn().mockResolvedValue({ id: "txnid_1" }), updateMany: jest.fn() },
    ledgerEntry: { createMany: jest.fn() },
  };
  const prisma = {
    processorEvent: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    $transaction: jest.fn((fn: (t: MockTx) => Promise<void>) => fn(tx)),
  } as unknown as PrismaService;

  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const service = new BillingWebhookService(processors, prisma, config);
  return { service, tx, prisma, processor };
}

describe("BillingWebhookService", () => {
  it("rejects invalid signatures", async () => {
    const { service } = makeHarness(makeEvent(), false);
    await expect(service.ingestWebhook("segpay_stub", {}, "{}", {})).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("skips duplicate events idempotently", async () => {
    const { service, prisma, tx } = makeHarness(makeEvent());
    (prisma.processorEvent.findUnique as jest.Mock).mockResolvedValue({ id: "existing" });
    const result = await service.ingestWebhook("segpay_stub", {}, "{}", {});
    expect(result.results).toEqual([{ processorEventId: "evt_1", status: "duplicate" }]);
    expect(tx.transaction.create).not.toHaveBeenCalled();
  });

  it("activates a subscription resolved via sessionRef and writes money-in ledger entries", async () => {
    const event = makeEvent({ metadata: { sessionRef: "stub_sess_tier1" } });
    const { service, tx } = makeHarness(event);
    tx.subscription.findFirst.mockResolvedValue({
      id: "sub_1",
      fanUserId: "fan_1",
      creatorId: "creator_1",
      status: "INCOMPLETE",
      processorRefs: { sessionRef: "stub_sess_tier1" },
      currentPeriodEnd: null,
      tier: { interval: "MONTH" },
    });

    const result = await service.ingestWebhook("segpay_stub", {}, "{}", {});

    expect(result.results).toEqual([{ processorEventId: "evt_1", status: "processed" }]);
    expect(tx.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ payerUserId: "fan_1", payeeCreatorId: "creator_1", grossCents: 1000 }),
      }),
    );
    const ledgerRows = tx.ledgerEntry.createMany.mock.calls[0][0].data as Array<{
      accountCode: string;
      direction: string;
      amountCents: number;
    }>;
    expect(ledgerRows).toEqual([
      { accountCode: "cash_processor_clearing", direction: "DEBIT", amountCents: 1000, currency: "EUR", transactionId: "txnid_1", metadata: {} },
      { accountCode: "creator_payable", direction: "CREDIT", amountCents: 850, currency: "EUR", transactionId: "txnid_1", metadata: {} },
      { accountCode: "platform_revenue", direction: "CREDIT", amountCents: 150, currency: "EUR", transactionId: "txnid_1", metadata: {} },
    ]);
    expect(tx.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub_1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("writes reversal ledger entries for refunds and marks the original transaction reversed", async () => {
    const event = makeEvent({
      type: "refund",
      fanUserId: "fan_1",
      creatorId: "creator_1",
      metadata: { originalProcessorTxnId: "txn_original" },
    });
    const { service, tx } = makeHarness(event);

    await service.ingestWebhook("segpay_stub", {}, "{}", {});

    const ledgerRows = tx.ledgerEntry.createMany.mock.calls[0][0].data as Array<{
      accountCode: string;
      direction: string;
    }>;
    expect(ledgerRows.map((r) => [r.accountCode, r.direction])).toEqual([
      ["creator_payable", "DEBIT"],
      ["platform_revenue", "DEBIT"],
      ["cash_processor_clearing", "CREDIT"],
    ]);
    expect(tx.transaction.updateMany).toHaveBeenCalledWith({
      where: { processor: "segpay_stub", processorTxnId: "txn_original" },
      data: { status: "REVERSED" },
    });
  });

  it("records unattributable events without creating transactions", async () => {
    const { service, tx } = makeHarness(makeEvent());
    tx.subscription.findUnique.mockResolvedValue(null);
    tx.subscription.findFirst.mockResolvedValue(null);

    const result = await service.ingestWebhook("segpay_stub", {}, "{}", {});

    expect(result.results).toEqual([{ processorEventId: "evt_1", status: "processed" }]);
    expect(tx.transaction.create).not.toHaveBeenCalled();
    expect(tx.processorEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PROCESSED" }) }),
    );
  });
});
