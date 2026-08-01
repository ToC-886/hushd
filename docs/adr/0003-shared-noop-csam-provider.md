# ADR 0003: Single authoritative noop CSAM provider in `@hushd/shared`

## Status

Accepted (2026-08-01)

## Context

The `NoopCsamScanProvider` (a development stub that always returns `clean`) was
duplicated verbatim in two places:

- `apps/worker/src/noop-csam.provider.ts`
- `apps/api/src/integrations/noop-csam.provider.ts`

Both implemented the same `CsamScanProvider` interface from `@hushd/shared`.
Duplicated stubs drift: a future change to the noop contract (e.g. adding a
configurable verdict for testing) would have to be made twice, and the two
copies could silently diverge.

## Decision

There is now one authoritative `NoopCsamScanProvider` in
`packages/shared/src/adapters/csam-scan.ts`, exported from the package index.
Both the API and the worker import it from `@hushd/shared`. The two app-level
copies were deleted.

In the same pass, two **dead DI tokens** were removed from the API's
`IntegrationsModule`: `CSAM_PROVIDER` and `EMAIL_PROVIDER` were provided and
exported but had zero `@Inject()` consumers (CSAM scanning is worker-owned;
email goes through `MailerModule`). The orphaned `NoopEmailProvider` was deleted
with them.

## Consequences

### Positive

- One source of truth for the noop scan contract.
- `IntegrationsModule` now only provides what is actually consumed
  (`PAYMENT_PROCESSORS`, `IDV_PROVIDER`, `ProcessorRegistry`).

### Negative / costs

- None. The deleted code had no consumers.

### Note

The noop provider is a **development stub**. Production must configure a real
hash-matching provider (the worker's `HashListCsamProvider` or a vendor
integration). Shipping to production on the noop provider means no CSAM
screening — a launch blocker tracked in the gap register.
