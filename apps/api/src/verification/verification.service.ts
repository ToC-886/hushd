import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ComplianceEventType, VerificationStatus, VerificationVendor } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { IDV_PROVIDER } from "../integrations/integrations.tokens";
import type { IdVerificationProvider } from "@hushd/shared";
import { Inject } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ComplianceService } from "../compliance/compliance.service";
import type { StartVerificationDto } from "./dto/start-verification.dto";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_ID_TTL_DAYS = 1825; // government IDs are typically valid ~5 years
const DEFAULT_AGE_TTL_DAYS = 0; // 0 = age attestation never expires

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly config: ConfigService,
    @Inject(IDV_PROVIDER) private readonly idv: IdVerificationProvider,
  ) {}

  private vendorEnum(): VerificationVendor {
    switch (this.idv.vendor) {
      case "veriff":
        return VerificationVendor.VERIFF;
      case "jumio":
        return VerificationVendor.JUMIO;
      case "onfido":
        return VerificationVendor.ONFIDO;
      default:
        return VerificationVendor.OTHER;
    }
  }

  private expiryFor(kind: "age" | "id"): Date | null {
    const envKey = kind === "age" ? "IDV_AGE_TTL_DAYS" : "IDV_ID_TTL_DAYS";
    const fallback = kind === "age" ? DEFAULT_AGE_TTL_DAYS : DEFAULT_ID_TTL_DAYS;
    const raw = this.config.get<string>(envKey);
    const days = raw !== undefined && raw !== "" ? Number(raw) : fallback;
    if (!Number.isFinite(days) || days <= 0) return null;
    return new Date(Date.now() + days * DAY_MS);
  }

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
        vendor: this.vendorEnum(),
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
        vendor: this.vendorEnum(),
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
        expiresAt: status === "APPROVED" ? this.expiryFor("age") : null,
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
        expiresAt: status === "APPROVED" ? this.expiryFor("id") : null,
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
    const next = statusMap[decision.status];
    const targets: Array<"age" | "id"> = [];

    const ageRow = await this.prisma.ageVerification.findFirst({
      where: { vendorSessionId: decision.vendorSessionId },
      orderBy: { createdAt: "desc" },
    });
    if (ageRow) {
      await this.prisma.ageVerification.update({
        where: { id: ageRow.id },
        data: {
          status: next,
          payloadRef: decision.payloadRef ?? ageRow.payloadRef,
          verifiedAt: next === VerificationStatus.APPROVED ? new Date() : null,
          expiresAt: next === VerificationStatus.APPROVED ? this.expiryFor("age") : null,
        },
      });
      await this.compliance.emit({
        eventType:
          next === VerificationStatus.APPROVED
            ? ComplianceEventType.AGE_VERIFICATION_APPROVED
            : next === VerificationStatus.REJECTED
              ? ComplianceEventType.AGE_VERIFICATION_REJECTED
              : ComplianceEventType.AGE_VERIFICATION_STARTED,
        userId: ageRow.userId,
        payload: { vendorSessionId: decision.vendorSessionId },
      });
      targets.push("age");
    }

    const idRow = await this.prisma.idVerification.findFirst({
      where: { vendorSessionId: decision.vendorSessionId },
      orderBy: { createdAt: "desc" },
    });
    if (idRow) {
      await this.prisma.idVerification.update({
        where: { id: idRow.id },
        data: {
          status: next,
          payloadRef: decision.payloadRef ?? idRow.payloadRef,
          verifiedAt: next === VerificationStatus.APPROVED ? new Date() : null,
          expiresAt: next === VerificationStatus.APPROVED ? this.expiryFor("id") : null,
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
      targets.push("id");
    }

    return { applied: targets.length > 0, targets };
  }
}
