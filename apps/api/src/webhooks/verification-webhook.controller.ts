import { Body, Controller, Headers, Inject, Param, Post, UnauthorizedException } from "@nestjs/common";
import { Public } from "../auth/public.decorator";
import { IDV_PROVIDER } from "../integrations/integrations.tokens";
import type { IdVerificationProvider } from "@hushd/shared";
import { VerificationService } from "../verification/verification.service";

@Controller("webhooks/verification")
@Public()
export class VerificationWebhookController {
  constructor(
    @Inject(IDV_PROVIDER) private readonly idv: IdVerificationProvider,
    private readonly verification: VerificationService,
  ) {}

  @Post(":vendor")
  async handle(
    @Param("vendor") vendor: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ) {
    const rawBody = typeof body === "string" ? body : JSON.stringify(body ?? {});
    const ok = await this.idv.verifyWebhook({ rawBody, headers });
    if (!ok) {
      throw new UnauthorizedException("invalid_signature");
    }
    const decision = await this.idv.parseWebhook({ rawBody, headers });
    if (!decision) {
      return { received: true, vendor, applied: false };
    }
    const result = await this.verification.applyVendorDecision(decision);
    return { received: true, vendor, decision, ...result };
  }
}
