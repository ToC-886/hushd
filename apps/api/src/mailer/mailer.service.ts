import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EmailProvider, SendEmailInput, SendEmailResult } from "@hushd/shared";

/**
 * Dev/test provider: delivers nowhere, logs the payload. Structured so the
 * verification/reset links remain visible in API logs during local
 * development — there is intentionally no silent no-op, an undeliverable
 * email must be observable.
 */
class LogEmailProvider implements EmailProvider {
  readonly id = "log";

  constructor(private readonly logger: Logger) {}

  async sendTransactional(input: SendEmailInput): Promise<SendEmailResult> {
    this.logger.log(
      `email[log] to=${input.to} subject="${input.subject}" body=${JSON.stringify(input.textBody)}`,
    );
    return { ok: true, providerMessageId: `log_${Date.now()}` };
  }
}

/**
 * Resend HTTP API provider (https://resend.com). Requires RESEND_API_KEY.
 * Uses global fetch (Node 18+).
 */
class ResendEmailProvider implements EmailProvider {
  readonly id = "resend";

  constructor(
    private readonly apiKey: string,
    private readonly fromAddress: string,
  ) {}

  async sendTransactional(input: SendEmailInput): Promise<SendEmailResult> {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.fromAddress,
        to: [input.to],
        subject: input.subject,
        text: input.textBody,
        html: input.htmlBody,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return {
        ok: false,
        code: `resend_http_${response.status}`,
        message: detail.slice(0, 500),
      };
    }
    const payload = (await response.json()) as { id?: string };
    return { ok: true, providerMessageId: payload.id ?? `resend_${Date.now()}` };
  }
}

/**
 * Transactional email boundary. All account email (verification, password
 * reset) flows through here; the concrete provider is selected by
 * EMAIL_PROVIDER (`log` | `resend`).
 *
 * Send failures are logged, not thrown: tokens are persisted before send, so
 * a provider blip must not fail the request — the user can request a resend.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly provider: EmailProvider;
  private readonly fromAddress: string;

  constructor(config: ConfigService) {
    const providerId = (config.get<string>("EMAIL_PROVIDER") ?? "log").trim().toLowerCase();
    this.fromAddress = config.get<string>("EMAIL_FROM") ?? "no-reply@hushd.local";
    this.provider = this.createProvider(providerId, config);
  }

  async sendVerificationEmail(to: string, verifyUrl: string): Promise<void> {
    await this.send({
      to,
      subject: "Verify your hushd account",
      textBody: `Confirm this email address to activate your account:\n\n${verifyUrl}\n\nThe link expires in 24 hours. If you did not register, ignore this email.`,
      tags: { template: "verify-email" },
    });
  }

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await this.send({
      to,
      subject: "Reset your hushd password",
      textBody: `Reset your password with this link:\n\n${resetUrl}\n\nThe link expires in 1 hour. If you did not request a reset, ignore this email — your password is unchanged.`,
      tags: { template: "password-reset" },
    });
  }

  private createProvider(providerId: string, config: ConfigService): EmailProvider {
    if (providerId === "log") {
      return new LogEmailProvider(this.logger);
    }
    if (providerId === "resend") {
      const apiKey = config.get<string>("RESEND_API_KEY")?.trim();
      if (!apiKey) {
        throw new Error('EMAIL_PROVIDER=resend requires RESEND_API_KEY');
      }
      return new ResendEmailProvider(apiKey, this.fromAddress);
    }
    throw new Error(`unknown EMAIL_PROVIDER "${providerId}"`);
  }

  private async send(input: SendEmailInput): Promise<void> {
    try {
      const result = await this.provider.sendTransactional({
        ...input,
        tags: { ...input.tags, from: this.fromAddress },
      });
      if (!result.ok) {
        this.logger.error(
          `email_send_failed to=${input.to} code=${result.code} message=${result.message}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `email_send_error to=${input.to} error=${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
