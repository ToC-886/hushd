import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { BillingWebhookService } from "../billing/billing-webhook.service";

@Controller("webhooks/billing")
@Public()
export class BillingWebhookController {
  constructor(private readonly billingWebhooks: BillingWebhookService) {}

  @Post(":processorId")
  async handle(
    @Param("processorId") processorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    return this.billingWebhooks.ingestWebhook(processorId, headers, body);
  }
}
