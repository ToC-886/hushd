# Architecture Decision Records

ADRs capture consequential, hard-to-reverse decisions made during the
production-hardening audit. Each record is self-contained and numbered.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](./0001-email-verification-gates-account-activation.md) | Email verification gates account activation | Accepted |
| [0002](./0002-fail-open-honest-geo-enforcement.md) | Fail-open-honest geo enforcement when edge secret is absent | Accepted |
| [0003](./0003-shared-noop-csam-provider.md) | Single authoritative noop CSAM provider in `@hushd/shared` | Accepted |
| [0004](./0004-log-only-mailer-abstraction.md) | Log-only mailer abstraction pending a real provider | Accepted |
| [0005](./0005-failed-webhook-events-are-reprocessable.md) | FAILED webhook events are reprocessable | Accepted |
| [0006](./0006-httponly-cookie-auth.md) | HttpOnly cookie auth for browser clients | Accepted |
