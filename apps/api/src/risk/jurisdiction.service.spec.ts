import { JurisdictionService } from "./jurisdiction.service";
import type { PrismaService } from "../prisma/prisma.service";

function makeHarness(opts: { countryCode?: string | null; blocks?: Array<{ countryCode: string; scope: string }> }) {
  const prisma = {
    creatorProfile: {
      findUnique: jest.fn().mockResolvedValue(
        opts.countryCode === undefined ? null : { countryCode: opts.countryCode },
      ),
    },
    geoBlock: {
      findMany: jest.fn().mockResolvedValue(opts.blocks ?? []),
    },
  } as unknown as PrismaService;
  return { service: new JurisdictionService(prisma), prisma };
}

describe("JurisdictionService.payoutDecisionForCreator", () => {
  it("allows payouts when the creator has no profile yet (KYC is the gate)", async () => {
    const { service } = makeHarness({ countryCode: undefined });
    const decision = await service.payoutDecisionForCreator("user_1");
    expect(decision.allowPayouts).toBe(true);
  });

  it("allows payouts when no country is declared", async () => {
    const { service } = makeHarness({ countryCode: null, blocks: [{ countryCode: "IR", scope: "ACCESS" }] });
    const decision = await service.payoutDecisionForCreator("user_1");
    expect(decision.allowPayouts).toBe(true);
  });

  it("denies payouts for ACCESS-blocked countries", async () => {
    const { service } = makeHarness({ countryCode: "ir", blocks: [{ countryCode: "IR", scope: "ACCESS" }] });
    const decision = await service.payoutDecisionForCreator("user_1");
    expect(decision.allowPayouts).toBe(false);
    expect(decision.reason).toBe("geo_blocked");
  });

  it("denies payouts for PAYOUTS-scoped blocks while the policy still allows access", async () => {
    const { service } = makeHarness({ countryCode: "CU", blocks: [{ countryCode: "CU", scope: "PAYOUTS" }] });
    const decision = await service.payoutDecisionForCreator("user_1");
    expect(decision.allowAccess).toBe(true);
    expect(decision.allowPayouts).toBe(false);
    expect(decision.reason).toBe("payout_blocked_country");
  });

  it("allows payouts for creators outside all blocked lists", async () => {
    const { service } = makeHarness({
      countryCode: "DE",
      blocks: [
        { countryCode: "IR", scope: "ACCESS" },
        { countryCode: "CU", scope: "PAYOUTS" },
      ],
    });
    const decision = await service.payoutDecisionForCreator("user_1");
    expect(decision.allowPayouts).toBe(true);
  });
});
