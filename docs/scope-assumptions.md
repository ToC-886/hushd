# Scope assumptions (baseline)

This document captures the launch assumptions from the approved architecture plan. Change these before implementation if your product, legal, or payments posture differs.

| Area | Assumption |
|------|------------|
| Markets | EU, UK, US, and Canada as the **design target**, with **country allowlists** and per-environment processor/geo rules—not unbounded global availability on day one. |
| Backend | **Node.js + NestJS** for `apps/api`, **BullMQ** on Redis for async work, **TypeScript** throughout. |
| Budget | **Balanced**: managed PostgreSQL, managed Redis, Sentry, one IDV vendor, one CSAM-hash integration path, Postmark or SES. |
| Mobile v1 | **Web + PWA** only; native store distribution deferred. |
| Branding | Working name **hushd**, neutral dark UI, professional tone in creator and admin tooling. |

## Legal and vendor posture

- **2257, tax, payments, and platform liability** require **external legal counsel**; this repo does not encode legal conclusions.
- **CSAM detection** is implemented behind a **`CsamScanProvider`** interface; specific vendors and NCMEC reporting workflows must be configured per jurisdiction and counsel.

## Jurisdiction policy defaults

- `restrictedCountries`: countries blocked from any platform access.
- `payoutBlockedCountries`: countries allowed to view/purchase but not eligible for creator payouts.
- Policy helper reference: [`packages/shared/src/policy/jurisdiction.ts`](../packages/shared/src/policy/jurisdiction.ts).
- Enforcement points: checkout creation, payout approval, and creator publishing flows.

## Revision log

- **2026-04-21**: Initial baseline aligned to the architecture plan.
