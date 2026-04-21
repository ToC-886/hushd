import { Injectable } from "@nestjs/common";
import { ComplianceEventType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ComplianceService {
  constructor(private readonly prisma: PrismaService) {}

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
}
