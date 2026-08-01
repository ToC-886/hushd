import type { ScanAndIngestPayload } from "@hushd/shared";
import { PrismaClient } from "@prisma/client";
import type { R2Storage } from "./r2-storage";

const STREAM_COPY_URL = (accountId: string) =>
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`;

/**
 * After a clean scan, promote staged bytes to durable keys and trigger Stream
 * ingest for video. With no R2 credentials the copy is skipped (dev stub);
 * with no Stream token the video stays a plain object with streamUid null —
 * never a fabricated UID.
 */
export async function promoteIfClean(
  input: {
    mediaId: string;
    stagingKey: string;
    ownerCreatorId: string;
    mediaType: ScanAndIngestPayload["mediaType"];
  },
  deps: { prisma: PrismaClient; storage: R2Storage },
): Promise<void> {
  const publicPrefix = process.env.R2_PUBLIC_PREFIX ?? "public/";
  const targetKey = `${publicPrefix}${input.ownerCreatorId}/${input.mediaId}`;

  const promoted = await deps.storage.promoteObject(input.stagingKey, targetKey);
  if (!promoted) {
    // eslint-disable-next-line no-console
    console.log("promote_stub_no_r2_credentials", { from: input.stagingKey, to: targetKey, mediaId: input.mediaId });
  }

  let streamUid: string | null = null;
  if (input.mediaType === "VIDEO") {
    streamUid = await ingestToStream(input.mediaId, targetKey, deps.storage);
  }

  await deps.prisma.media.update({
    where: { id: input.mediaId },
    data: {
      r2PublicKey: targetKey,
      streamUid,
      metadata: {
        promotedFrom: input.stagingKey,
        promotedAt: new Date().toISOString(),
        storageCopy: promoted ? "done" : "skipped_unconfigured",
      },
    },
  });
}

/**
 * Hands the promoted object to Cloudflare Stream via copy-from-URL. Requires
 * CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_STREAM_API_TOKEN; returns null otherwise
 * or on API failure (video remains downloadable via the signed R2 URL).
 */
async function ingestToStream(mediaId: string, publicKey: string, storage: R2Storage): Promise<string | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  if (!accountId || !apiToken) {
    return null;
  }

  const sourceUrl = await storage.signPublicGetUrl(publicKey, 3600);
  if (!sourceUrl) {
    return null;
  }

  try {
    const res = await fetch(STREAM_COPY_URL(accountId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: sourceUrl,
        meta: { mediaId },
      }),
    });
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.error("stream_ingest_failed", { mediaId, status: res.status });
      return null;
    }
    const body = (await res.json()) as { result?: { uid?: string } };
    return body.result?.uid ?? null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("stream_ingest_error", { mediaId, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}
