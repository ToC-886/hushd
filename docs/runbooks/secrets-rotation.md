# Runbook: secrets rotation

## Scope

Rotate JWT signing keys, processor webhook secrets, IDV API keys, object storage credentials, and observability ingest tokens on a regular cadence or immediately after suspected compromise.

## Preconditions

- Maintenance window for **forced logout** if rotating JWT refresh family secrets.
- Access to your cloud **secrets manager** and deployment pipeline.

## Steps

1. **Issue new secrets** in the secrets manager without deleting the old values yet.
2. **Deploy** services configured to accept **both** old and new signing materials during overlap (dual-read), where supported.
3. **Invalidate sessions** if refresh secrets rotated without dual-key verification.
4. **Update processor dashboards** with new webhook signing secrets; replay-test using vendor sandbox tools.
5. **Revoke old object storage keys** after confirming uploads and reads succeed with new credentials.
6. **Record** the rotation in `audit_logs` via an admin action (once admin UI exists).

## Rollback

- Restore previous secret versions in the secrets manager and redeploy the last known-good release.
