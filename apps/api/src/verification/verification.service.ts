import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ComplianceEventType, VerificationStatus } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { IDV_PROVIDER } from "../integrations/integrations.tokens";
import type { IdVerificationProvider } from "@hushd/shared";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ComplianceService } from "../compliance/compliance.service";
import type { StartVerificationDto } from "./dto/start-verification.dto";

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    @Inject(IDV_PROVIDER) private readonly idv: IdVerificationProvider,
  ) {}

  async startAgeVerification(user: RequestUser, dto: StartVerificationDto) {
    const result = await this.idv.startSession({
      userId: user.id,
      returnUrl: dto.returnUrl,
      locale: dto.locale,
    });
    if (!result.ok) {
      throw new BadRequestException(result.message);
    }

    const record = await this.prisma.ageVerification.create({
      data: {
        userId: user.id,
        vendor: "OTHER",
        vendorSessionId: result.vendorSessionId,
        status: VerificationStatus.PENDING,
        payloadRef: result.redirectUrl ?? null,
      },
    });
    await this.compliance.emit({
      eventType: ComplianceEventType.AGE_VERIFICATION_STARTED,
      userId: user.id,
      payload: { verificationId: record.id },
    });
    return { verificationId: record.id, redirectUrl: result.redirectUrl ?? dto.returnUrl };
  }

  async startIdVerification(user: RequestUser, dto: StartVerificationDto) {
    const result = await this.idv.startSession({
      userId: user.id,
      returnUrl: dto.returnUrl,
      locale: dto.locale,
    });
    if (!result.ok) {
      throw new BadRequestException(result.message);
    }
    const record = await this.prisma.idVerification.create({
      data: {
        userId: user.id,
        vendor: "OTHER",
        vendorSessionId: result.vendorSessionId,
        status: VerificationStatus.PENDING,
        payloadRef: result.redirectUrl ?? null,
      },
    });
    await this.compliance.emit({
      eventType: ComplianceEventType.ID_VERIFICATION_STARTED,
      userId: user.id,
      creatorId: user.id,
      payload: { verificationId: record.id },
    });
    return { verificationId: record.id, redirectUrl: result.redirectUrl ?? dto.returnUrl };
  }

  async adminSetAgeStatus(verificationId: string, status: "APPROVED" | "REJECTED", evidenceRef?: string) {
    const existing = await this.prisma.ageVerification.findUnique({ where: { id: verificationId } });
    if (!existing) throw new NotFoundException("verification_not_found");
    const updated = await this.prisma.ageVerification.update({
      where: { id: verificationId },
      data: {
        status,
        verifiedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await this.compliance.emit({
      eventType:
        status === "APPROVED"
          ? ComplianceEventType.AGE_VERIFICATION_APPROVED
          : ComplianceEventType.AGE_VERIFICATION_REJECTED,
      userId: updated.userId,
      evidenceRef,
      payload: { verificationId },
    });
    return updated;
  }

  async adminSetIdStatus(verificationId: string, status: "APPROVED" | "REJECTED", evidenceRef?: string) {
    const existing = await this.prisma.idVerification.findUnique({ where: { id: verificationId } });
    if (!existing) throw new NotFoundException("verification_not_found");
    const updated = await this.prisma.idVerification.update({
      where: { id: verificationId },
      data: {
        status,
        verifiedAt: status === "APPROVED" ? new Date() : null,
      },
    });
    await this.compliance.emit({
      eventType:
        status === "APPROVED"
          ? ComplianceEventType.ID_VERIFICATION_APPROVED
          : ComplianceEventType.ID_VERIFICATION_REJECTED,
      userId: updated.userId,
      creatorId: updated.userId,
      evidenceRef,
      payload: { verificationId },
    });
    return updated;
  }

  async status(user: RequestUser) {
    const [age, idv] = await Promise.all([
      this.prisma.ageVerification.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.idVerification.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { ageVerification: age, idVerification: idv };
  }

  async applyVendorDecision(decision: {
    userRef: string;
    status: "approved" | "rejected" | "pending";
    vendorSessionId: string;
    payloadRef?: string;
  }) {
    const statusMap = {
      approved: VerificationStatus.APPROVED,
      rejected: VerificationStatus.REJECTED,
      pending: VerificationStatus.PENDING,
    } as const;

    const idRow = await this.prisma.idVerification.findFirst({
      where: { vendorSessionId: decision.vendorSessionId },
      orderBy: { createdAt: "desc" },
    });
    if (!idRow) {
      return { applied: false as const };
    }
    const next = statusMap[decision.status];
    await this.prisma.idVerification.update({
      where: { id: idRow.id },
      data: {
        status: next,
        payloadRef: decision.payloadRef ?? idRow.payloadRef,
        verifiedAt: next === VerificationStatus.APPROVED ? new Date() : null,
      },
    });
    await this.compliance.emit({
      eventType:
        next === VerificationStatus.APPROVED
          ? ComplianceEventType.ID_VERIFICATION_APPROVED
          : next === VerificationStatus.REJECTED
            ? ComplianceEventType.ID_VERIFICATION_REJECTED
            : ComplianceEventType.ID_VERIFICATION_STARTED,
      userId: idRow.userId,
      creatorId: idRow.userId,
      payload: { vendorSessionId: decision.vendorSessionId },
    });
    return { applied: true as const };
  }
}
