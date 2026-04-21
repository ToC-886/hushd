# Runbook: processor outage response (Segpay + CCBill)

## Trigger conditions

- Webhook failure rate spikes.
- Processor API health check fails for checkout/cancel operations.
- Settlement reconciliation misses expected windows.

## Immediate actions

1. Switch checkout routing to healthy processor (if dual mode enabled).
2. Queue failed webhook payloads for replay; do not mutate financial records manually.
3. Notify operations and legal/compliance stakeholders of degraded payment service.

## Recovery

1. Backfill processor events using reconciliation jobs.
2. Reconcile totals vs `transactions` + `ledger_entries`.
3. Retry customer-facing failures (renewals/cancel confirmations) with idempotency keys.

## Post-incident

- Add incident findings to fraud/risk dashboard annotations.
- Update processor-specific retries and timeout thresholds.
