import type { ScanAndIngestPayload } from "@hushd/shared";
import type { PrismaClient } from "@prisma/client";
import type { Job } from "bullmq";
import type { CsamScanProvider } from "@hushd/shared";
import { promoteIfClean } from "./promote";
import type { R2Storage } from "./r2-storage";

export type MediaPipelineDeps = {
  prisma: PrismaClient;
  storage: R2Storage;
  csam: CsamScanProvider;
};

export type ProcessResult =
  | { status: "promoted" }
  | { status: "clean"; reason?: string }
  | { status: "match" | "suspect" | "error"; reason: string };

/**
 * Core scan-and-ingest gate. Extracted from the BullMQ wiring in main.ts so
 * the safety-critical decision tree can be unit-tested without a live queue,
 * Redis, or storage backend.
 *
 * - clean     → mark OK, promote staged bytes to durable keys
 * - error     → retry transient scanner failures via BullMQ backoff; otherwise
 *               quarantine and escalate to moderation
 * - match/suspect → never promote; quarantine and escalate (evidence preserved)
 */
export async function processScanAndIngest(
  job: Job<ScanAndIngestPayload>,
  deps: MediaPipelineDeps,
): Promise<ProcessResult> {
  const { prisma, storage, csam } = deps;
  const { mediaId, stagingKey, contentType, sha256, ownerCreatorId, mediaType } = job.data;

  const verdict = await csam.scanObject({
    mediaId,
    stagingObjectKey: stagingKey,
    contentType,
    sha256,
  });

  if (verdict.status === "clean") {
    await prisma.media.update({
      where: { id: mediaId },
      data: { scanStatus: "OK" },
    });
    await promoteIfClean({ mediaId, stagingKey, ownerCreatorId, mediaType }, { prisma, storage });
    return { status: "promoted" };
  }

  if (verdict.status === "error") {
    const configuredAttempts = job.opts.attempts ?? 1;
    const hasRetriesLeft = job.attemptsMade + 1 < configuredAttempts;
    if (verdict.retryable && hasRetriesLeft) {
      // Let BullMQ's exponential backoff retry transient scanner failures
      // instead of quarantining media that was never actually checked.
      throw new Error(`csam_scan_retryable: ${verdict.message}`);
    }
    await prisma.media.update({
      where: { id: mediaId },
      data: {
        scanStatus: "QUARANTINED",
        metadata: { pipelineError: verdict.message },
      },
    });
    await prisma.moderationQueueItem.create({
      data: { targetType: "MEDIA", targetId: mediaId, priority: 100 },
    });
    return { status: verdict.status, reason: verdict.message };
  }

  // match/suspect: staged bytes stay quarantined in the staging bucket —
  // never promoted to public, never auto-deleted — so compliance can meet
  // evidence-preservation/reporting obligations before disposal.
  await prisma.media.update({
    where: { id: mediaId },
    data: {
      scanStatus: verdict.status === "match" ? "BLOCKED" : "QUARANTINED",
      metadata: { reason: verdict.reasonCode },
    },
  });
  await prisma.moderationQueueItem.create({
    data: { targetType: "MEDIA", targetId: mediaId, priority: 100 },
  });
  return { status: verdict.status, reason: verdict.reasonCode };
}
