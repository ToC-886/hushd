import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
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
import { PrismaModule } from "./prisma/prisma.module";
import { QueueModule } from "./queue/queue.module";
import { RiskModule } from "./risk/risk.module";
import { VerificationModule } from "./verification/verification.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    QueueModule,
    IntegrationsModule,
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
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RoleGuard },
  ],
})
export class AppModule {}