import type {
  IdVerificationProvider,
  StartVerificationInput,
  StartVerificationResult,
  VerificationDecision,
  VerificationWebhookContext,
} from "@hushd/shared";

export class NoopIdVerificationProvider implements IdVerificationProvider {
  readonly vendor = "noop";

  async startSession(input: StartVerificationInput): Promise<StartVerificationResult> {
    return {
      ok: true,
      vendorSessionId: `noop_${input.userId}`,
      redirectUrl: input.returnUrl,
    };
  }

  async verifyWebhook(_ctx: VerificationWebhookContext): Promise<boolean> {
    return false;
  }

  async parseWebhook(_ctx: VerificationWebhookContext): Promise<VerificationDecision | null> {
    return null;
  }
}
