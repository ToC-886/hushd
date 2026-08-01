import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { PayoutsService } from "./payouts.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { JurisdictionService } from "../risk/jurisdiction.service";
import type { RiskService } from "../risk/risk.service";

type MockDb = {
  transaction: { create: jest.Mock };
  ledgerEntry: { createMany: jest.Mock };
  payout: { create: jest.Mock };
  complianceEvent: { create: jest.Mock };
};

type HarnessOptions = {
  kycApproved?: boolean;
  activeHold?: unknown;
  credits?: number;
  debits?: number;
  account?: unknown;
  risk?: { riskScore: number; holdRecommended: boolean };
  allowPayouts?: boolean;
};

function makeHarness(opts: HarnessOptions = {}) {
  const db: MockDb = {
    transaction: { create: jest.fn().mockResolvedValue({ id: "txn_1" }) },
    ledgerEntry: { createMany: jest.fn() },
    payout: { create: jest.fn().mockResolvedValue({ id: "payout_1", amountCents: 10000 }) },
    complianceEvent: { create: jest.fn() },
  };
  const account =
    opts.account === undefined
      ? { id: "acct_1", creatorId: "creator_1", currency: "EUR", disabledAt: null, method: "SEPA", last4: "1234" }
      : opts.account;
  const prisma = {
    creatorProfile: { findUnique: jest.fn().mockResolvedValue({ userId: "creator_1" }) },
    idVerification: {
      findFirst: jest.fn().mockResolvedValue(opts.kycApproved === false ? null : { id: "idv_1" }),
    },
    ledgerHold: {
      findFirst: jest.fn().mockResolvedValue(opts.activeHold ?? null),
      create: jest.fn(),
    },
    ledgerEntry: {
      aggregate: jest
        .fn()
        .mockResolvedValueOnce({ _sum: { amountCents: opts.credits ?? 50000 } })
        .mockResolvedValueOnce({ _sum: { amountCents: opts.debits ?? 0 } }),
    },
    payoutAccount: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: "acct_new", ...data, createdAt: new Date() })),
      findUnique: jest.fn().mockResolvedValue(account),
      findFirst: jest.fn().mockResolvedValue(account),
      findMany: jest.fn().mockResolvedValue([]),
    },
    payout: { findMany: jest.fn() },
    $transaction: jest.fn((fn: (t: MockDb) => Promise<unknown>) => fn(db)),
  } as unknown as PrismaService;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const risk = {
    payoutRiskScore: jest.fn().mockResolvedValue(opts.risk ?? { riskScore: 0, holdRecommended: false }),
  } as unknown as RiskService;
  const jurisdiction = {
    payoutDecisionForCreator: jest.fn().mockResolvedValue(
      opts.allowPayouts === false
        ? { allowAccess: true, allowPayouts: false, reason: "payout_blocked_country" }
        : { allowAccess: true, allowPayouts: true },
    ),
  } as unknown as JurisdictionService;
  return { service: new PayoutsService(prisma, config, risk, jurisdiction), prisma, db, risk, jurisdiction };
}

const user = { id: "creator_1", roles: ["CREATOR"] } as never;

describe("PayoutsService.availableBalance", () => {
  it("derives balance from creator_payable credits minus debits", async () => {
    const { service } = makeHarness({ credits: 80000, debits: 30000 });
    const balance = await service.availableBalance(user);
    expect(balance.availableCents).toBe(50000);
  });
});

describe("PayoutsService.requestPayout gates", () => {
  it("rejects without approved KYC", async () => {
    const { service } = makeHarness({ kycApproved: false });
    await expect(service.requestPayout(user, {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects when the creator's jurisdiction blocks payouts", async () => {
    const { service, db } = makeHarness({ allowPayouts: false });
    await expect(service.requestPayout(user, {})).rejects.toMatchObject({
      message: "payout_blocked_country",
    });
    expect(db.transaction.create).not.toHaveBeenCalled();
  });

  it("rejects when an active hold exists", async () => {
    const { service, prisma } = makeHarness({ activeHold: { id: "hold_1", reason: "ADMIN" } });
    await expect(service.requestPayout(user, {})).rejects.toMatchObject({ message: "payout_on_hold" });
    expect(prisma.ledgerHold.create).not.toHaveBeenCalled();
  });

  it("auto-creates a RISK hold and rejects when the risk score crosses the threshold", async () => {
    const { service, prisma } = makeHarness({ risk: { riskScore: 42, holdRecommended: true } });
    await expect(service.requestPayout(user, {})).rejects.toMatchObject({ message: "payout_on_hold" });
    expect(prisma.ledgerHold.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ creatorId: "creator_1", reason: "RISK" }),
    });
  });

  it("rejects below the minimum payout", async () => {
    const { service } = makeHarness();
    await expect(service.requestPayout(user, { amountCents: 100 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects above the available balance", async () => {
    const { service } = makeHarness({ credits: 10000 });
    await expect(service.requestPayout(user, { amountCents: 20000 })).rejects.toMatchObject({
      message: "insufficient_balance",
    });
  });

  it("rejects when no payout account exists", async () => {
    const { service } = makeHarness({ account: null });
    await expect(service.requestPayout(user, {})).rejects.toMatchObject({
      message: "payout_account_required",
    });
  });
});

describe("PayoutsService.requestPayout success", () => {
  it("reserves funds with balanced ledger entries and a linked payout", async () => {
    const { service, db } = makeHarness({ credits: 50000 });

    const payout = await service.requestPayout(user, { amountCents: 20000 });

    expect(payout.id).toBe("payout_1");
    expect(db.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "PAYOUT", status: "PENDING", grossCents: 20000, feeCents: 0 }),
    });
    const entries = db.ledgerEntry.createMany.mock.calls[0][0].data as Array<{
      accountCode: string;
      direction: string;
      amountCents: number;
    }>;
    expect(entries).toEqual([
      expect.objectContaining({ accountCode: "creator_payable", direction: "DEBIT", amountCents: 20000 }),
      expect.objectContaining({ accountCode: "payout_payable", direction: "CREDIT", amountCents: 20000 }),
    ]);
    expect(db.payout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ transactionId: "txn_1", payoutAccountId: "acct_1", amountCents: 20000 }),
    });
    expect(db.complianceEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eventType: "PAYOUT_REQUESTED" }),
    });
  });

  it("defaults to the full available balance", async () => {
    const { service, db } = makeHarness({ credits: 12345, debits: 0 });
    await service.requestPayout(user, {});
    expect(db.transaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ grossCents: 12345 }),
    });
  });
});

describe("PayoutsService.createAccount", () => {
  it("seals account details and only exposes last4", async () => {
    const { service, prisma } = makeHarness();
    const result = await service.createAccount(user, {
      method: "SEPA",
      accountReference: "DE89370400440532013000",
    });

    const stored = (prisma.payoutAccount.create as jest.Mock).mock.calls[0][0].data;
    expect(stored.detailsSealed).not.toContain("DE89370400440532013000");
    expect(stored.last4).toBe("3000");
    expect(result).not.toHaveProperty("detailsSealed");
    expect(result.last4).toBe("3000");
  });
});
