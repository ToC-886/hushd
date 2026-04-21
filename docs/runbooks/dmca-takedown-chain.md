# Runbook: DMCA and emergency takedown chain

## Intake

1. Receive claim and create `DMCARequest`.
2. Attach claimant evidence and target references.
3. Add moderation queue entries for all linked targets.

## Response

1. Temporarily disable content delivery for referenced media/posts.
2. Record decision and timestamps in `DMCARequest`.
3. Emit `AuditLog` entries for each action.

## Escalation

- Legal review for disputed claims.
- Fraud/risk review for repeated malicious report patterns.
- Preserve evidence references under legal hold when required.
