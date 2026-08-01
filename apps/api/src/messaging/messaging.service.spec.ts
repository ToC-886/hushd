import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { MessagingService } from "./messaging.service";
import type { PrismaService } from "../prisma/prisma.service";

type MockDb = {
  transaction: { create: jest.Mock };
  ledgerEntry: { createMany: jest.Mock };
  ppvMessage: { update: jest.Mock };
  tip: { create: jest.Mock };
};

function makeHarness() {
  const db: MockDb = {
    transaction: { create: jest.fn().mockResolvedValue({ id: "txn_1" }) },
    ledgerEntry: { createMany: jest.fn() },
    ppvMessage: { update: jest.fn() },
    tip: { create: jest.fn().mockResolvedValue({ id: "tip_1" }) },
  };
  const prisma = {
    ppvMessage: { findUnique: jest.fn(), create: jest.fn() },
    message: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({ id: "msg_new" }) },
    conversation: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({ id: "convo_1" }) },
    subscription: { findFirst: jest.fn() },
    $transaction: jest.fn((fn: (t: MockDb) => Promise<unknown>) => fn(db)),
  } as unknown as PrismaService;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  return { service: new MessagingService(prisma, config), prisma, db };
}

describe("MessagingService.unlockPpv", () => {
  const fan = { id: "fan_1", roles: ["FAN"] } as never;

  function setupPpv(h: ReturnType<typeof makeHarness>) {
    (h.prisma.ppvMessage.findUnique as jest.Mock).mockResolvedValue({
      messageId: "msg_1",
      priceCents: 1000,
      currency: "EUR",
      unlockTxnId: null,
    });
    (h.prisma.message.findUnique as jest.Mock).mockResolvedValue({
      id: "msg_1",
      conversation: { fanUserId: "fan_1", creatorId: "creator_1" },
    });
  }

  it("writes balanced double-entry ledger rows with the configured platform fee", async () => {
    const h = makeHarness();
    setupPpv(h);

    const result = await h.service.unlockPpv(fan, "msg_1");

    expect(result).toEqual({ ok: true, transactionId: "txn_1" });
    const entries = h.db.ledgerEntry.createMany.mock.calls[0][0].data as Array<{
      accountCode: string;
      direction: string;
      amountCents: number;
    }>;
    // 15% of 1000 = 150 fee, 850 net — debits must equal credits.
    const debits = entries.filter((e) => e.direction === "DEBIT").reduce((a, e) => a + e.amountCents, 0);
    const credits = entries.filter((e) => e.direction === "CREDIT").reduce((a, e) => a + e.amountCents, 0);
    expect(debits).toBe(1000);
    expect(credits).toBe(1000);
    expect(entries).toContainEqual(expect.objectContaining({ accountCode: "platform_revenue", amountCents: 150 }));
    expect(entries).toContainEqual(expect.objectContaining({ accountCode: "creator_payable", amountCents: 850 }));
    expect(h.db.ppvMessage.update).toHaveBeenCalledWith({
      where: { messageId: "msg_1" },
      data: { unlockTxnId: "txn_1" },
    });
  });

  it("is idempotent for already-unlocked messages", async () => {
    const h = makeHarness();
    setupPpv(h);
    (h.prisma.ppvMessage.findUnique as jest.Mock).mockResolvedValue({
      messageId: "msg_1",
      priceCents: 1000,
      currency: "EUR",
      unlockTxnId: "txn_prev",
    });

    const result = await h.service.unlockPpv(fan, "msg_1");

    expect(result).toEqual({ ok: true, alreadyUnlocked: true });
    expect(h.db.transaction.create).not.toHaveBeenCalled();
  });
});

describe("MessagingService.conversation PPV masking", () => {
  const convo = {
    id: "convo_1",
    fanUserId: "fan_1",
    creatorId: "creator_1",
    messages: [
      {
        id: "msg_locked",
        senderUserId: "creator_1",
        body: "secret ppv body",
        createdAt: new Date(),
        ppv: { priceCents: 500, currency: "EUR", unlockTxnId: null },
      },
      {
        id: "msg_free",
        senderUserId: "creator_1",
        body: "hello",
        createdAt: new Date(),
        ppv: null,
      },
    ],
  };

  it("hides locked PPV bodies from the fan", async () => {
    const h = makeHarness();
    (h.prisma.conversation.findUnique as jest.Mock).mockResolvedValue(convo);

    const result = await h.service.conversation({ id: "fan_1" } as never, "creator_1");

    const locked = result.messages.find((m) => m.id === "msg_locked");
    expect(locked).toMatchObject({ locked: true, body: null, ppv: { priceCents: 500, unlocked: false } });
    const free = result.messages.find((m) => m.id === "msg_free");
    expect(free).toMatchObject({ locked: false, body: "hello" });
  });

  it("shows everything to the creator", async () => {
    const h = makeHarness();
    (h.prisma.conversation.findUnique as jest.Mock).mockResolvedValue(convo);

    const result = await h.service.conversation({ id: "creator_1" } as never, "creator_1", "fan_1");

    const locked = result.messages.find((m) => m.id === "msg_locked");
    expect(locked).toMatchObject({ locked: false, body: "secret ppv body" });
  });
});

describe("MessagingService.sendMessage", () => {
  it("lets a creator reply to a fan without a subscription check", async () => {
    const h = makeHarness();
    const creator = { id: "creator_1" } as never;

    await h.service.sendMessage(creator, { creatorId: "creator_1", fanUserId: "fan_1", body: "reply" });

    expect(h.prisma.subscription.findFirst).not.toHaveBeenCalled();
    expect(h.prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { fanUserId_creatorId: { fanUserId: "fan_1", creatorId: "creator_1" } },
      }),
    );
  });

  it("requires fanUserId when the creator sends", async () => {
    const h = makeHarness();
    await expect(
      h.service.sendMessage({ id: "creator_1" } as never, { creatorId: "creator_1", body: "hi" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects PPV prices from fans", async () => {
    const h = makeHarness();
    await expect(
      h.service.sendMessage({ id: "fan_1" } as never, { creatorId: "creator_1", body: "hi", ppvPriceCents: 500 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
