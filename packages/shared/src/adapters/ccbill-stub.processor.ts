import type {
  CreateSubscriptionCheckoutInput,
  CreateSubscriptionCheckoutResult,
  NormalizedBillingEvent,
  PaymentProcessor,
  WebhookVerificationContext,
} from "./payment-processor";
import { verifyHmacSha256Hex } from "../webhooks/signature";

/**
 * Development-safe CCBill adapter stub.
 * Keep interface parity with the real provider implementation (FlexForms
 * checkout + webhook postbacks) so cutover is config-only.
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
        currency?: string;
        eventType?: NormalizedBillingEvent["type"];
        subscriptionId?: string;
        fanUserId?: string;
        creatorId?: string;
        sessionRef?: string;
        subscriptionRef?: string;
        originalProcessorTxnId?: string;
        occurredAt?: string;
      };
      if (!parsed.txn) return [];
      const metadata: Record<string, string> = {};
      if (parsed.sessionRef) metadata.sessionRef = parsed.sessionRef;
      if (parsed.subscriptionRef) metadata.subscriptionRef = parsed.subscriptionRef;
      if (parsed.originalProcessorTxnId) metadata.originalProcessorTxnId = parsed.originalProcessorTxnId;
      return [
        {
          processor: this.id,
          processorEventId: parsed.eventId ?? parsed.txn,
          processorTxnId: parsed.txn,
          type: parsed.eventType ?? "subscription_charge",
          grossCents: Number(parsed.amount ?? 0),
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
