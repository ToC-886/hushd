import type { ScanAndIngestPayload } from "@hushd/shared";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * After a clean scan, promote staged bytes to durable keys and trigger Stream ingest for video.
 * Wire S3 copyObject / deleteObject and Cloudflare Stream APIs here.
 */
export async function promoteIfClean(input: {
  mediaId: string;
  stagingKey: string;
  ownerCreatorId: string;
  mediaType: ScanAndIngestPayload["mediaType"];
}): Promise<void> {
  const publicPrefix = process.env.R2_PUBLIC_PREFIX ?? "public/";
  const targetKey = `${publicPrefix}${input.ownerCreatorId}/${input.mediaId}`;
  let streamUid: string | null = null;

  if (input.mediaType === "VIDEO") {
    const streamAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!streamAccount) {
      // eslint-disable-next-line no-console
      console.warn("stream_ingest_skipped_missing_CLOUDFLARE_ACCOUNT_ID", input.mediaId);
    } else {
      streamUid = `stream_${input.mediaId}`;
    }
  }

  await prisma.media.update({
    where: { id: input.mediaId },
    data: {
      r2PublicKey: targetKey,
      streamUid,
      metadata: {
        promotedFrom: input.stagingKey,
        promotedAt: new Date().toISOString(),
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log("promote_stub", { from: input.stagingKey, to: targetKey, mediaId: input.mediaId });
}
