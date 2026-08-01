import { Injectable } from "@nestjs/common";
import { evaluateJurisdictionPolicy, type JurisdictionDecision } from "@hushd/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Payout eligibility by creator jurisdiction. ACCESS-scoped geo blocks deny
 * platform access entirely (enforced globally by GeoBlockGuard) and therefore
 * also deny payouts; PAYOUTS-scoped blocks allow usage but block money-out.
 * A creator without a declared country is not blocked here — KYC review is
 * the gate for unknown jurisdictions.
 */
@Injectable()
export class JurisdictionService {
  constructor(private readonly prisma: PrismaService) {}

  async payoutDecisionForCreator(creatorUserId: string): Promise<JurisdictionDecision> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId: creatorUserId },
      select: { countryCode: true },
    });
    const code = profile?.countryCode?.trim().toUpperCase();
    if (!code) {
      return { allowAccess: true, allowPayouts: true };
    }
    const blocks = await this.prisma.geoBlock.findMany({
      where: { active: true },
      select: { countryCode: true, scope: true },
    });
    const accessBlocked = blocks.filter((b) => b.scope === "ACCESS").map((b) => b.countryCode);
    return evaluateJurisdictionPolicy({
      countryCode: code,
      restrictedCountries: accessBlocked,
      payoutBlockedCountries: blocks.map((b) => b.countryCode),
    });
  }
}
