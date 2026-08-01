# 03 — Gap and Risk Register

| ID | Area | Finding | Evidence | Impact | Likelihood | Severity | Proposed Resolution | Dependencies | Status |
|----|------|---------|----------|--------|------------|----------|---------------------|--------------|--------|
| G-001 | Integrations | Payment processors are stubs | `segpay-stub` / `ccbill-stub` in shared | No real money movement | Certain in prod without work | Blocker | Implement live processor adapters + secrets | Processor accounts | Open — external |
| G-002 | Safety | Default CSAM provider is noop | `NoopCsamScanProvider` | Illegal content may promote | Certain if left default | Blocker | Mandatory hashlist/vendor; refuse noop in prod | CSAM vendor | Open — external |
| G-003 | Email | Log-only mailer | `EMAIL_PROVIDER=log` | No verification/reset delivery | Certain | Critical | Real provider adapter | SES/Postmark/Resend | Open — external |
| G-004 | IDV | Veriff optional; noop fails closed for webhooks | `noop-idv` / `veriff-idv` | Creators blocked or fake-verified in misconfig | High if misconfigured | Critical | Require Veriff in prod via env validation | Veriff account | Open — external |
| G-005 | Auth UX | JWT access+refresh in localStorage | was `apps/web/lib/api.ts`, admin same | XSS exfiltration of sessions | Was high | — | **Fixed** — HttpOnly Secure SameSite cookies + CSRF header; FE `credentials:include` | — | Closed (R-032) |
| G-006 | Geo | ACCESS geo needs edge shared secret | ADR-0002, geo-block guard | Spoofable headers otherwise | High without secret | High | Deploy edge signing secret | CDN/edge config | Open — ops |
| G-007 | Media | Watermark job not implemented | shared job type; worker ignores | Weaker forensic trail | Medium | Medium | Implement or formally defer | FFmpeg/worker capacity | Open |
| G-008 | Docs | OpenAPI drifted | `docs/openapi.yaml` | Integrator confusion | Was high | — | **Fixed** — full re-sync to implemented controllers + DTOs | — | Closed (R-033) |
| G-009 | Infra | Terraform skeleton | `infra/terraform` | No turnkey cloud deploy | Certain | High | Complete modules or document alternative | Cloud choice | Open |
| G-010 | Test | No web/admin/e2e tests | was package scripts echo | Regressions in UI | Medium | Medium | **Scaffolded** — Playwright `@hushd/e2e` (API auth/health + web smoke) | CI time | Mitigated (R-034) — expand journeys |
| G-011 | Product | Promotions/affiliates missing | roadmap P3 | Revenue features incomplete | N/A | Enhancement | Future phase | Product | Deferred |
| G-012 | Ops | CI not yet proven on remote runner | local config only | Unknown CI failures | Medium | High | Push branch; fix Actions | GitHub | Open |
| G-013 | Deps | Transitive CVEs (Nest multer/lodash historically) | `pnpm audit` | DoS / injection paths | Medium | High | Overrides applied; re-audit after install | Upstream Nest | Mitigated (overrides) |
| G-014 | Media | MIME/size optional bypass | was optional on init | Malicious uploads | Was high | — | **Fixed** — required fields + DTO | — | Closed (R-024) |
| G-015 | Build | Windows standalone symlink EPERM | Next `output: standalone` | Local prod build failed | Certain on Win | Medium | Skip standalone on win32; Docker sets `NEXT_STANDALONE=1` | — | Closed (R-025) |
| G-016 | DB | Migration UTF-16 / deploy unverified | baseline encoding | migrate deploy failed | Was blocker | — | UTF-8 fix; deploy proven on clean DB | — | Closed (R-026) |
| G-017 | UX | Subscribe with empty tierId; SWIFT enum; admin role restore | prior audit | Broken checkout/payouts/admin | Was high | — | Fixed in this audit pass | — | Closed |
| G-018 | Compose | Port 5432 clash + no healthchecks | docker-compose | Confusing local DB | Medium | Low | Host map 5433 + healthchecks | — | Closed (R-027) |

## Severity legend

Blocker → Critical → High → Medium → Low → Enhancement
