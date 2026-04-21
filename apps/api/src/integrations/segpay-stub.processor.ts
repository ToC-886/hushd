import type {
  CreateSubscriptionCheckoutInput,
  CreateSubscriptionCheckoutResult,
  NormalizedBillingEvent,
  PaymentProcessor,
  WebhookVerificationContext,
} from "@hushd/shared";
import { verifyHmacSha256Hex } from "@hushd/shared";

/**
 * Non-production stub for adapter wiring and webhook verification patterns.
 * Replace with a real Segpay/CCBill/Epoch integration behind the same interface.
 */
export class SegpayStubProcessor implements PaymentProcessor {
  readonly id = "segpay_stub";

  async createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateSubscriptionCheckoutResult> {
    return {
      ok: true,
      redirectUrl: `https://example.invalid/checkout?fan=${encodeURIComponent(input.fanUserId)}`,
      processorSessionRef: `stub_sess_${input.tierId}`,
    };
  }

  async verifyWebhook(ctx: WebhookVerificationContext): Promise<boolean> {
    const secret = process.env.SEGPAY_WEBHOOK_SECRET ?? "";
    if (!secret) return false;
    const sig = ctx.headers["x-hushd-signature"];
    const signature = Array.isArray(sig) ? sig[0] : sig;
    if (!signature) return false;
    const raw = typeof ctx.rawBody === "string" ? ctx.rawBody : ctx.rawBody.toString("utf8");
    return verifyHmacSha256Hex(secret, raw, signature);
  }

  async parseWebhookPayload(ctx: WebhookVerificationContext): Promise<NormalizedBillingEvent[]> {
    const raw = typeof ctx.rawBody === "string" ? ctx.rawBody : ctx.rawBody.toString("utf8");
    try {
      const parsed = JSON.parse(raw) as {
        eventId?: string;
        processorTxnId?: string;
        grossCents?: number;
        type?: NormalizedBillingEvent["type"];
        subscriptionId?: string;
      };
      if (!parsed.processorTxnId) return [];
      return [
        {
          processor: this.id,
          processorEventId: parsed.eventId ?? parsed.processorTxnId,
          processorTxnId: parsed.processorTxnId,
          type: parsed.type ?? "subscription_charge",
          grossCents: Number(parsed.grossCents ?? 0),
          currency: "EUR",
          subscriptionId: parsed.subscriptionId,
          occurredAt: new Date().toISOString(),
          metadata: {},
        },
      ];
    } catch {
      return [];
    }
  }

  async cancelSubscription(_processorSubscriptionRef: string): Promise<{ ok: true }> {
    return { ok: true };
  }

  async fetchBillingHistory(_sinceIso: string) {
    return [];
  }
}
