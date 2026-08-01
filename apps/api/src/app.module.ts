import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerGuard, ThrottlerModule, ThrottlerStorage, seconds } from "@nestjs/throttler";
import { AdminModule } from "./admin/admin.module";
import { GeoBlockGuard } from "./admin/geo-block.guard";
import { AnalyticsModule } from "./analytics/analytics.module";
import { AuthModule } from "./auth/auth.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";
import { RoleGuard } from "./auth/role.guard";
import { BillingModule } from "./billing/billing.module";
import { ComplianceModule } from "./compliance/compliance.module";
import { CreatorModule } from "./creator/creator.module";
import { FeedModule } from "./feed/feed.module";
import { HealthController } from "./health.controller";
import { IntegrationsModule } from "./integrations/integrations.module";
import { MediaModule } from "./media/media.module";
import { MessagingModule } from "./messaging/messaging.module";
import { ModerationModule } from "./moderation/moderation.module";
import { HttpExceptionFilter } from "./observability/http-exception.filter";
import { MetricsInterceptor } from "./observability/metrics.interceptor";
import { ObservabilityModule } from "./observability/observability.module";
import { RedisThrottlerStorage } from "./observability/redis-throttler.storage";
import { PayoutsModule } from "./payouts/payouts.module";
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { RiskModule } from "./risk/risk.module";
import { VerificationModule } from "./verification/verification.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: "default", ttl: seconds(60), limit: 300 }]),
    PrismaModule,
    QueueModule,
    IntegrationsModule,
    ObservabilityModule,
    AdminModule,
    AnalyticsModule,
    RiskModule,
    ComplianceModule,
    AuthModule,
    BillingModule,
    VerificationModule,
    CreatorModule,
    FeedModule,
    MessagingModule,
    ModerationModule,
    MediaModule,
    PayoutsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: ThrottlerStorage, useClass: RedisThrottlerStorage },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: GeoBlockGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
