# Changelog

All notable changes for the production-hardening audit are summarized here. Detailed rows live in [`docs/audit/07-remediation-log.md`](docs/audit/07-remediation-log.md).

## Unreleased — audit/production-hardening (2026-08-01)

### Security

- Production env fail-closed: reject log email, auto-activate, noop IDV, stub processors; require Veriff keys when selected
- Worker refuses `CSAM_PROVIDER=noop` in production
- Resend transactional email adapter (`EMAIL_PROVIDER=resend`)
- Media upload requires MIME + byte size (DTO + service)
- Redis-backed rate limiting; request IDs; helmet + CORS allowlist
- Geo ACCESS enforcement honesty model (edge secret)
- Next.js bumped to ≥15.5.18; pnpm overrides for multer/lodash
- **Browser sessions moved to HttpOnly Secure SameSite cookies** (`hushd_access`/`hushd_refresh`) with `X-Requested-With` CSRF guard; web/admin no longer store tokens in `localStorage`; Bearer-token API clients unaffected (ADR-0006)

### Reliability

- Prisma migrations in deployable UTF-8 directory layout; clean `migrate deploy` proven
- Worker media pipeline extracted and unit-tested; graceful shutdown
- Webhook FAILED events reprocessable; admin audit trail on mutations

### Product / UX

- Creator profile+tiers API; subscribe with real `tierId`
- Billing subscriptions list + cancel
- Payout method enum alignment; admin ADMIN role re-check on session restore

### Ops / docs

- Dockerfiles multi-stage non-root; compose healthchecks; host Postgres **5433**
- CI workflow: migrate + typecheck + test + docker + audit
- Audit artifacts `docs/audit/01–07`, PHASE/PRODUCTION/SECURITY/DEPLOYMENT/OPS/ARCHITECTURE docs
- OpenAPI re-synced to implemented routes + `cookieAuth` scheme (R-033)
- Playwright `@hushd/e2e` scaffold: API health + cookie session lifecycle, web register/login smoke (R-034)

### Known incomplete

- Live payment processor adapters
- Commercial CSAM vendor (hashlist is minimum)
- ~~HttpOnly cookie session storage~~ — done (R-032)
- Watermark job; promotions/affiliates; full Terraform; expanded FE e2e journeys
