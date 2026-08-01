import { Controller, Headers, HttpCode, Inject, Param, Post, RawBodyRequest, Req, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
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
  @HttpCode(200)
  async handle(
    @Param("vendor") vendor: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: RawBodyRequest<Request>,
  ) {
    if (vendor !== this.idv.vendor) {
      throw new UnauthorizedException("unknown_vendor");
    }
    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), "utf8");
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
