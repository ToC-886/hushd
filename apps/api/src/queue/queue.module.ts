import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { MEDIA_PIPELINE_QUEUE, type ScanAndIngestPayload } from "@hushd/shared";

export const MEDIA_PIPELINE_QUEUE_TOKEN = "MEDIA_PIPELINE_QUEUE";

@Global()
@Module({
  providers: [
    {
      provide: "REDIS",
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>("REDIS_URL") ?? "redis://127.0.0.1:6379";
        return new IORedis(url, { maxRetriesPerRequest: null });
      },
    },
    {
      provide: MEDIA_PIPELINE_QUEUE_TOKEN,
      inject: ["REDIS"],
      useFactory: (connection: IORedis) =>
        new Queue<ScanAndIngestPayload>(MEDIA_PIPELINE_QUEUE, {
          connection,
          defaultJobOptions: {
            removeOnComplete: 1000,
            removeOnFail: 5000,
            attempts: 5,
            backoff: { type: "exponential", delay: 2000 },
          },
        }),
    },
  ],
  exports: ["REDIS", MEDIA_PIPELINE_QUEUE_TOKEN],
})
export class QueueModule {}
