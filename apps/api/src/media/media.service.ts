import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
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
  contentType: string;
  byteSize: number;
};

export type InitUploadResult = {
  mediaId: string;
  stagingKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
};

/** MIME allowlist per logical media type — the staging bucket is private, but
 *  keeping obviously-wrong bytes out avoids wasting scan pipeline capacity. */
const ALLOWED_CONTENT_TYPES: Record<ScanAndIngestPayload["mediaType"], RegExp> = {
  IMAGE: /^image\/(jpeg|png|webp|gif|avif)$/,
  VIDEO: /^video\/(mp4|quicktime|webm|x-matroska)$/,
  AUDIO: /^audio\/(mpeg|mp4|aac|ogg|wav)$/,
  OTHER: /^(image|video|audio)\//,
};

const DEFAULT_MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

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
    this.assertUploadAllowed(body);

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
        "content-type": body.contentType,
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
    const media = await this.prisma.media.findUnique({ where: { id: params.mediaId } });
    if (!media || media.ownerCreatorId !== params.ownerCreatorId) {
      throw new NotFoundException("media_not_found");
    }
    // The staging key was issued by initUpload — accepting a caller-supplied
    // key would let someone promote arbitrary bucket objects into public.
    if (media.r2StagingKey !== params.stagingKey) {
      throw new BadRequestException("staging_key_mismatch");
    }

    await this.prisma.media.update({
      where: { id: params.mediaId },
      data: {
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

  /** Owner-only status polling while the scan/promote pipeline runs. */
  async mediaStatus(userId: string, mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media || media.ownerCreatorId !== userId) {
      throw new NotFoundException("media_not_found");
    }
    return {
      id: media.id,
      type: media.type,
      scanStatus: media.scanStatus,
      ready: media.scanStatus === "OK" && Boolean(media.r2PublicKey),
      streamUid: media.streamUid,
    };
  }

  private assertUploadAllowed(body: InitUploadBody) {
    if (!body.contentType?.trim()) {
      throw new BadRequestException("content_type_required");
    }
    if (!ALLOWED_CONTENT_TYPES[body.mediaType].test(body.contentType)) {
      throw new BadRequestException("content_type_not_allowed");
    }
    if (typeof body.byteSize !== "number" || !Number.isFinite(body.byteSize)) {
      throw new BadRequestException("byte_size_required");
    }
    if (body.byteSize <= 0) {
      throw new BadRequestException("invalid_file_size");
    }
    const maxBytes = Number(this.config.get("MEDIA_MAX_UPLOAD_BYTES") ?? DEFAULT_MAX_UPLOAD_BYTES);
    if (body.byteSize > maxBytes) {
      throw new BadRequestException("file_too_large");
    }
  }
}
