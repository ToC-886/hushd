import { Logger } from "@nestjs/common";
import type {
  IdVerificationProvider,
  StartVerificationInput,
  StartVerificationResult,
  VerificationDecision,
  VerificationWebhookContext,
} from "@hushd/shared";
import { verifyHmacSha256Hex } from "@hushd/shared";

const DEFAULT_BASE_URL = "https://stationapi.veriff.com";

type VeriffSessionResponse = {
  status?: string;
  verification?: { id?: string; url?: string };
};

type VeriffDecisionPayload = {
  verification?: {
    id?: string;
    status?: string;
    vendorData?: string;
  };
};

/**
 * Veriff identity verification adapter (https://www.veriff.com).
 *
 * Contract follows Veriff's public API: session creation is authenticated
 * with the X-AUTH-CLIENT API key, decision webhooks carry an
 * x-hmac-signature header (hex HMAC-SHA256 of the raw body with the shared
 * API secret). Validate against a Veriff sandbox project before enabling in
 * production — see docs/runbooks for the cutover checklist.
 */
export class VeriffIdVerificationProvider implements IdVerificationProvider {
  readonly vendor = "veriff";
  private readonly logger = new Logger(VeriffIdVerificationProvider.name);

  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly baseUrl: string = DEFAULT_BASE_URL,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): VeriffIdVerificationProvider | null {
    const apiKey = env.VERIFF_API_KEY ?? "";
    const apiSecret = env.VERIFF_API_SECRET ?? "";
    if (!apiKey || !apiSecret) return null;
    return new VeriffIdVerificationProvider(apiKey, apiSecret, env.VERIFF_BASE_URL || DEFAULT_BASE_URL);
  }

  async startSession(input: StartVerificationInput): Promise<StartVerificationResult> {
    try {
      const response = await fetch(`${this.baseUrl}/v1/sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-AUTH-CLIENT": this.apiKey,
        },
        body: JSON.stringify({
          verification: {
            callback: input.returnUrl,
            vendorData: input.userId,
            ...(input.locale ? { lang: input.locale } : {}),
          },
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        this.logger.warn(`veriff session create failed: ${response.status} ${detail}`);
        return { ok: false, code: "veriff_upstream", message: "verification_unavailable" };
      }
      const body = (await response.json()) as VeriffSessionResponse;
      const sessionId = body.verification?.id;
      if (!sessionId) {
        return { ok: false, code: "veriff_bad_response", message: "verification_unavailable" };
      }
      return { ok: true, vendorSessionId: sessionId, redirectUrl: body.verification?.url };
    } catch (err) {
      this.logger.warn(`veriff session create error: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, code: "veriff_network", message: "verification_unavailable" };
    }
  }

  async verifyWebhook(ctx: VerificationWebhookContext): Promise<boolean> {
    const sig = ctx.headers["x-hmac-signature"];
    const signature = Array.isArray(sig) ? sig[0] : sig;
    if (!signature) return false;
    const raw = typeof ctx.rawBody === "string" ? ctx.rawBody : ctx.rawBody.toString("utf8");
    return verifyHmacSha256Hex(this.apiSecret, raw, signature);
  }

  async parseWebhook(ctx: VerificationWebhookContext): Promise<VerificationDecision | null> {
    const raw = typeof ctx.rawBody === "string" ? ctx.rawBody : ctx.rawBody.toString("utf8");
    try {
      const parsed = JSON.parse(raw) as VeriffDecisionPayload;
      const verification = parsed.verification;
      if (!verification?.id || !verification.status) return null;
      const status =
        verification.status === "approved"
          ? ("approved" as const)
          : verification.status === "declined"
            ? ("rejected" as const)
            : ("pending" as const);
      return {
        vendor: this.vendor,
        vendorSessionId: verification.id,
        userRef: verification.vendorData ?? "",
        status,
      };
    } catch {
      return null;
    }
  }
}
