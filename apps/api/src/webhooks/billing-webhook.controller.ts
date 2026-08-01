import { Controller, Headers, HttpCode, Param, Post, RawBodyRequest, Req } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/public.decorator";
import { BillingWebhookService } from "../billing/billing-webhook.service";

@Controller("webhooks/billing")
@Public()
export class BillingWebhookController {
  constructor(private readonly billingWebhooks: BillingWebhookService) {}

  @Post(":processorId")
  @HttpCode(200)
  async handle(
    @Param("processorId") processorId: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
    return this.billingWebhooks.ingestWebhook(processorId, headers, rawBody, req.body);
  }
}
