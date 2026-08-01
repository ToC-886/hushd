import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class R2SignerService {
  private readonly logger = new Logger(R2SignerService.name);
  private readonly client: S3Client | null;
  private warnedUnconfigured = false;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>("R2_ACCOUNT_ID");
    const accessKeyId = this.config.get<string>("R2_ACCESS_KEY_ID");
    const secretAccessKey = this.config.get<string>("R2_SECRET_ACCESS_KEY");
    this.client =
      accountId && accessKeyId && secretAccessKey
        ? new S3Client({
            region: "auto",
            endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async signStagingPut(params: {
    bucket: string;
    key: string;
    contentType?: string;
    expiresInSeconds: number;
  }): Promise<string> {
    if (!this.client) {
      // Dev without R2 credentials: uploads can't work, but keep the API
      // contract intact so client flows can be developed against stubs.
      this.warnUnconfiguredOnce();
      return `https://r2-unconfigured.invalid/${params.bucket}/${params.key}`;
    }
    const cmd = new PutObjectCommand({
      Bucket: params.bucket,
      Key: params.key,
      ContentType: params.contentType ?? "application/octet-stream",
    });
    return getSignedUrl(this.client, cmd, {
      expiresIn: params.expiresInSeconds,
    });
  }

  /**
   * Short-lived read URL for promoted (public-bucket) objects. Returns null
   * when storage is not configured so callers can omit the field.
   */
  async signPublicGet(params: { bucket: string; key: string; expiresInSeconds: number }): Promise<string | null> {
    if (!this.client) {
      this.warnUnconfiguredOnce();
      return null;
    }
    const cmd = new GetObjectCommand({ Bucket: params.bucket, Key: params.key });
    return getSignedUrl(this.client, cmd, { expiresIn: params.expiresInSeconds });
  }

  private warnUnconfiguredOnce() {
    if (this.warnedUnconfigured) return;
    this.warnedUnconfigured = true;
    this.logger.warn("r2_not_configured_using_placeholder_urls");
  }
}
