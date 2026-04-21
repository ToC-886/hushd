import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Centralises TTL and action scoping for R2 / Stream signed URLs.
 * Wire S3 SDK presign calls in a dedicated storage adapter when R2 credentials are present.
 */
@Injectable()
export class SignedUrlPolicy {
  constructor(private readonly config: ConfigService) {}

  stagingPutTtlSeconds(): number {
    return Number(this.config.get("MEDIA_STAGING_PUT_TTL_SECONDS") ?? 900);
  }

  stagingGetTtlSeconds(): number {
    return Number(this.config.get("MEDIA_STAGING_GET_TTL_SECONDS") ?? 300);
  }

  publicReadTtlSeconds(): number {
    return Number(this.config.get("MEDIA_PUBLIC_READ_TTL_SECONDS") ?? 60);
  }

  streamPlaybackTtlSeconds(): number {
    return Number(this.config.get("STREAM_PLAYBACK_TTL_SECONDS") ?? 3600);
  }
}
