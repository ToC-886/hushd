import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Queue } from "bullmq";
import { MediaService } from "./media.service";
import type { R2SignerService } from "./r2-signer.service";
import type { SignedUrlPolicy } from "./signed-url.policy";
import type { PrismaService } from "../prisma/prisma.service";

function makeHarness(media: unknown = null) {
  const prisma = {
    media: {
      findUnique: jest.fn().mockResolvedValue(media),
      upsert: jest.fn(),
      update: jest.fn(),
    },
  } as unknown as PrismaService;
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const signer = {
    signStagingPut: jest.fn().mockResolvedValue("https://example.invalid/upload"),
  } as unknown as R2SignerService;
  const urls = {
    stagingPutTtlSeconds: jest.fn().mockReturnValue(900),
  } as unknown as SignedUrlPolicy;
  const queue = { add: jest.fn().mockResolvedValue({ id: "job_1" }) } as unknown as Queue;
  return { service: new MediaService(config, prisma, signer, urls, queue as never), prisma, queue };
}

describe("MediaService.initUpload validation", () => {
  const base = {
    ownerCreatorId: "creator_1",
    mediaType: "IMAGE" as const,
    contentType: "image/jpeg",
    byteSize: 1024,
  };

  it("rejects missing content type", async () => {
    const { service } = makeHarness();
    await expect(
      service.initUpload({ ...base, contentType: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects content types outside the per-type allowlist", async () => {
    const { service } = makeHarness();
    await expect(service.initUpload({ ...base, contentType: "text/html" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects executable uploads for video type", async () => {
    const { service } = makeHarness();
    await expect(
      service.initUpload({
        ...base,
        mediaType: "VIDEO",
        contentType: "application/x-msdownload",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects files above the size cap", async () => {
    const { service } = makeHarness();
    await expect(
      service.initUpload({ ...base, byteSize: 600 * 1024 * 1024 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("accepts a valid image upload and returns a staging target", async () => {
    const { service } = makeHarness();
    const result = await service.initUpload(base);
    expect(result.stagingKey).toMatch(/^staging\/creator_1\//);
    expect(result.expiresInSeconds).toBe(900);
  });
});

describe("MediaService.completeUpload", () => {
  const params = {
    mediaId: "media_1",
    ownerCreatorId: "creator_1",
    stagingKey: "staging/creator_1/media_1",
    mediaType: "IMAGE" as const,
  };

  it("rejects when the media row does not exist or is not owned", async () => {
    const { service } = makeHarness(null);
    await expect(service.completeUpload(params)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects a caller-supplied staging key that was never issued", async () => {
    const { service, queue } = makeHarness({
      id: "media_1",
      ownerCreatorId: "creator_1",
      r2StagingKey: "staging/creator_1/media_1",
    });
    await expect(service.completeUpload({ ...params, stagingKey: "staging/other/evil" })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("enqueues the scan job for a valid completion", async () => {
    const { service, queue } = makeHarness({
      id: "media_1",
      ownerCreatorId: "creator_1",
      r2StagingKey: "staging/creator_1/media_1",
    });
    const result = await service.completeUpload(params);
    expect(result.jobId).toBe("job_1");
    expect(queue.add).toHaveBeenCalledWith(
      "scan_and_ingest",
      expect.objectContaining({ mediaId: "media_1", stagingKey: "staging/creator_1/media_1" }),
    );
  });
});
