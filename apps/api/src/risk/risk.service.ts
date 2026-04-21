import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RiskService {
  constructor(private readonly prisma: PrismaService) {}

  async payoutRiskScore(creatorId: string) {
    const [chargebacks, refunds, volume] = await Promise.all([
      this.prisma.transaction.count({ where: { payeeCreatorId: creatorId, type: "CHARGEBACK" } }),
      this.prisma.transaction.count({ where: { payeeCreatorId: creatorId, type: "REFUND" } }),
      this.prisma.transaction.count({ where: { payeeCreatorId: creatorId, status: "SUCCEEDED" } }),
    ]);
    const ratioBase = Math.max(volume, 1);
    const risk = Math.min(100, Math.round(((chargebacks * 4 + refunds * 2) / ratioBase) * 100));
    const hold = risk >= Number(process.env.PAYOUT_HOLD_SCORE_THRESHOLD ?? 30);
    return { creatorId, riskScore: risk, holdRecommended: hold };
  }
}
