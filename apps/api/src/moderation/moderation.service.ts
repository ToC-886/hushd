import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ModerationQueueStatus, ReportTargetType } from "@prisma/client";
import type { RequestUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateDmcaDto } from "./dto/create-dmca.dto";
import type { CreateReportDto } from "./dto/create-report.dto";

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(user: RequestUser, dto: CreateReportDto) {
    await this.assertTargetExists(dto.targetType, dto.targetId);

    const report = await this.prisma.contentReport.create({
      data: {
        reporterId: user.id,
        targetType: dto.targetType,
        targetId: dto.targetId,
        reason: dto.reason,
      },
    });

    // One open queue item per target — repeat reports raise priority instead
    // of flooding the queue with duplicates.
    const openItem = await this.prisma.moderationQueueItem.findFirst({
      where: {
        targetType: dto.targetType,
        targetId: dto.targetId,
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
    });
    if (openItem) {
      await this.prisma.moderationQueueItem.update({
        where: { id: openItem.id },
        data: { priority: Math.min(openItem.priority + 10, 100) },
      });
    } else {
      await this.prisma.moderationQueueItem.create({
        data: {
          targetType: dto.targetType,
          targetId: dto.targetId,
          priority: 50,
        },
      });
    }
    return report;
  }

  myReports(user: RequestUser) {
    return this.prisma.contentReport.findMany({
      where: { reporterId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  submitDmca(dto: CreateDmcaDto) {
    return this.prisma.dMCARequest.create({
      data: {
        claimantRef: dto.claimantRef,
        targetRefs: dto.targetRefs,
        notesRef: dto.notesRef,
      },
    });
  }

  listQueue(status?: ModerationQueueStatus) {
    return this.prisma.moderationQueueItem.findMany({
      where: status ? { status } : { status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 200,
    });
  }

  async triageReport(reportId: string, moderatorId: string, status: "TRIAGED" | "RESOLVED" | "DISMISSED") {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException("report_not_found");

    const queueStatus = status === "TRIAGED" ? "IN_PROGRESS" : "RESOLVED";
    const [updated] = await this.prisma.$transaction([
      this.prisma.contentReport.update({
        where: { id: reportId },
        data: {
          status,
          assignedModeratorId: moderatorId,
        },
      }),
      this.prisma.moderationQueueItem.updateMany({
        where: {
          targetType: report.targetType,
          targetId: report.targetId,
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: queueStatus },
      }),
    ]);
    return updated;
  }

  private async assertTargetExists(targetType: ReportTargetType, targetId: string) {
    const exists = await (async () => {
      switch (targetType) {
        case "POST":
          return this.prisma.post.findUnique({ where: { id: targetId }, select: { id: true } });
        case "MEDIA":
          return this.prisma.media.findUnique({ where: { id: targetId }, select: { id: true } });
        case "MESSAGE":
          return this.prisma.message.findUnique({ where: { id: targetId }, select: { id: true } });
        case "USER":
          return this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
        default: {
          const exhaustive: never = targetType;
          throw new BadRequestException(`unknown_target_type: ${String(exhaustive)}`);
        }
      }
    })();
    if (!exists) {
      throw new NotFoundException("report_target_not_found");
    }
  }
}
