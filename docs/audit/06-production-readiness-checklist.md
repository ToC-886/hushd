# 06 — Production Readiness Checklist

| Gate | Criterion | Status | Evidence |
|------|-----------|--------|----------|
| Build | Clean install | Pass | `pnpm install` |
| Build | Typecheck | Pass | `pnpm typecheck` 8/8 |
| Build | Production build | Pass | web/admin/api/worker build (Win skips standalone; Docker sets `NEXT_STANDALONE=1`) |
| Build | App starts with valid env | Pass (dev) | `validateEnv` + Nest boot |
| Functional | Critical journeys implemented | Partial | UI+API exist; money/CSAM/email need vendors |
| Functional | No critical path on mocks in prod config | Pass (fail-closed) | Prod rejects stub processors, noop IDV, log email; worker rejects noop CSAM |
| Data | Clean migrate deploy | Pass | 2 migrations applied 2026-08-01 |
| Data | Constraints / cents ledger | Pass | Prisma schema + ledger specs |
| Data | Backup/restore documented | Pass | `docs/runbooks/disaster-recovery.md` + DEPLOYMENT |
| Security | No unresolved blocker in code path | Conditional | Blockers are external credentials, not missing fail-closed |
| Security | AuthZ server-side | Pass | JWT + RoleGuard + ownership checks |
| Security | Browser session storage | Pass | HttpOnly Secure SameSite cookies + CSRF header; no `localStorage` tokens (R-032) |
| Security | Secrets not in repo | Pass | `.env.example` placeholders only |
| Security | Dep scan reviewed | Pass w/ residual | Next bumped; multer/lodash overrides; re-run `pnpm audit:deps` |
| Test | Full automated suite | Pass | API 132 + worker 6 |
| Test | Critical paths covered | Pass (scaffolded) | Playwright `@hushd/e2e`: API auth/health + web smoke (7 specs) |
| Ops | Structured logs + request IDs | Pass | middleware + filter |
| Ops | Health/ready | Pass | `/v1/health`, `/v1/health/ready` |
| Ops | Deploy/rollback docs | Pass | `docs/DEPLOYMENT.md` |
| Deploy | Reproducible artifacts | Pass | Dockerfiles multi-stage non-root |
| Docs | Local setup reproducible | Pass | README + `.env.example` |

## Go-live blockers (external / remaining)

1. Live Segpay/CCBill (or approved) processors — not stubs
2. Production CSAM hashlist/vendor + `CSAM_PROVIDER≠noop`
3. `EMAIL_PROVIDER=resend` + `RESEND_API_KEY` (or equivalent)
4. Veriff credentials + `IDV_PROVIDER=veriff`
5. R2 + Redis + Postgres production instances
6. `GEO_EDGE_SHARED_SECRET` at trusted edge
7. ~~HttpOnly cookie auth~~ — **Done** (R-032)
8. Remote CI green on this branch
9. Legal counsel sign-off on 2257/DMCA programs

## Decision

See [`docs/PRODUCTION_READINESS.md`](../PRODUCTION_READINESS.md) — **CONDITIONALLY READY — LISTED ITEMS MUST BE COMPLETED**.
