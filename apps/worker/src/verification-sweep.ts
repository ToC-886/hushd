import { ComplianceEventType, PrismaClient, VerificationStatus } from "@prisma/client";

const SWEEP_BATCH_SIZE = 500;

/**
 * Marks approved verifications whose expiresAt has passed as EXPIRED and
 * emits compliance events. The API policy guard already treats expired
 * approvals as unverified; this sweep makes the state explicit so users can
 * be prompted to re-verify.
 */
async function sweepOnce(prisma: PrismaClient) {
  const now = new Date();

  const expiredAge = await prisma.ageVerification.findMany({
    where: { status: VerificationStatus.APPROVED, expiresAt: { lt: now } },
    select: { id: true, userId: true },
    take: SWEEP_BATCH_SIZE,
  });
  for (const row of expiredAge) {
    await prisma.ageVerification.update({
      where: { id: row.id },
      data: { status: VerificationStatus.EXPIRED },
    });
    await prisma.complianceEvent.create({
      data: {
        eventType: ComplianceEventType.AGE_VERIFICATION_EXPIRED,
        userId: row.userId,
        payload: { verificationId: row.id },
      },
    });
  }

  const expiredId = await prisma.idVerification.findMany({
    where: { status: VerificationStatus.APPROVED, expiresAt: { lt: now } },
    select: { id: true, userId: true },
    take: SWEEP_BATCH_SIZE,
  });
  for (const row of expiredId) {
    await prisma.idVerification.update({
      where: { id: row.id },
      data: { status: VerificationStatus.EXPIRED },
    });
    await prisma.complianceEvent.create({
      data: {
        eventType: ComplianceEventType.ID_VERIFICATION_EXPIRED,
        userId: row.userId,
        creatorId: row.userId,
        payload: { verificationId: row.id },
      },
    });
  }

  if (expiredAge.length > 0 || expiredId.length > 0) {
    // eslint-disable-next-line no-console
    console.log("verification_expiry_sweep", {
      ageExpired: expiredAge.length,
      idExpired: expiredId.length,
      at: now.toISOString(),
    });
  }
}

export function startVerificationExpirySweep(prisma: PrismaClient) {
  const enabled = process.env.VERIFICATION_EXPIRY_SWEEP_ENABLED !== "false";
  if (!enabled) return;
  const intervalMs = Number(process.env.VERIFICATION_EXPIRY_SWEEP_INTERVAL_MS ?? 60 * 60 * 1000);

  const runOnce = () => {
    sweepOnce(prisma).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("verification_expiry_sweep_failed", err instanceof Error ? err.message : String(err));
    });
  };

  runOnce();
  setInterval(runOnce, intervalMs).unref();
}
