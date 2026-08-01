import { NotFoundException } from "@nestjs/common";
import { ModerationService } from "./moderation.service";
import type { PrismaService } from "../prisma/prisma.service";

function makeHarness(openQueueItem: unknown = null) {
  const prisma = {
    post: { findUnique: jest.fn().mockResolvedValue({ id: "post_1" }) },
    media: { findUnique: jest.fn().mockResolvedValue(null) },
    message: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    contentReport: {
      create: jest.fn().mockResolvedValue({ id: "report_1" }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    moderationQueueItem: {
      findFirst: jest.fn().mockResolvedValue(openQueueItem),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;
  return { service: new ModerationService(prisma), prisma };
}

describe("ModerationService.createReport", () => {
  const reporter = { id: "user_1" } as never;
  const dto = { targetType: "POST" as const, targetId: "post_1", reason: "spam" };

  it("creates a queue item when none is open for the target", async () => {
    const { service, prisma } = makeHarness(null);
    await service.createReport(reporter, dto);
    expect(prisma.moderationQueueItem.create).toHaveBeenCalledWith({
      data: { targetType: "POST", targetId: "post_1", priority: 50 },
    });
  });

  it("bumps priority on the existing open item instead of duplicating it", async () => {
    const { service, prisma } = makeHarness({ id: "item_1", priority: 50, status: "PENDING" });
    await service.createReport(reporter, dto);
    expect(prisma.moderationQueueItem.create).not.toHaveBeenCalled();
    expect(prisma.moderationQueueItem.update).toHaveBeenCalledWith({
      where: { id: "item_1" },
      data: { priority: 60 },
    });
  });

  it("rejects reports against non-existent targets", async () => {
    const { service, prisma } = makeHarness();
    (prisma.post.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.createReport(reporter, dto)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("ModerationService.triageReport", () => {
  it("closes the queue item when the report is resolved", async () => {
    const { service, prisma } = makeHarness();
    (prisma.contentReport.findUnique as jest.Mock).mockResolvedValue({
      id: "report_1",
      targetType: "POST",
      targetId: "post_1",
    });

    await service.triageReport("report_1", "admin_1", "RESOLVED");

    expect(prisma.moderationQueueItem.updateMany).toHaveBeenCalledWith({
      where: { targetType: "POST", targetId: "post_1", status: { in: ["PENDING", "IN_PROGRESS"] } },
      data: { status: "RESOLVED" },
    });
  });

  it("moves the queue item to IN_PROGRESS when triaged", async () => {
    const { service, prisma } = makeHarness();
    (prisma.contentReport.findUnique as jest.Mock).mockResolvedValue({
      id: "report_1",
      targetType: "POST",
      targetId: "post_1",
    });

    await service.triageReport("report_1", "admin_1", "TRIAGED");

    expect(prisma.moderationQueueItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "IN_PROGRESS" } }),
    );
  });

  it("throws for unknown reports", async () => {
    const { service, prisma } = makeHarness();
    (prisma.contentReport.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.triageReport("nope", "admin_1", "RESOLVED")).rejects.toBeInstanceOf(NotFoundException);
  });
});
