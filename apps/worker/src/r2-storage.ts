import { CopyObjectCommand, DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2StorageConfig = {
  accountId?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  stagingBucket: string;
  publicBucket: string;
};

export function r2StorageConfigFromEnv(env: NodeJS.ProcessEnv = process.env): R2StorageConfig {
  return {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    stagingBucket: env.R2_BUCKET_STAGING ?? "local-staging",
    publicBucket: env.R2_BUCKET_PUBLIC ?? "local-public",
  };
}

/**
 * Worker-side R2 client. All methods no-op (returning null/false) when
 * credentials are absent so local dev keeps working against stub storage.
 */
export class R2Storage {
  private readonly client: S3Client | null;

  constructor(private readonly config: R2StorageConfig) {
    this.client =
      config.accountId && config.accessKeyId && config.secretAccessKey
        ? new S3Client({
            region: "auto",
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          })
        : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  /** Copies a staged object to the public bucket, then removes the staged copy. */
  async promoteObject(stagingKey: string, publicKey: string): Promise<boolean> {
    if (!this.client) return false;
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.config.publicBucket,
        Key: publicKey,
        CopySource: `${this.config.stagingBucket}/${stagingKey}`,
      }),
    );
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.stagingBucket,
        Key: stagingKey,
      }),
    );
    return true;
  }

  /** Best-effort cleanup of quarantined/blocked staging objects. */
  async deleteStagingObject(stagingKey: string): Promise<boolean> {
    if (!this.client) return false;
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.config.stagingBucket,
        Key: stagingKey,
      }),
    );
    return true;
  }

  /** Short-lived GET URL for the promoted object — used as the Stream copy source. */
  async signPublicGetUrl(publicKey: string, expiresInSeconds: number): Promise<string | null> {
    if (!this.client) return null;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.config.publicBucket, Key: publicKey }),
      { expiresIn: expiresInSeconds },
    );
  }
}
