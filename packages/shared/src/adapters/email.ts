export type SendEmailInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  tags?: Record<string, string>;
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; code: string; message: string };

export interface EmailProvider {
  readonly id: string;

  sendTransactional(input: SendEmailInput): Promise<SendEmailResult>;
}
