import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ComplianceEventType, Prisma } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { sealSecret } from "../auth/secret-crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { Submit2257Dto } from "./dto/submit-2257.dto";

const DEV_ENCRYPTION_KEY = "dev-only-insecure-key";
const MIN_AGE_YEARS = 18;

@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async emit(params: {
    eventType: ComplianceEventType;
    userId?: string;
    creatorId?: string;
    jurisdiction?: string;
    evidenceRef?: string;
    payload?: Prisma.JsonObject;
  }) {
    await this.prisma.complianceEvent.create({
      data: {
        eventType: params.eventType,
        userId: params.userId,
        creatorId: params.creatorId,
        jurisdiction: params.jurisdiction,
        evidenceRef: params.evidenceRef,
        payload: (params.payload ?? {}) as Prisma.JsonObject,
      },
    });
  }

  /**
   * 18 U.S.C. §2257 age/identity record. PII is AES-256-GCM sealed at rest;
   * the API only ever returns non-sensitive metadata.
   */
  async submit2257Record(user: RequestUser, dto: Submit2257Dto) {
    const creator = await this.prisma.creatorProfile.findUnique({ where: { userId: user.id } });
    if (!creator) {
      throw new ForbiddenException("creator_profile_required");
    }
    const dob = new Date(dto.dateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob > new Date()) {
      throw new BadRequestException("invalid_date_of_birth");
    }
    if (ageYears(dob) < MIN_AGE_YEARS) {
      throw new BadRequestException("must_be_18_or_older");
    }

    const key = this.encryptionKey();
    const record = await this.prisma.id2257Record.upsert({
      where: { creatorId: user.id },
      create: {
        creatorId: user.id,
        legalNameSealed: sealSecret(dto.legalFullName, key),
        dateOfBirth: dob,
        documentType: dto.documentType,
        documentRefSealed: sealSecret(dto.documentNumber, key),
        issuedBy: dto.issuedBy,
      },
      update: {
        legalNameSealed: sealSecret(dto.legalFullName, key),
        dateOfBirth: dob,
        documentType: dto.documentType,
        documentRefSealed: sealSecret(dto.documentNumber, key),
        issuedBy: dto.issuedBy,
      },
    });

    await this.emit({
      eventType: "ID2257_RECORD_SUBMITTED",
      userId: user.id,
      creatorId: user.id,
      payload: { recordId: record.id, documentType: dto.documentType },
    });
    return toPublic2257(record);
  }

  async my2257Record(user: RequestUser) {
    const record = await this.prisma.id2257Record.findUnique({ where: { creatorId: user.id } });
    if (!record) throw new NotFoundException("record_not_found");
    return toPublic2257(record);
  }

  /** Admin listing — sealed fields intentionally excluded. */
  async list2257Records() {
    const records = await this.prisma.id2257Record.findMany({
      orderBy: { submittedAt: "desc" },
      take: 200,
      include: { creator: { select: { slug: true, displayName: true } } },
    });
    return records.map((record) => ({
      ...toPublic2257(record),
      creator: record.creator,
    }));
  }

  private encryptionKey(): string {
    const key = this.config.get<string>("ENCRYPTION_KEY");
    if (key) return key;
    if (this.config.get("NODE_ENV") === "production") {
      throw new Error("ENCRYPTION_KEY must be set in production");
    }
    return DEV_ENCRYPTION_KEY;
  }
}

function ageYears(dob: Date): number {
  const now = new Date();
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getUTCDate() < dob.getUTCDate())) {
    years -= 1;
  }
  return years;
}

function toPublic2257(record: {
  id: string;
  dateOfBirth: Date;
  documentType: string;
  issuedBy: string | null;
  submittedAt: Date;
  updatedAt: Date;
}) {
  return {
    id: record.id,
    dateOfBirth: record.dateOfBirth,
    documentType: record.documentType,
    issuedBy: record.issuedBy,
    submittedAt: record.submittedAt,
    updatedAt: record.updatedAt,
  };
}
