import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  moderationQueue() {
    return this.prisma.moderationQueueItem.findMany({
      where: { status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 200,
    });
  }

  async resolveModeration(id: string) {
    const row = await this.prisma.moderationQueueItem.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("queue_item_not_found");
    return this.prisma.moderationQueueItem.update({
      where: { id },
      data: { status: "RESOLVED" },
    });
  }

  async approvePayout(payoutId: string, adminUserId: string) {
    const payout = await this.prisma.payout.findUnique({ where: { id: payoutId } });
    if (!payout) throw new NotFoundException("payout_not_found");
    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "APPROVED",
        approvedByAdminId: adminUserId,
        approvedAt: new Date(),
      },
    });
  }

  async markPayoutPaid(payoutId: string) {
    return this.prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: "PAID",
        paidAt: new Date(),
      },
    });
  }

  async fraudDashboard() {
    const [chargebacks, refunds, failedPayouts] = await Promise.all([
      this.prisma.transaction.count({ where: { type: "CHARGEBACK" } }),
      this.prisma.transaction.count({ where: { type: "REFUND" } }),
      this.prisma.payout.count({ where: { status: "FAILED" } }),
    ]);
    return { chargebacks, refunds, failedPayouts };
  }

  async complianceExports(limit = 200) {
    return this.prisma.complianceEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: limit,
    });
  }
}
