# 02 — Phase 1–6 Verification Matrix

Source of requirements: [`roadmap-extract.md`](../../roadmap-extract.md). Statuses reflect code inspection + automated tests as of 2026-08-01 on branch `audit/production-hardening`.

| ID | Phase | Requirement | Intended Outcome | Implementation Location | Status | Evidence | Defect or Gap | Severity | Recommended Action | Validation Method |
|----|-------|-------------|------------------|-------------------------|--------|----------|---------------|----------|--------------------|-------------------|
| P1-01 | 1 | Dual processor webhook ingestion | Deterministic money events | `billing-webhook.service.ts`, stub processors in `@hushd/shared` | Implemented with security/reliability concerns | HMAC verify + idempotent `ProcessorEvent`; suite green | Live processors are stubs | Critical (launch) | Wire real Segpay/CCBill credentials + adapters | Unit + staged webhook replay |
| P1-02 | 1 | Double-entry ledger | Auditable balances | ledger writes in billing/messaging/payouts | Verified complete (stub money) | Specs assert balanced entries | Depends on stub processors | High | Keep until live processors | Unit tests |
| P1-03 | 1 | Reconciliation worker | Detect discrepancies | `apps/worker/src/reconcile.ts` | Complete but inadequately tested | Code present; limited integration tests | No live processor settlement feed | Medium | Add integration test with fixtures | Worker job dry-run |
| P1-04 | 1 | OpenAPI billing contract | Documented API | `docs/openapi.yaml` | Partially implemented | File exists; missing many routes | Drift | Medium | Regenerate/sync OpenAPI | Diff controllers vs YAML |
| P2-01 | 2 | Age/ID verification state machine | No bypass of gates | `verification.service.ts`, policy guard | Verified complete (noop/Veriff) | Guard specs; Veriff adapter optional | Production needs Veriff keys | Critical (launch) | Configure Veriff | Guard unit tests |
| P2-02 | 2 | Compliance events + audit | Immutable evidence | `compliance.service.ts`, admin audit helper | Verified complete | Admin mutations audit; compliance emit | Export UX thin | Medium | Expand export formats | API smoke |
| P2-03 | 2 | Jurisdiction / geo | Block ACCESS/PAYOUTS | `GeoBlockGuard`, `JurisdictionService` | Implemented with honesty fail-open | ADR-0002; prod needs edge secret | Without secret, ACCESS geo disabled in prod | High | Set `GEO_EDGE_SHARED_SECRET` at edge | Guard specs |
| P2-04 | 2 | Legal runbooks | Ops docs | `docs/runbooks/*` | Verified complete (engineering) | Runbooks present | Legal sign-off external | Requires business decision | Counsel review | Doc review |
| P3-01 | 3 | Creator tiers/posts + fan UI | Core monetization loop | `creator/*`, `feed/*`, `apps/web` | Verified complete (stub billing) | Creator page uses real `tierId`; billing cancel | Discovery/search limited | Medium | Add creator discovery | Manual E2E |
| P3-02 | 3 | Subscription lifecycle | trial/active/past_due/cancel | billing webhook + service | Partially implemented | Cancel + webhook transitions | Trials/promos/affiliates incomplete | Medium | Phase enhancement | API tests |
| P3-03 | 3 | Messaging/PPV/tips | Ledger-backed | `messaging.service.ts`, web messages | Verified complete | Specs + UI | Inbox needs `?creator=` | Low | Improve empty state UX | Manual |
| P3-04 | 3 | Promotions/affiliates | Pricing rules | — | Missing | No module | Deferred | Enhancement | Future phase | — |
| P4-01 | 4 | R2 presigned upload | Secure staging | `media.service.ts`, `r2-signer` | Verified complete | MIME+size **required** | Needs real R2 creds | High (launch) | Configure R2 | Unit + upload smoke |
| P4-02 | 4 | CSAM scan gate | No public promote without scan | `media-pipeline.ts`, worker | Placeholder or mock (noop default) | Hashlist optional; noop allows all | **CSAM noop blocks production** | Blocker | Real CSAM vendor | Pipeline specs |
| P4-03 | 4 | Stream ingest | Video delivery | worker promote | Partially implemented | Optional Stream config | Needs CF tokens | High | Configure Stream | Manual |
| P4-04 | 4 | Watermark job | Forensic watermark | job type only | Missing | Worker ignores non-scan jobs | Gap vs roadmap | Medium | Implement or defer officially | — |
| P4-05 | 4 | Moderation queue | Triage | moderation module + admin UI | Verified complete | Admin pages + APIs | — | — | Keep | Manual |
| P5-01 | 5 | Admin console | Ops without DB | `apps/admin` + admin APIs | Verified complete | Pages: mod/payouts/risk/geo/dmca/compliance/audit | FE tests none | Medium | Add smoke tests | Manual |
| P5-02 | 5 | Payout approvals + holds | Safe payouts | `payouts/*`, admin | Verified complete | Specs + KYC/hold/min gates | Needs live payout rail | Critical (launch) | Integrate payout processor | Unit |
| P5-03 | 5 | Risk scoring | Fraud holds | risk module | Complete but inadequately tested | Auto-hold on score | Rules engine shallow | Medium | Expand rules | Unit |
| P5-04 | 5 | Analytics pipelines | Earnings/churn | analytics controller | Partially implemented | Basic endpoints | No full pipeline | Medium | Expand | — |
| P6-01 | 6 | Terraform expansion | Managed infra | `infra/terraform` | Partially implemented | Skeleton modules | Not deployable as-is | High | Expand or use platform IaC | Plan dry-run |
| P6-02 | 6 | CI/CD hardening | Gated releases | `.github/workflows/ci.yml` | Verified complete (config) | migrate + typecheck + test + docker + audit | Not yet proven on remote CI | High | Push branch / watch Actions | CI run |
| P6-03 | 6 | Observability | Operate in prod | metrics, sentry, request-id, alerts | Verified complete | Code + health/ready | Alert routing needs webhook | Medium | Set `ALERT_WEBHOOK_URL` / Sentry | Smoke |
| P6-04 | 6 | DR + runbooks | Incident readiness | `docs/runbooks`, this audit | Verified complete (docs) | Present | Drills not exercised | Medium | Schedule restore drill | Manual |
| X-01 | cross | Email delivery | Verification/reset | `mailer.service.ts` | Placeholder | Log-only default | Blocks real activation emails | Critical (launch) | SES/Postmark/Resend adapter | Integration |
| X-02 | cross | Prisma migrations | Deployable schema | `packages/db/prisma/migrations/*` | Verified complete | `migrate deploy` applied 2 migrations on clean DB 2026-08-01 | Baseline was UTF-16 briefly; fixed to UTF-8 | — | Keep UTF-8 only | `migrate deploy` |
| X-03 | cross | Token storage | XSS-resistant sessions | web/admin `localStorage` | Implemented with security concerns | Access+refresh in localStorage | XSS can steal tokens | High | Prefer HttpOnly Secure cookies | Security review |

## Summary counts

| Status | Count (approx.) |
|--------|-----------------|
| Verified complete | 12 |
| Complete but inadequately tested | 3 |
| Partially implemented | 5 |
| Placeholder / mock | 2 |
| Missing | 2 |
| Implemented with security/reliability concerns | 3 |
