export type StartVerificationInput = {
  userId: string;
  returnUrl: string;
  locale?: string;
};

export type StartVerificationResult =
  | { ok: true; vendorSessionId: string; redirectUrl?: string }
  | { ok: false; code: string; message: string };

export type VerificationWebhookContext = {
  rawBody: string | Buffer;
  headers: Record<string, string | string[] | undefined>;
};

export type VerificationDecision = {
  vendor: string;
  vendorSessionId: string;
  userRef: string;
  status: "approved" | "rejected" | "pending";
  payloadRef?: string;
};

export interface IdVerificationProvider {
  readonly vendor: string;

  startSession(input: StartVerificationInput): Promise<StartVerificationResult>;

  verifyWebhook(ctx: VerificationWebhookContext): Promise<boolean>;

  parseWebhook(ctx: VerificationWebhookContext): Promise<VerificationDecision | null>;
}
