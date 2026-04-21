# Security audit checklist (OWASP ASVS L2 alignment)

Use this as a release gate for `hushd`. Items are directional; legal and fraud teams may add processors.

## Authentication and access control (V1–V3)

- [ ] Refresh tokens are hashed at rest; rotation on use; reuse detection revokes families.
- [ ] Creators cannot access admin routes; admins use separate IAM and optional IP allowlists.
- [ ] Creator accounts require TOTP before payout-sensitive actions.
- [ ] OAuth state and PKCE where applicable; redirect URI allowlist enforced.

## Validation and business logic (V4)

- [ ] All inbound DTOs validated (Zod/class-validator) including webhook parsers.
- [ ] Webhook handlers use raw-body signature verification where required by the processor.
- [ ] File uploads constrained by size, MIME allowlist, and per-user rate limits.

## Web and browser security (V5)

- [ ] CSP, HSTS, frame protections, and appropriate CORS for known web origins only.
- [ ] CSRF strategy documented for cookie-based sessions (if used).

## Data protection (V8)

- [ ] Secrets only from a secrets manager in production; no secrets in CI logs.
- [ ] Tax and ID artifacts stored with envelope encryption and minimal retention.
- [ ] Database roles: append-only policies for `audit_logs` via triggers or restricted roles.

## Communications (V9)

- [ ] TLS everywhere; TLS for Redis/Postgres where supported.
- [ ] Signed URLs for media are short-lived and scoped to action (GET vs PUT).

## Malicious controls (V10)

- [ ] Rate limits on auth, uploads, messaging, and webhooks.
- [ ] Chargeback and refund anomaly monitors with paging runbooks.
