/**
 * High-risk adult payment processor adapter.
 * Never store raw card data — processors return opaque tokens and references.
 */

export type MoneyAmount = { cents: number; currency: string };

export type CreateSubscriptionCheckoutInput = {
  fanUserId: string;
  creatorSlug: string;
  tierId: string;
  successReturnUrl: string;
  cancelReturnUrl: string;
};

export type CreateSubscriptionCheckoutResult =
  | { ok: true; redirectUrl: string; processorSessionRef: string }
  | { ok: false; code: string; message: string };

export type WebhookVerificationContext = {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
};

export type NormalizedBillingEvent = {
  processor: string;
  processorEventId: string;
  processorTxnId: string;
  type: "subscription_charge" | "renewal" | "refund" | "chargeback" | "cancel" | "unknown";
  grossCents: number;
  currency: string;
  fanUserId?: string;
  creatorId?: string;
  subscriptionId?: string;
  occurredAt?: string;
  metadata: Record<string, string>;
};

export type BillingHistoryItem = {
  processorTxnId: string;
  type: NormalizedBillingEvent["type"];
  grossCents: number;
  currency: string;
  occurredAt: string;
};

export interface PaymentProcessor {
  readonly id: string;

  createSubscriptionCheckout(
    input: CreateSubscriptionCheckoutInput,
  ): Promise<CreateSubscriptionCheckoutResult>;

  /** Return true if the webhook should be accepted (signature, IP allowlist hooks, etc.). */
  verifyWebhook(ctx: WebhookVerificationContext): Promise<boolean>;

  /** Parse processor-specific payloads into normalized billing events. */
  parseWebhookPayload(ctx: WebhookVerificationContext): Promise<NormalizedBillingEvent[]>;

  /** Cancel subscription at the processor layer (best effort, idempotent). */
  cancelSubscription(processorSubscriptionRef: string): Promise<{ ok: true } | { ok: false; code: string; message: string }>;

  /** Processor-side history lookup used by reconciliation jobs. */
  fetchBillingHistory(sinceIso: string): Promise<BillingHistoryItem[]>;
}
