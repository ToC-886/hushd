# 05 — Test Strategy

## Current inventory (2026-08-01)

| Layer | Location | Count / notes |
|-------|----------|---------------|
| API unit | `apps/api/src/**/*.spec.ts` | **18 suites / 132 tests** (auth+cookies+CSRF, billing webhooks, media, payouts, geo, verification, messaging, feed, env, observability) |
| Worker unit | `apps/worker/src/media-pipeline.spec.ts` | **6 tests** — CSAM gate decision tree |
| Shared | echo stub | none |
| Web / Admin | echo stub | none |
| E2E | `e2e/tests/*.spec.ts` | **7 specs** — Playwright: API health + cookie auth lifecycle; web home/login/register smoke |
| Migration | CI + local `prisma migrate deploy` | Proven on clean Postgres |

## Risk-based priorities

1. **Auth / TOTP / email tokens** — covered by unit tests; e2e still needed
2. **Webhook idempotency + ledger balance** — covered
3. **Verification policy guard** — covered
4. **Media MIME/size + staging key binding** — covered
5. **Payout gates (KYC, hold, geo, balance)** — covered
6. **CSAM pipeline** — unit covered; integration with real hashlist open
7. **Admin role enforcement** — API RoleGuard covered; FE restore fixed; e2e open
8. **Critical UI journeys** — manual only today

## Required CI gates

1. `pnpm install --frozen-lockfile`
2. `prisma migrate deploy` against ephemeral Postgres
3. `pnpm typecheck`
4. `pnpm test`
5. `pnpm build` (or Docker matrix)
6. `pnpm audit --prod` (advisory; do not silently ignore high)

## Near-term additions

| Test | Why |
|------|-----|
| ~~Playwright: register → login~~ | **Scaffolded** (R-034) — cookie auth + web register smoke live |
| Playwright: creator post → fan subscribe → feed media | Monetization |
| Playwright: admin login → payout approve | Ops |
| Worker integration with Redis testcontainer | Job retries |
| ~~Contract test: OpenAPI vs controllers~~ | **Done** (R-037) — `apps/api/src/openapi/openapi-contract.spec.ts` runs in CI (`pnpm --filter @hushd/api run test:contract`); route/method/param/security/status/body drift fails the build |

## Rules

- Do not skip tests without a documented reason.
- Do not weaken assertions to green the build.
- Every material defect gets a regression test (see `07-remediation-log.md`).
