import type { EmailProvider, SendEmailInput, SendEmailResult } from "@hushd/shared";

export class NoopEmailProvider implements EmailProvider {
  readonly id = "noop_email";

  async sendTransactional(input: SendEmailInput): Promise<SendEmailResult> {
    return { ok: true, providerMessageId: `noop_${input.to}_${input.subject.length}` };
  }
}
