# ADR 0004: Mailer abstraction with log (dev) and Resend (prod)

## Status

Accepted (2026-08-01) · Amended (2026-08-01) — Resend adapter + fail-closed prod

## Context

ADR 0001 introduced email verification and password reset, which require
transactional email. During the audit we needed a testable local path without
pretending a vendor integration was complete without credentials.

## Decision

`MailerService` (in `apps/api/src/mailer/`) is the **single** email path for the
API, selected by `EMAIL_PROVIDER`:

- **`log` (dev default):** logs recipient/subject/body; no network send.
- **`resend`:** HTTP API via `RESEND_API_KEY` + `EMAIL_FROM` (Node `fetch`).

Send failures are logged, not thrown, so a mail outage cannot take down
registration (tokens remain for resend).

Production readiness is enforced in `validateEnv`: **`EMAIL_PROVIDER=log` is
rejected** when `NODE_ENV=production`. `EMAIL_PROVIDER=resend` requires
`RESEND_API_KEY`.

## Consequences

### Positive

- Verification/reset flows are fully implemented and testable with `log`.
- Production has a real adapter path once Resend credentials exist.

### Negative / costs

- Open production still needs a verified sending domain and API key (ops).
- Other vendors (SES/Postmark) can plug in behind the same interface later.

### Alternatives considered

- *Warning-only for log in production:* rejected — too easy to miss and ship
  silent non-delivery.
- *No mailer:* rejected — breaks local DX and CI for auth flows.
