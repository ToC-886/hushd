# Terraform (skeleton)

Modules under `modules/` illustrate a typical AWS-style split:

- `network` — VPC, subnets, egress controls (provider-specific).
- `postgres` — managed PostgreSQL + parameter groups + backups.
- `redis` — managed Redis for BullMQ.
- `object_storage` — IAM for R2 or S3-compatible buckets (staging vs public prefixes).
- `secrets` — KMS + secrets manager references.
- `observability` — log shipping hooks for Sentry/Datadog.

`environments/dev` composes modules with minimal sizing.
`environments/prod` composes the same modules with production-tier sizing defaults.

Recommended state layout:

- separate state backends per environment
- locked state (S3+DynamoDB or equivalent)
- no manual drift edits outside approved pipelines
