import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MediaType } from "@prisma/client";
import type { Queue } from "bullmq";
import type { ScanAndIngestPayload } from "@hushd/shared";
import { MEDIA_PIPELINE_QUEUE_TOKEN } from "../queue/queue.module";
import { PrismaService } from "../prisma/prisma.service";
import { R2SignerService } from "./r2-signer.service";
import { SignedUrlPolicy } from "./signed-url.policy";

export type InitUploadBody = {
  ownerCreatorId: string;
  mediaType: ScanAndIngestPayload["mediaType"];
  contentType?: string;
  byteSize?: number;
};

export type InitUploadResult = {
  mediaId: string;
  stagingKey: string;
  /** Presigned PUT URL — implement with @aws-sdk/client-s3 presigner against R2 staging prefix. */
  uploadUrl: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
};

@Injectable()
export class MediaService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly signer: R2SignerService,
    private readonly urls: SignedUrlPolicy,
    @Inject(MEDIA_PIPELINE_QUEUE_TOKEN) private readonly mediaQueue: Queue<ScanAndIngestPayload>,
  ) {}

  /**
   * Creates a logical media row id and returns a **staging-only** upload target.
   * The browser uploads directly to object storage; nothing is promoted until the worker passes CSAM scanning.
   */
  async initUpload(body: InitUploadBody): Promise<InitUploadResult> {
    const mediaId = crypto.randomUUID();
    const stagingPrefix = this.config.get<string>("R2_STAGING_PREFIX") ?? "staging/";
    const stagingKey = `${stagingPrefix}${body.ownerCreatorId}/${mediaId}`;

    const bucket = this.config.get<string>("R2_BUCKET_STAGING") ?? "local-staging";
    const uploadUrl = await this.signer.signStagingPut({
      bucket,
      key: stagingKey,
      contentType: body.contentType,
      expiresInSeconds: this.urls.stagingPutTtlSeconds(),
    });

    await this.prisma.media.upsert({
      where: { id: mediaId },
      create: {
        id: mediaId,
        ownerCreatorId: body.ownerCreatorId,
        type: body.mediaType as MediaType,
        r2StagingKey: stagingKey,
        scanStatus: "PENDING",
      },
      update: {
        r2StagingKey: stagingKey,
        scanStatus: "PENDING",
      },
    });

    return {
      mediaId,
      stagingKey,
      uploadUrl,
      headers: {
        "content-type": body.contentType ?? "application/octet-stream",
      },
      expiresInSeconds: this.urls.stagingPutTtlSeconds(),
    };
  }

  async completeUpload(params: {
    mediaId: string;
    ownerCreatorId: string;
    stagingKey: string;
    mediaType: ScanAndIngestPayload["mediaType"];
    contentType?: string;
    sha256?: string;
  }): Promise<{ jobId: string | undefined }> {
    await this.prisma.media.update({
      where: { id: params.mediaId },
      data: {
        ownerCreatorId: params.ownerCreatorId,
        r2StagingKey: params.stagingKey,
        type: params.mediaType as MediaType,
        scanStatus: "PENDING",
        metadata: {
          contentType: params.contentType ?? null,
          sha256: params.sha256 ?? null,
        },
      },
    });

    const job = await this.mediaQueue.add("scan_and_ingest", {
      mediaId: params.mediaId,
      ownerCreatorId: params.ownerCreatorId,
      stagingKey: params.stagingKey,
      mediaType: params.mediaType,
      contentType: params.contentType,
      sha256: params.sha256,
    });
    return { jobId: job.id?.toString() };
  }
}
