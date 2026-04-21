import { Module } from "@nestjs/common";
import { IntegrationsModule } from "../integrations/integrations.module";
import { PrismaModule } from "../prisma/prisma.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { BillingWebhookService } from "./billing-webhook.service";

@Module({
  imports: [PrismaModule, IntegrationsModule],
  controllers: [BillingController],
  providers: [BillingService, BillingWebhookService],
  exports: [BillingWebhookService],
})
export class BillingModule {}
