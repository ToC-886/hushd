export const MEDIA_PIPELINE_QUEUE = "media-pipeline";

export type MediaPipelineJobName = "scan_and_ingest" | "watermark" | "promote_to_public";

/** BullMQ job data for the initial scan gate before durable promotion. */
export type ScanAndIngestPayload = {
  mediaId: string;
  ownerCreatorId: string;
  stagingKey: string;
  mediaType: "IMAGE" | "VIDEO" | "AUDIO" | "OTHER";
  contentType?: string;
  sha256?: string;
};

export type WatermarkPayload = {
  mediaId: string;
  sourceKey: string;
  subscriberWatermarkSeed?: string;
};

export type PromotePayload = {
  mediaId: string;
  fromKey: string;
  toKey: string;
};

export type MediaPipelineJobData = ScanAndIngestPayload | WatermarkPayload | PromotePayload;
