import { Injectable, NotFoundException } from "@nestjs/common";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateReportDto } from "./dto/create-report.dto";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(user: RequestUser, dto: CreateReportDto) {
    const report = await this.prisma.contentReport.create({
      data: {
        reporterId: user.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });
    await this.prisma.moderationQueueItem.create({
      data: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        priority: 50,
      },
    });
    return report;
  }

  myReports(user: RequestUser) {
    return this.prisma.contentReport.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async triageReport(reportId: string, moderatorId: string, status: "TRIAGED" | "RESOLVED" | "DISMISSED") {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("report_not_found");
    return this.prisma.contentReport.update({
      where: { id: reportId },
      data: {
        status,
        assignedModeratorId: moderatorId,
      },
    });
  }
}
