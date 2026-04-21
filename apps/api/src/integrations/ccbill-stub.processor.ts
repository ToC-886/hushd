import type {
  CreateSubscriptionCheckoutInput,
  CreateSubscriptionCheckoutResult,
  NormalizedBillingEvent,
  PaymentProcessor,
  WebhookVerificationContext,
} from "@hushd/shared";
import { verifyHmacSha256Hex } from "@hushd/shared";

/**
 * Development-safe CCBill adapter stub.
 * Keep interface parity with real provider implementation.
 */
export class CcbillStubProcessor implements PaymentProcessor {
  readonly id = "ccbill_stub";

  async createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateSubscriptionCheckoutResult> {
    return {
      ok: true,
      redirectUrl: `https://example.invalid/ccbill-checkout?tier=${encodeURIComponent(input.tierId)}`,
      processorSessionRef: `ccbill_sess_${input.tierId}`,
    };
  }

  async verifyWebhook(ctx: WebhookVerificationContext): Promise<boolean> {
    const secret = process.env.CCBILL_WEBHOOK_SECRET ?? "";
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
        txn?: string;
        amount?: number;
        eventType?: NormalizedBillingEvent["type"];
        subscriptionId?: string;
      };
      if (!parsed.txn) return [];
      return [
        {
          processor: this.id,
          processorEventId: parsed.eventId ?? parsed.txn,
          processorTxnId: parsed.txn,
          type: parsed.eventType ?? "subscription_charge",
          grossCents: Number(parsed.amount ?? 0),
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
