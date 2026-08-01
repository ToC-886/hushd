# ADR 0005: FAILED webhook events are reprocessable

## Status

Accepted (2026-08-01)

## Context

Billing webhook ingestion dedupes on a `ProcessorEvent` row keyed by the
processor's event id, so that replaying the same webhook N times yields exactly
one financial mutation (a Phase 1 acceptance criterion). The pre-audit
implementation treated **any** existing `ProcessorEvent` row as "already
handled" — including rows whose processing had **failed**.

The result was a data-loss defect: a webhook that failed partway (e.g. a
transient database error after the `ProcessorEvent` row was written) could never
be reprocessed. The processor would retry, the dedupe check would see the
existing row, and the event would be dropped — the financial mutation was lost
permanently.

## Decision

The dedupe logic now distinguishes by the stored event's status:

- **`FAILED` rows are deleted on re-ingest**, allowing the event to be fully
  reprocessed from scratch. A retry after a transient failure now succeeds.
- Successfully processed rows still short-circuit (true idempotency).

In the same pass, zero-value `Transaction`/`LedgerEntry` rows are no longer
written for non-financial `ADJUSTMENT` events, keeping the ledger clean of
meaningless entries.

## Consequences

### Positive

- Transient processing failures are recoverable via the processor's normal retry
  — no permanent financial data loss.
- The idempotency guarantee is preserved for genuinely-completed events.

### Negative / costs

- A `FAILED` event is reprocessed from the beginning, so event handlers must
  remain idempotent at the *financial* level (they are — ledger writes are
  guarded by the dedupe on successful completion). This is documented as an
  invariant for future processor adapters.

### Alternatives considered

- *Mark FAILED and require manual intervention:* rejected — transient failures
  (DB blip, timeout) should self-heal on retry; manual intervention does not
  scale and is unnecessary for the common case.
- *Retry in place without deleting:* rejected — partial state from the failed
  attempt could corrupt the retry; a clean re-run is safer.
