# Runbook: disaster recovery and rollback

## Objectives

- Validate backup restore for PostgreSQL and object metadata pointers.
- Demonstrate service recovery in alternate environment state.
- Exercise rollback procedure for failed migrations and bad deploys.

## Quarterly drill checklist

1. Restore latest DB snapshot into a temporary recovery environment.
2. Run integrity checks for `transactions`, `ledger_entries`, `processor_events`, and `compliance_events`.
3. Replay a subset of billing webhooks to verify idempotency protections remain intact.
4. Validate signed media URL generation and moderation queue retrieval.
5. Document RTO/RPO outcomes and remediation items.

## Emergency rollback

1. Freeze deployments.
2. Revert API/worker image tags to last known good release.
3. Run migration rollback or point-in-time restore based on severity.
4. Reconcile processor settlements against restored ledger data.
5. Publish incident summary and follow-up actions.
