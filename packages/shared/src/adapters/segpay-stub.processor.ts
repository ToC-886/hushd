import type {
  CreateSubscriptionCheckoutInput,
  CreateSubscriptionCheckoutResult,
  NormalizedBillingEvent,
  PaymentProcessor,
  WebhookVerificationContext,
} from "./payment-processor";
import { verifyHmacSha256Hex } from "../webhooks/signature";

/**
 * Non-production stub for adapter wiring and webhook verification patterns.
 * Replace with a real Segpay integration behind the same interface once
 * merchant credentials (package ID, price points, postback secret) exist.
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
        currency?: string;
        type?: NormalizedBillingEvent["type"];
        subscriptionId?: string;
        fanUserId?: string;
        creatorId?: string;
        sessionRef?: string;
        subscriptionRef?: string;
        originalProcessorTxnId?: string;
        occurredAt?: string;
      };
      if (!parsed.processorTxnId) return [];
      const metadata: Record<string, string> = {};
      if (parsed.sessionRef) metadata.sessionRef = parsed.sessionRef;
      if (parsed.subscriptionRef) metadata.subscriptionRef = parsed.subscriptionRef;
      if (parsed.originalProcessorTxnId) metadata.originalProcessorTxnId = parsed.originalProcessorTxnId;
      return [
        {
          processor: this.id,
          processorEventId: parsed.eventId ?? parsed.processorTxnId,
          processorTxnId: parsed.processorTxnId,
          type: parsed.type ?? "subscription_charge",
          grossCents: Number(parsed.grossCents ?? 0),
          currency: parsed.currency ?? "EUR",
          fanUserId: parsed.fanUserId,
          creatorId: parsed.creatorId,
          subscriptionId: parsed.subscriptionId,
          occurredAt: parsed.occurredAt ?? new Date().toISOString(),
          metadata,
        },
      ];
    } catch {
      return [];
    }
  }

  async cancelSubscription(): Promise<{ ok: true }> {
    return { ok: true };
  }

  async fetchBillingHistory() {
    return [];
  }
}
