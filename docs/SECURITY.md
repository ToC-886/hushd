# Security Model

## Reporting

Email security findings to the repository maintainers (private disclosure). Do not file public issues that include exploit details until a fix is available.

## Authentication

- Access + refresh JWTs issued by Nest `AuthService`
- Refresh rotation with reuse detection (session family revoke)
- Passwords: bcrypt; max length capped on register
- Creator TOTP: sealed at rest with `ENCRYPTION_KEY` (AES-256-GCM); required at login when enabled
- Email verification gates activation when `AUTH_AUTO_ACTIVATE=false` (required in production)

### Residual risk — token storage

Web and admin clients currently store JWTs in **`localStorage`**. Any XSS can exfiltrate sessions. Prefer migrating to **HttpOnly / Secure / SameSite** cookies. Tracked as G-005.

## Authorization

- Global `JwtAuthGuard` with `@Public()` opt-out
- Opt-in `RoleGuard` via `@RequireRole` — all `/admin/*` and sensitive admin surfaces require `ADMIN`
- Ownership checks on media, creator mutations, messaging
- Frontend visibility is **never** the sole control

## Secrets

- Load from environment / secret manager only
- `.env.example` documents names — never commit real values
- Production rejects weak / placeholder JWT and encryption secrets
- Webhook HMAC secrets per processor; Veriff secrets when IDV=veriff

## Webhooks

- Billing: processor `verifyWebhook` before parse; idempotent `ProcessorEvent`
- Verification: vendor signature verify; noop IDV fails closed
- Raw body preserved for HMAC

## Uploads and media

- Presigned staging PUT only; promote after CSAM gate
- MIME allowlist + required `byteSize` on init
- Public reads via short-lived signed URLs
- Worker refuses `CSAM_PROVIDER=noop` when `NODE_ENV=production`

## Network / browser

- Helmet on API (JSON API; CSP left to frontends)
- CORS allowlist required in production
- Redis-backed throttling (fails closed if Redis down)
- Geo ACCESS enforcement requires trusted edge secret in production (ADR-0002)

## Threat mitigations (selected)

| Threat | Mitigation |
|--------|------------|
| Webhook replay | Idempotency keys + ProcessorEvent |
| Brute force login | Global throttler (Redis) |
| Account enumeration | Homogeneous auth email responses |
| IDOR media | Owner checks + staging key binding |
| Mass assignment | DTOs + class-validator |
| Stub services in prod | `validateEnv` fail-closed |

## Known residual risks

1. localStorage JWTs (XSS)
2. Live processors not yet implemented (prod config refuses stubs — deploy blocked until live adapters exist)
3. Hashlist CSAM is not a full commercial CSAM solution
4. OpenAPI drift (documentation risk)
5. No formal pen test in this audit pass

This document is **not** a compliance certification.
