# ADR 0001: Email verification gates account activation

## Status

Accepted (2026-08-01)

## Context

Before this audit, registration issued live auth tokens immediately and set the
account `ACTIVE` with no proof that the registrant controlled the email address.
For an adult-content platform subject to payment-processor and legal scrutiny,
unverified accounts are a fraud, spam, and abuse vector, and they undermine the
integrity of downstream compliance records (2257, DMCA, payout KYC) that key off
a verified identity.

The platform must be able to prove that the human behind an account controls a
reachable email address before that account can transact.

## Decision

Registration behavior is now gated by the `AUTH_AUTO_ACTIVATE` environment
variable:

- **`AUTH_AUTO_ACTIVATE=false` (production default):** the user is created with
  status `PENDING`, an `EmailToken` (purpose `VERIFY_EMAIL`, 24h expiry) is
  minted, a verification email is sent, and **no auth tokens are returned**.
  The account cannot log in until the email is verified.
- **`AUTH_AUTO_ACTIVATE=true` (local development only):** preserves the original
  frictionless behavior so developers are not forced to read log output to log in.

Login enforces the gate: a `PENDING` account with a null `emailVerifiedAt`
receives `403 email_not_verified`. Verification consumes the token, flips the
account to `ACTIVE`, stamps `emailVerifiedAt`, and only then issues tokens.

Password reset uses the same token machinery (purpose `PASSWORD_RESET`, 1h
expiry) and revokes all sessions on completion. Both the resend-verification and
request-reset endpoints return an identical `{ ok: true }` whether or not the
email exists, to prevent account enumeration.

## Consequences

### Positive

- Proof of email control before any financial or compliance-relevant action.
- Enumeration-safe recovery flows.
- A single `EmailToken` model serves both verification and reset.

### Negative / costs

- **Hard dependency on email delivery in production.** The in-tree provider is
  log-only (see ADR 0004). Production is blocked until a real provider adapter
  (SES/Postmark/Resend) is configured. `validateEnv` emits a loud warning when
  `EMAIL_PROVIDER=log` in production.
- Slightly more registration friction (by design).

### Alternatives considered

- *Verify lazily after first login:* rejected — allows unverified accounts to
  transact during the window, which is exactly the abuse vector being closed.
- *Third-party identity verification only (Veriff):* rejected as a substitute —
  IDV verifies identity, not email reachability; both are required.
