import type { ScanAndIngestPayload, ScanVerdict } from "@hushd/shared";
import type { Job } from "bullmq";
import type { PrismaClient } from "@prisma/client";
import { processScanAndIngest, type MediaPipelineDeps } from "./media-pipeline";
import type { R2Storage } from "./r2-storage";

const BASE_PAYLOAD: ScanAndIngestPayload = {
  mediaId: "media-1",
  ownerCreatorId: "creator-1",
  stagingKey: "staging/creator-1/media-1",
  mediaType: "IMAGE",
  contentType: "image/jpeg",
  sha256: "a".repeat(64),
};

type MockPrisma = {
  media: { update: jest.Mock };
  moderationQueueItem: { create: jest.Mock };
};

function makeJob(overrides: Partial<Job<ScanAndIngestPayload>> = {}): Job<ScanAndIngestPayload> {
  return {
    name: "scan_and_ingest",
    data: { ...BASE_PAYLOAD },
    attemptsMade: 0,
    opts: { attempts: 1 },
    ...overrides,
  } as unknown as Job<ScanAndIngestPayload>;
}

function makeDeps(scan: () => Promise<ScanVerdict>) {
  const prisma: MockPrisma = {
    media: { update: jest.fn().mockResolvedValue({}) },
    moderationQueueItem: { create: jest.fn().mockResolvedValue({}) },
  };
  const storage = {
    promoteObject: jest.fn().mockResolvedValue(true),
    signPublicGetUrl: jest.fn().mockResolvedValue(null),
    isConfigured: jest.fn().mockReturnValue(true),
  } as unknown as R2Storage;
  const csam = { id: "test_csam", scanObject: jest.fn(scan) };
  const deps: MediaPipelineDeps = {
    prisma: prisma as unknown as PrismaClient,
    storage,
    csam,
  };
  return { deps, prisma, storage, csam };
}

describe("processScanAndIngest", () => {
  it("promotes clean media and marks scanStatus OK", async () => {
    const { deps, prisma, storage } = makeDeps(async () => ({ status: "clean" }));

    const result = await processScanAndIngest(makeJob(), deps);

    expect(result).toEqual({ status: "promoted" });
    expect(prisma.media.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "media-1" }, data: { scanStatus: "OK" } }),
    );
    expect(storage.promoteObject).toHaveBeenCalledWith(
      "staging/creator-1/media-1",
      expect.stringContaining("media-1"),
    );
    expect(prisma.moderationQueueItem.create).not.toHaveBeenCalled();
  });

  it("blocks media on a CSAM match and escalates to moderation", async () => {
    const { deps, prisma, storage } = makeDeps(async () => ({
      status: "match",
      reasonCode: "sha256_hashlist_match",
    }));

    const result = await processScanAndIngest(makeJob(), deps);

    expect(result).toEqual({ status: "match", reason: "sha256_hashlist_match" });
    expect(prisma.media.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "media-1" },
        data: expect.objectContaining({ scanStatus: "BLOCKED" }),
      }),
    );
    expect(prisma.moderationQueueItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ targetType: "MEDIA", targetId: "media-1", priority: 100 }),
      }),
    );
    // Never promoted to the public bucket on a match.
    expect(storage.promoteObject).not.toHaveBeenCalled();
  });

  it("quarantines suspect media and escalates to moderation", async () => {
    const { deps, prisma } = makeDeps(async () => ({ status: "suspect", reasonCode: "heuristic_flag" }));

    const result = await processScanAndIngest(makeJob(), deps);

    expect(result).toEqual({ status: "suspect", reason: "heuristic_flag" });
    expect(prisma.media.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ scanStatus: "QUARANTINED" }) }),
    );
    expect(prisma.moderationQueueItem.create).toHaveBeenCalled();
  });

  it("throws for retryable scanner errors when retries remain (BullMQ backoff)", async () => {
    const { deps, prisma } = makeDeps(async () => ({
      status: "error",
      retryable: true,
      message: "scanner_timeout",
    }));
    // 3 attempts configured, this is the first try → retries remain.
    const job = makeJob({ attemptsMade: 0, opts: { attempts: 3 } });

    await expect(processScanAndIngest(job, deps)).rejects.toThrow("csam_scan_retryable: scanner_timeout");
    // Nothing persisted: the job should be retried, not quarantined.
    expect(prisma.media.update).not.toHaveBeenCalled();
    expect(prisma.moderationQueueItem.create).not.toHaveBeenCalled();
  });

  it("quarantines retryable scanner errors once retries are exhausted", async () => {
    const { deps, prisma } = makeDeps(async () => ({
      status: "error",
      retryable: true,
      message: "scanner_timeout",
    }));
    // Final attempt (attemptsMade 2 of 3) → no retries left.
    const job = makeJob({ attemptsMade: 2, opts: { attempts: 3 } });

    const result = await processScanAndIngest(job, deps);

    expect(result).toEqual({ status: "error", reason: "scanner_timeout" });
    expect(prisma.media.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ scanStatus: "QUARANTINED" }) }),
    );
    expect(prisma.moderationQueueItem.create).toHaveBeenCalled();
  });

  it("quarantines non-retryable scanner errors immediately", async () => {
    const { deps, prisma } = makeDeps(async () => ({
      status: "error",
      retryable: false,
      message: "unsupported_content",
    }));

    const result = await processScanAndIngest(makeJob(), deps);

    expect(result).toEqual({ status: "error", reason: "unsupported_content" });
    expect(prisma.media.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ scanStatus: "QUARANTINED" }) }),
    );
    expect(prisma.moderationQueueItem.create).toHaveBeenCalled();
  });
});
