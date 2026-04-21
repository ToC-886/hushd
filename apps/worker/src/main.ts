import { Worker } from "bullmq";
import IORedis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { MEDIA_PIPELINE_QUEUE, type ScanAndIngestPayload } from "@hushd/shared";
import { NoopCsamScanProvider } from "./noop-csam.provider";
import { promoteIfClean } from "./promote";
import { startBillingReconciliationLoop } from "./reconcile";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});
const prisma = new PrismaClient();

const csam = new NoopCsamScanProvider();

const worker = new Worker<ScanAndIngestPayload>(
  MEDIA_PIPELINE_QUEUE,
  async (job) => {
    if (job.name !== "scan_and_ingest") {
      return;
    }
    const verdict = await csam.scanObject({
      mediaId: job.data.mediaId,
      stagingObjectKey: job.data.stagingKey,
      contentType: job.data.contentType,
      sha256: job.data.sha256,
    });

    if (verdict.status === "clean") {
      await prisma.media.update({
        where: { id: job.data.mediaId },
        data: { scanStatus: "OK" },
      });
      await promoteIfClean({
        mediaId: job.data.mediaId,
        stagingKey: job.data.stagingKey,
        ownerCreatorId: job.data.ownerCreatorId,
        mediaType: job.data.mediaType,
      });
      return { status: "promoted" as const };
    }

    // In production: enqueue moderation, delete staging object, alert on-call.
    if (verdict.status === "error") {
      await prisma.media.update({
        where: { id: job.data.mediaId },
        data: {
          scanStatus: "QUARANTINED",
          metadata: { pipelineError: verdict.message },
        },
      });
      await prisma.moderationQueueItem.create({
        data: {
          targetType: "MEDIA",
          targetId: job.data.mediaId,
          priority: 100,
        },
      });
      return { status: verdict.status, reason: verdict.message };
    }
    await prisma.media.update({
      where: { id: job.data.mediaId },
      data: {
        scanStatus: verdict.status === "match" ? "BLOCKED" : "QUARANTINED",
        metadata: { reason: verdict.reasonCode },
      },
    });
    await prisma.moderationQueueItem.create({
      data: {
        targetType: "MEDIA",
        targetId: job.data.mediaId,
        priority: 100,
      },
    });
    return { status: verdict.status, reason: verdict.reasonCode };
  },
  { connection },
);

worker.on("failed", (job, err) => {
  // eslint-disable-next-line no-console
  console.error("job_failed", job?.id, err);
});

// eslint-disable-next-line no-console
console.log(`worker listening on queue ${MEDIA_PIPELINE_QUEUE}`);

startBillingReconciliationLoop();
