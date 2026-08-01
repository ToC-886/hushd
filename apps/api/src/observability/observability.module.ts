import { Global, Module } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";
import { SentryService } from "./sentry.service";

@Global()
@Module({
  controllers: [MetricsController],
  providers: [SentryService, MetricsService],
  exports: [SentryService, MetricsService],
})
export class ObservabilityModule {}
