import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { DMCAStatus, GeoBlockScope, PayoutStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { JurisdictionService } from "../risk/jurisdiction.service";

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jurisdiction: JurisdictionService,
  ) {}

  moderationQueue() {
    return this.prisma.moderationQueueItem.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 200,
    });
  }

  async resolveModeration(id: string, adminUserId: string) {
    const row = await this.prisma.moderationQueueItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("queue_item_not_found");
    const updated = await this.prisma.moderationQueueItem.update({
      where: { id },
      data: { status: "RESOLVED" },
    });
    await this.audit(adminUserId, "moderation_resolved", "moderation_queue_item", id, {
      targetType: row.targetType,
      targetId: row.targetId,
    });
    return updated;
  }

  listPayouts(status?: PayoutStatus) {
    return this.prisma.payout.findMany({
      where: status ? { status } : { status: { in: ["REQUESTED", "APPROVED"] } },
      orderBy: { requestedAt: "asc" },
      take: 200,
      include: {
        creator: { select: { slug: true, displayName: true } },
        payoutAccount: { select: { method: true, last4: true, label: true } },
      },
    });
  }

  async approvePayout(payoutId: string, adminUserId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException("payout_not_found");
    if (payout.status !== "REQUESTED") {
      throw new BadRequestException("payout_not_requested");
    }
    // Jurisdiction can change between request and approval — re-check at the
    // last point where money-out is still preventable.
    const decision = await this.jurisdiction.payoutDecisionForCreator(payout.creatorId);
    if (!decision.allowPayouts) {
      throw new ForbiddenException(decision.reason ?? "payout_blocked_country");
    }
    const updated = await this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "APPROVED",
        approvedByAdminId: adminUserId,
        approvedAt: new Date(),
      },
    });
    await this.emitPayoutEvent("PAYOUT_APPROVED", payout.creatorId, adminUserId, payout.id, {
      amountCents: payout.amountCents,
      currency: payout.currency,
    });
    await this.audit(adminUserId, "payout_approved", "payout", payout.id, {
      amountCents: payout.amountCents,
      currency: payout.currency,
    });
    return updated;
  }

  /**
   * Money left: clear the payout liability and mark the reserving transaction
   * succeeded. Ledger and payout status move atomically.
   */
  async markPayoutPaid(payoutId: string, adminUserId: string, processorRef?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException("payout_not_found");
    if (payout.status !== "APPROVED") {
      throw new BadRequestException("payout_not_approved");
    }
    if (!payout.transactionId) {
      throw new BadRequestException("payout_missing_transaction");
    }
    const transactionId = payout.transactionId;

    const updated = await this.prisma.$transaction(async (db) => {
      await db.ledgerEntry.createMany({
        data: [
          { accountCode: "payout_payable", direction: "DEBIT" as const, amountCents: payout.amountCents },
          { accountCode: "cash_payout_clearing", direction: "CREDIT" as const, amountCents: payout.amountCents },
        ].map((entry) => ({ ...entry, transactionId, currency: payout.currency })),
      });
      await db.transaction.update({
        where: { id: transactionId },
        data: { status: "SUCCEEDED" },
      });
      const paid = await db.payout.update({
        where: { id: payoutId },
        data: {
          status: "PAID",
          paidAt: new Date(),
          processorRef: processorRef ?? payout.processorRef,
        },
      });
      await db.complianceEvent.create({
        data: {
          eventType: "PAYOUT_PAID",
          creatorId: payout.creatorId,
          userId: adminUserId,
          payload: {
            payoutId: payout.id,
            amountCents: payout.amountCents,
            currency: payout.currency,
            processorRef: processorRef ?? null,
          } as Prisma.JsonObject,
        },
      });
      return paid;
    });
    await this.audit(adminUserId, "payout_paid", "payout", payout.id, {
      amountCents: payout.amountCents,
      currency: payout.currency,
      processorRef: processorRef ?? null,
    });
    return updated;
  }

  /**
   * Failed/canceled payouts return the reserved funds to creator_payable —
   * without this the creator's balance would silently shrink.
   */
  async cancelPayout(payoutId: string, adminUserId: string, reason?: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException("payout_not_found");
    if (payout.status !== "REQUESTED" && payout.status !== "APPROVED") {
      throw new BadRequestException("payout_not_open");
    }

    const transactionId = payout.transactionId;

    const updated = await this.prisma.$transaction(async (db) => {
      if (transactionId) {
        await db.ledgerEntry.createMany({
          data: [
            { accountCode: "payout_payable", direction: "DEBIT" as const, amountCents: payout.amountCents },
            { accountCode: "creator_payable", direction: "CREDIT" as const, amountCents: payout.amountCents },
          ].map((entry) => ({ ...entry, transactionId, currency: payout.currency })),
        });
        await db.transaction.update({
          where: { id: transactionId },
          data: { status: "REVERSED" },
        });
      }
      return db.payout.update({
        where: { id: payoutId },
        data: {
          status: "CANCELED",
          failureReason: reason ?? null,
          approvedByAdminId: adminUserId,
        },
      });
    });
    await this.audit(adminUserId, "payout_canceled", "payout", payout.id, {
      amountCents: payout.amountCents,
      currency: payout.currency,
      reason: reason ?? null,
    });
    return updated;
  }

  listHolds() {
    return this.prisma.ledgerHold.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { creator: { select: { slug: true, displayName: true } } },
    });
  }

  async releaseHold(holdId: string, adminUserId: string) {
    const hold = await this.prisma.ledgerHold.findUnique({ where: { id: holdId } });
    if (!hold) throw new NotFoundException("hold_not_found");
    if (!hold.active) return hold;
    const updated = await this.prisma.ledgerHold.update({
      where: { id: holdId },
      data: { active: false, releasedAt: new Date() },
    });
    await this.audit(adminUserId, "ledger_hold_released", "ledger_hold", holdId, {
      creatorId: hold.creatorId,
      reason: hold.reason,
    });
    return updated;
  }

  async fraudDashboard() {
    const [chargebacks, refunds, failedPayouts] = await Promise.all([
      this.prisma.transaction.count({ where: { type: "CHARGEBACK" } }),
      this.prisma.transaction.count({ where: { type: "REFUND" } }),
      this.prisma.payout.count({ where: { status: "FAILED" } }),
    ]);
    return { chargebacks, refunds, failedPayouts };
  }

  listGeoBlocks() {
    return this.prisma.geoBlock.findMany({
      orderBy: [{ countryCode: "asc" }, { scope: "asc" }],
      take: 300,
    });
  }

  async createGeoBlock(adminUserId: string, countryCode: string, scope: GeoBlockScope, reason?: string) {
    const code = countryCode.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) {
      throw new BadRequestException("invalid_country_code");
    }
    const block = await this.prisma.geoBlock.upsert({
      where: { countryCode_scope: { countryCode: code, scope } },
      create: { countryCode: code, scope, reason, active: true },
      update: { reason, active: true },
    });
    await this.prisma.complianceEvent.create({
      data: {
        eventType: "GEO_BLOCK_UPDATED",
        userId: adminUserId,
        jurisdiction: code,
        payload: { active: true, scope, reason: reason ?? null },
      },
    });
    await this.audit(adminUserId, "geo_block_created", "geo_block", block.id, {
      countryCode: code,
      scope,
      reason: reason ?? null,
    });
    return block;
  }

  async removeGeoBlock(adminUserId: string, countryCode: string, scope: GeoBlockScope) {
    const code = countryCode.trim().toUpperCase();
    const block = await this.prisma.geoBlock.findUnique({
      where: { countryCode_scope: { countryCode: code, scope } },
    });
    if (!block) throw new NotFoundException("geo_block_not_found");
    const updated = await this.prisma.geoBlock.update({
      where: { id: block.id },
      data: { active: false },
    });
    await this.prisma.complianceEvent.create({
      data: {
        eventType: "GEO_BLOCK_UPDATED",
        userId: adminUserId,
        jurisdiction: code,
        payload: { active: false, scope },
      },
    });
    await this.audit(adminUserId, "geo_block_removed", "geo_block", block.id, {
      countryCode: code,
      scope,
    });
    return updated;
  }

  listDmcaRequests(status?: DMCAStatus) {
    return this.prisma.dMCARequest.findMany({
      where: status ? { status } : { status: { in: ["RECEIVED", "UNDER_REVIEW"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async updateDmcaStatus(id: string, adminUserId: string, status: DMCAStatus, legalHold?: boolean) {
    const request = await this.prisma.dMCARequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("dmca_request_not_found");
    const updated = await this.prisma.dMCARequest.update({
      where: { id },
      data: {
        status,
        ...(legalHold !== undefined ? { legalHold } : {}),
      },
    });
    await this.audit(adminUserId, "dmca_status_updated", "dmca_request", id, {
      from: request.status,
      to: status,
      legalHold: legalHold ?? request.legalHold,
    });
    return updated;
  }

  auditLogs(params: { entityType?: string; entityId?: string; take?: number }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(params.entityType ? { entityType: params.entityType } : {}),
        ...(params.entityId ? { entityId: params.entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: Math.min(params.take ?? 100, 500),
    });
  }

  async complianceExports(limit = 200) {
    return this.prisma.complianceEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  }

  private async emitPayoutEvent(
    eventType: "PAYOUT_APPROVED" | "PAYOUT_PAID",
    creatorId: string,
    adminUserId: string,
    payoutId: string,
    payload: Prisma.JsonObject,
  ) {
    await this.prisma.complianceEvent.create({
      data: {
        eventType,
        creatorId,
        userId: adminUserId,
        payload: { payoutId, ...payload } as Prisma.JsonObject,
      },
    });
  }

  private async audit(
    adminUserId: string,
    action: string,
    entityType: string,
    entityId: string,
    diff: Prisma.JsonObject,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorType: "ADMIN",
        actorAdminId: adminUserId,
        action,
        entityType,
        entityId,
        diff,
      },
    });
  }
}
