import type { ConfigService } from "@nestjs/config";
import { VerificationStatus } from "@prisma/client";
import type { IdVerificationProvider } from "@hushd/shared";
import { VerificationService } from "./verification.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { ComplianceService } from "../compliance/compliance.service";

function makeHarness(configValues: Record<string, string | undefined> = {}) {
  const prisma = {
    ageVerification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    idVerification: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;

  const compliance = { emit: jest.fn().mockResolvedValue(undefined) } as unknown as ComplianceService;
  const config = { get: jest.fn((key: string) => configValues[key]) } as unknown as ConfigService;
  const idv = { vendor: "veriff" } as unknown as IdVerificationProvider;

  const service = new VerificationService(prisma, compliance, config, idv);
  return { service, prisma, compliance };
}

describe("VerificationService.applyVendorDecision", () => {
  const decision = { userRef: "user_1", status: "approved" as const, vendorSessionId: "vsess_1" };

  it("applies decisions to age verifications", async () => {
    const { service, prisma, compliance } = makeHarness();
    (prisma.ageVerification.findFirst as jest.Mock).mockResolvedValue({
      id: "age_1",
      userId: "user_1",
      payloadRef: null,
    });
    (prisma.idVerification.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.applyVendorDecision(decision);

    expect(result).toEqual({ applied: true, targets: ["age"] });
    expect(prisma.ageVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "age_1" },
        data: expect.objectContaining({ status: VerificationStatus.APPROVED }),
      }),
    );
    expect(compliance.emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "AGE_VERIFICATION_APPROVED", userId: "user_1" }),
    );
  });

  it("applies decisions to id verifications and sets a default 5-year expiry", async () => {
    const { service, prisma } = makeHarness();
    (prisma.ageVerification.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.idVerification.findFirst as jest.Mock).mockResolvedValue({
      id: "idv_1",
      userId: "user_1",
      payloadRef: null,
    });

    const before = Date.now();
    const result = await service.applyVendorDecision(decision);

    expect(result).toEqual({ applied: true, targets: ["id"] });
    const updateData = (prisma.idVerification.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.status).toBe(VerificationStatus.APPROVED);
    expect(updateData.expiresAt).toBeInstanceOf(Date);
    const ttlDays = (updateData.expiresAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(ttlDays).toBeGreaterThan(1824);
    expect(ttlDays).toBeLessThan(1826);
  });

  it("leaves expiresAt null for age approvals when age TTL is disabled", async () => {
    const { service, prisma } = makeHarness();
    (prisma.ageVerification.findFirst as jest.Mock).mockResolvedValue({
      id: "age_1",
      userId: "user_1",
      payloadRef: null,
    });
    (prisma.idVerification.findFirst as jest.Mock).mockResolvedValue(null);

    await service.applyVendorDecision(decision);

    const updateData = (prisma.ageVerification.update as jest.Mock).mock.calls[0][0].data;
    expect(updateData.expiresAt).toBeNull();
  });

  it("returns applied: false when no verification matches the session", async () => {
    const { service, prisma } = makeHarness();
    (prisma.ageVerification.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.idVerification.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await service.applyVendorDecision(decision);

    expect(result).toEqual({ applied: false, targets: [] });
    expect(prisma.ageVerification.update).not.toHaveBeenCalled();
    expect(prisma.idVerification.update).not.toHaveBeenCalled();
  });
});
