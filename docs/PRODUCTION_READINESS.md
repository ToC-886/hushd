# Production Readiness

## Decision

**CONDITIONALLY READY — LISTED ITEMS MUST BE COMPLETED**

The codebase builds, typechecks, unit-tests, migrates, and fails closed on unsafe production stub configuration. It is **not** ready for open production traffic until external payment, CSAM, email, and IDV services are wired and the residual auth-storage risk is accepted or mitigated.

A **controlled pilot** (invite-only, synthetic or sandbox processors, hashlist CSAM, Resend + Veriff) is the recommended next operational step.

## Completed controls

- Deployable Prisma migrations (clean DB proven)
- Double-entry ledger + webhook idempotency (stub processors)
- Verification policy guards; TOTP enforced when enrolled
- Media staging → CSAM gate → promote (noop forbidden in prod worker)
- Admin RBAC + audit logs; geo/payout jurisdiction honesty model
- Observability: request IDs, metrics, health/ready, optional Sentry
- Redis rate limiting; helmet; CORS allowlist required in prod
- Docker multi-stage non-root images; hardened CI workflow config
- Resend email adapter; production env rejects log-only mail / stub processors / noop IDV / auto-activate
- HttpOnly cookie browser sessions (access+refresh) with CSRF header guard; no client-side token storage
- OpenAPI spec re-synced to implemented API surface
- Playwright e2e scaffold (`@hushd/e2e`) covering cookie auth lifecycle + web smoke

## Outstanding risks (must complete before open launch)

| Item | Severity | Owner | Blocks open prod? |
|------|----------|-------|-------------------|
| Live payment processors | Blocker | Eng + Finance | Yes |
| Non-noop CSAM | Blocker | Eng + Trust & Safety | Yes |
| Resend (or equiv.) + verified domain | Critical | Eng | Yes |
| Veriff credentials | Critical | Eng + Compliance | Yes |
| ~~HttpOnly cookie sessions~~ | ~~High~~ | Eng | **Done** (R-032) |
| Remote CI green | High | Eng | Yes for release discipline |
| Terraform / hosting IaC | High | DevOps | Yes unless alternate IaC |
| Legal sign-off | Critical | Counsel | Yes for adult platform claims |
| ~~FE e2e suite~~ | ~~Medium~~ | QA | **Scaffolded** (R-034) — expand journeys |
| Watermark job | Medium | Eng | No (document deferral) |

## Deployment prerequisites

1. Managed Postgres + Redis + R2 (+ Stream optional)
2. Secrets in a secret manager (never git)
3. `NODE_ENV=production` with all `validateEnv` requirements
4. `CSAM_PROVIDER=hashlist` (or vendor) on worker
5. Edge `GEO_EDGE_SHARED_SECRET` if ACCESS geo required
6. Run `prisma migrate deploy` before/at deploy
7. Post-deploy smoke: health, register/login, upload+scan, webhook fixture

## Post-launch recommendations

- ~~Cookie-based auth migration~~ — done (R-032)
- ~~OpenAPI sync~~ — done (R-033); Playwright smokes scaffolded (R-034) — expand journeys
- Processor outage drills ([runbooks](runbooks/processor-outage-playbook.md))
- Quarterly dependency audit + pen test
