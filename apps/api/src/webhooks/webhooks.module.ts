import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { VerificationModule } from "../verification/verification.module";
import { BillingWebhookController } from "./billing-webhook.controller";
import { VerificationWebhookController } from "./verification-webhook.controller";

@Module({
  imports: [IntegrationsModule, BillingModule, VerificationModule],
  controllers: [BillingWebhookController, VerificationWebhookController],
})
export class WebhooksModule {}
