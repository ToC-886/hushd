import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { sealSecret } from "../auth/secret-crypto";
import { PrismaService } from "../prisma/prisma.service";
import { JurisdictionService } from "../risk/jurisdiction.service";
import { RiskService } from "../risk/risk.service";
import type { CreatePayoutAccountDto } from "./dto/create-payout-account.dto";
import type { RequestPayoutDto } from "./dto/request-payout.dto";

const DEFAULT_MIN_PAYOUT_CENTS = 5000;
const DEV_ENCRYPTION_KEY = "dev-only-insecure-key";

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly risk: RiskService,
    private readonly jurisdiction: JurisdictionService,
  ) {}

  async createAccount(user: RequestUser, dto: CreatePayoutAccountDto) {
    await this.requireCreatorProfile(user.id);
    const account = await this.prisma.payoutAccount.create({
      data: {
        creatorId: user.id,
        method: dto.method,
        label: dto.label,
        currency: dto.currency ?? "EUR",
        detailsSealed: sealSecret(dto.accountReference, this.encryptionKey()),
        last4: dto.accountReference.slice(-4),
      },
    });
    return this.toAccountDto(account);
  }

  async listAccounts(user: RequestUser) {
    const accounts = await this.prisma.payoutAccount.findMany({
      where: { creatorId: user.id, disabledAt: null },
      orderBy: { createdAt: "desc" },
    });
    return accounts.map((account) => this.toAccountDto(account));
  }

  /**
   * Available balance is derived from the double-entry ledger, not a mutable
   * column: credits into creator_payable (earnings) minus debits out
   * (payout reservations, clawbacks). A payout reservation immediately debits
   * creator_payable so the same funds can never be requested twice.
   */
  async availableBalance(user: RequestUser) {
    const [credits, debits] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        _sum: { amountCents: true },
        where: {
          accountCode: "creator_payable",
          direction: "CREDIT",
          transaction: { payeeCreatorId: user.id },
        },
      }),
      this.prisma.ledgerEntry.aggregate({
        _sum: { amountCents: true },
        where: {
          accountCode: "creator_payable",
          direction: "DEBIT",
          transaction: { payeeCreatorId: user.id },
        },
      }),
    ]);
    const availableCents = (credits._sum.amountCents ?? 0) - (debits._sum.amountCents ?? 0);
    return { availableCents: Math.max(availableCents, 0) };
  }

  async requestPayout(user: RequestUser, dto: RequestPayoutDto) {
    await this.requireCreatorProfile(user.id);
    await this.assertKycApproved(user.id);
    await this.assertJurisdictionAllowsPayout(user.id);
    await this.assertNoActiveHold(user.id);
    await this.applyRiskAutoHold(user.id);

    const account = await this.resolvePayoutAccount(user.id, dto.payoutAccountId);
    const { availableCents } = await this.availableBalance(user);
    const amountCents = dto.amountCents ?? availableCents;

    const minCents = Number(this.config.get("PAYOUT_MIN_CENTS") ?? DEFAULT_MIN_PAYOUT_CENTS);
    if (amountCents < minCents) {
      throw new BadRequestException("below_minimum_payout");
    }
    if (amountCents > availableCents) {
      throw new BadRequestException("insufficient_balance");
    }

    const payout = await this.prisma.$transaction(async (db) => {
      const txn = await db.transaction.create({
        data: {
          payerUserId: user.id,
          payeeCreatorId: user.id,
          type: "PAYOUT",
          status: "PENDING",
          grossCents: amountCents,
          feeCents: 0,
          netCents: amountCents,
          currency: account.currency,
          processor: "internal",
          processorTxnId: `payout_${crypto.randomUUID()}`,
        },
      });
      // Reservation: liability moves from creator_payable to payout_payable.
      await db.ledgerEntry.createMany({
        data: [
          { accountCode: "creator_payable", direction: "DEBIT" as const, amountCents },
          { accountCode: "payout_payable", direction: "CREDIT" as const, amountCents },
        ].map((entry) => ({ ...entry, transactionId: txn.id, currency: account.currency })),
      });
      const created = await db.payout.create({
        data: {
          creatorId: user.id,
          payoutAccountId: account.id,
          transactionId: txn.id,
          amountCents,
          currency: account.currency,
        },
      });
      await db.complianceEvent.create({
        data: {
          eventType: "PAYOUT_REQUESTED",
          userId: user.id,
          creatorId: user.id,
          payload: { payoutId: created.id, amountCents, currency: account.currency } as Prisma.JsonObject,
        },
      });
      return created;
    });
    return payout;
  }

  myPayouts(user: RequestUser) {
    return this.prisma.payout.findMany({
      where: { creatorId: user.id },
      orderBy: { requestedAt: "desc" },
      take: 100,
      include: { payoutAccount: { select: { method: true, last4: true, label: true } } },
    });
  }

  private async resolvePayoutAccount(creatorId: string, payoutAccountId?: string) {
    const account = payoutAccountId
      ? await this.prisma.payoutAccount.findUnique({ where: { id: payoutAccountId } })
      : await this.prisma.payoutAccount.findFirst({
          where: { creatorId, disabledAt: null },
          orderBy: { createdAt: "desc" },
        });
    if (!account || account.creatorId !== creatorId || account.disabledAt) {
      throw new BadRequestException("payout_account_required");
    }
    return account;
  }

  private async assertKycApproved(userId: string) {
    const idv = await this.prisma.idVerification.findFirst({
      where: {
        userId,
        status: "APPROVED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (!idv) {
      throw new ForbiddenException("kyc_required_for_payout");
    }
  }

  private async assertJurisdictionAllowsPayout(userId: string) {
    const decision = await this.jurisdiction.payoutDecisionForCreator(userId);
    if (!decision.allowPayouts) {
      throw new ForbiddenException(decision.reason ?? "payout_blocked_country");
    }
  }

  private async assertNoActiveHold(creatorId: string) {
    const hold = await this.prisma.ledgerHold.findFirst({
      where: { creatorId, active: true },
    });
    if (hold) {
      throw new ForbiddenException("payout_on_hold");
    }
  }

  /** Cross the risk threshold and the hold lands before the request proceeds. */
  private async applyRiskAutoHold(creatorId: string) {
    const { riskScore, holdRecommended } = await this.risk.payoutRiskScore(creatorId);
    if (!holdRecommended) return;
    await this.prisma.ledgerHold.create({
      data: {
        creatorId,
        reason: "RISK",
        note: `auto_hold_risk_score_${riskScore}`,
      },
    });
    this.logger.warn(`payout_auto_hold creator=${creatorId} riskScore=${riskScore}`);
    throw new ForbiddenException("payout_on_hold");
  }

  private async requireCreatorProfile(userId: string) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId } });
    if (!creator) {
      throw new ForbiddenException("creator_profile_required");
    }
  }

  private encryptionKey(): string {
    const key = this.config.get<string>("ENCRYPTION_KEY");
    if (key) return key;
    if (this.config.get("NODE_ENV") === "production") {
      throw new Error("ENCRYPTION_KEY must be set in production");
    }
    return DEV_ENCRYPTION_KEY;
  }

  private toAccountDto(account: {
    id: string;
    method: string;
    label: string | null;
    last4: string | null;
    currency: string;
    createdAt: Date;
  }) {
    // detailsSealed never leaves the server.
    return {
      id: account.id,
      method: account.method,
      label: account.label,
      last4: account.last4,
      currency: account.currency,
      createdAt: account.createdAt,
    };
  }
}
