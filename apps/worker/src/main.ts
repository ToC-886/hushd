import { PrismaClient } from "@prisma/client";
import {
  MEDIA_PIPELINE_QUEUE,
  NoopCsamScanProvider,
  type CsamScanProvider,
  type ScanAndIngestPayload,
} from "@hushd/shared";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { JobFailureAlerter } from "./alerts";
import { HashListCsamProvider } from "./hashlist-csam.provider";
import { processScanAndIngest } from "./media-pipeline";
import { R2Storage, r2StorageConfigFromEnv } from "./r2-storage";
import { startBillingReconciliationLoop } from "./reconcile";
import { startVerificationExpirySweep } from "./verification-sweep";

const SHUTDOWN_TIMEOUT_MS = 30_000;

function createCsamProvider(): CsamScanProvider {
  const providerId = (process.env.CSAM_PROVIDER ?? "noop").trim().toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";
  if (providerId === "hashlist") {
    return new HashListCsamProvider({
      file: process.env.CSAM_HASHLIST_FILE || undefined,
      url: process.env.CSAM_HASHLIST_URL || undefined,
      failClosed: process.env.CSAM_FAIL_CLOSED === "true",
    });
  }
  if (isProduction && (providerId === "noop" || providerId === "")) {
    throw new Error(
      'CSAM_PROVIDER=noop is forbidden in production — set CSAM_PROVIDER=hashlist (or a real vendor adapter) before starting the worker',
    );
  }
  if (providerId !== "noop") {
    // eslint-disable-next-line no-console
    console.error(`unknown CSAM_PROVIDER "${providerId}", falling back to noop`);
    if (isProduction) {
      throw new Error(`unknown CSAM_PROVIDER "${providerId}" is not allowed in production`);
    }
  }
  return new NoopCsamScanProvider();
}

async function main(): Promise<void> {
  const connection = new IORedis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
    maxRetriesPerRequest: null,
  });
  const prisma = new PrismaClient();
  const storage = new R2Storage(r2StorageConfigFromEnv());
  const csam = createCsamProvider();
  const alerter = new JobFailureAlerter({
    webhookUrl: process.env.ALERT_WEBHOOK_URL || undefined,
  });

  if (csam instanceof HashListCsamProvider) {
    await csam.init();
  }

  const worker = new Worker<ScanAndIngestPayload>(
    MEDIA_PIPELINE_QUEUE,
    async (job: Job<ScanAndIngestPayload>) => {
      if (job.name !== "scan_and_ingest") {
        return;
      }
      return processScanAndIngest(job, { prisma, storage, csam });
    },
    { connection },
  );

  worker.on("ready", () => {
    // eslint-disable-next-line no-console
    console.log(`worker listening on queue ${MEDIA_PIPELINE_QUEUE}`, {
      csamProvider: csam.id,
      r2Configured: storage.isConfigured(),
    });
  });

  worker.on("failed", (job, err) => {
    // eslint-disable-next-line no-console
    console.error("media-pipeline job failed", job?.id, err.message);
    void alerter.recordFailure(job?.name ?? "unknown", err);
  });

  startBillingReconciliationLoop(prisma);
  startVerificationExpirySweep(prisma);

  let isShuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    // eslint-disable-next-line no-console
    console.log(`worker received ${signal}; draining in-flight jobs`);

    const forceExit = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.error("worker shutdown timed out; forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      // Stops fetching new jobs and waits for in-flight jobs to finish.
      await worker.close();
      await prisma.$disconnect();
      connection.disconnect();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("worker shutdown error", err instanceof Error ? err.message : String(err));
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
