# 04 — Remediation Plan

Grouped by priority. Status reflects work on `audit/production-hardening` as of 2026-08-01.

## 1. Build and runtime blockers

| Item | Action | Status |
|------|--------|--------|
| Prisma migrate layout + UTF-8 | Directory migrations; re-encode baseline | Done — deploy proven |
| Worker phantom imports | Rewrite `main.ts` composition | Done |
| Windows Next standalone | Platform-aware config | Done |
| Env validation on API boot | `validateEnv` fail-fast | Done |

## 2. Data-loss and security risks

| Item | Action | Status |
|------|--------|--------|
| Webhook FAILED reprocess | Delete FAILED on re-ingest | Done |
| TOTP login enforcement | Verify before session | Done |
| Admin audit trail | Shared `audit()` helper | Done |
| Geo fail-open honesty | Prod without secret disables enforcement | Done |
| Media MIME/size required | DTO + service assert | Done |
| Multer/lodash/Next CVEs | pnpm overrides + Next ≥15.5.18 | Done (re-audit) |
| localStorage tokens | Cookie session migration | **Open** (High) |
| Forbid CSAM noop in production | Env validation reject | **Next** |
| Real processors / email / Veriff | External credentials | **Blocked** |

## 3. Broken critical workflows

| Item | Action | Status |
|------|--------|--------|
| Creator subscribe empty tierId | Profile+tiers API + UI picker | Done |
| Payout SWIFT invalid enum | WIRE/OTHER | Done |
| Admin RequireAuth role restore | Re-check ADMIN | Done |
| Billing cancel UI | List + cancel endpoints/UI | Done |

## 4. Architectural integrity

| Item | Action | Status |
|------|--------|--------|
| Shared noop CSAM | `@hushd/shared` only | Done |
| Remove dead DI tokens | Integrations cleanup | Done |
| Processor stubs in shared | Single adapter location | Done |
| OpenAPI sync | Regenerate | Open |
| HttpOnly cookie auth | Design + ADR | Open |

## 5. Test coverage

| Item | Action | Status |
|------|--------|--------|
| API unit suites | Auth, billing, media, payouts, geo, etc. | Done (~101 tests) |
| Worker media pipeline | Extracted + 6 tests | Done |
| FE/e2e | Playwright critical paths | Open |
| Migration CI job | Postgres service + migrate deploy | Configured |

## 6. Operational readiness

| Item | Action | Status |
|------|--------|--------|
| Health/ready, metrics, request IDs | Implemented | Done |
| Redis throttler | Implemented | Done |
| Dockerfiles multi-stage non-root | Present | Done |
| Compose healthchecks + 5433 | Updated | Done |
| Runbooks | Present under `docs/runbooks` | Done |
| Remote CI proof | Push + green Actions | Open |

## 7. Performance

| Item | Action | Status |
|------|--------|--------|
| Pagination on feed/admin lists | Review unbounded queries | Ongoing |
| Signed URL TTLs | Policy class | Done |

## 8. Usability and accessibility

| Item | Action | Status |
|------|--------|--------|
| Form labels / errors | Shared UI primitives | Partial |
| WCAG 2.2 AA pass | Dedicated a11y audit | Open |

## 9. Documentation

| Item | Action | Status |
|------|--------|--------|
| Audit artifacts 01–07 | Rewritten this pass | Done |
| PRODUCTION_READINESS / SECURITY / DEPLOYMENT / OPS | Created | Done |
| README refresh | Update commands + honesty on stubs | Done |

## 10. Optional enhancements

- Creator discovery/search
- Promotions / affiliates
- Watermark pipeline
- Full Terraform

## Recommended execution order remaining

1. Add production env guards: reject `CSAM_PROVIDER=noop`, require email provider ≠ log, require Veriff when creators enabled.
2. Prove GitHub Actions on this branch.
3. Design HttpOnly cookie auth (ADR) and implement.
4. Sync OpenAPI; add Playwright smokes.
5. Complete external vendor onboarding (processors, CSAM, email, R2, Stream).
