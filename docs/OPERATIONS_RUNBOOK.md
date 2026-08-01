# Operations Runbook

## Startup / shutdown

**API:** `node dist/main.js` (or container CMD). Validates env before listen; Nest shutdown hooks enabled.

**Worker:** `node dist/main.js`. On SIGTERM/SIGINT: drain BullMQ worker → disconnect Prisma/Redis (30s force exit).

**Web/Admin:** `node apps/{web,admin}/server.js` in standalone images, or `next start`.

Local: `docker compose up -d` then `pnpm dev`.

## Common incidents

| Symptom | Check | Action |
|---------|-------|--------|
| API won't start | Env validation error text | Fix missing/weak prod vars |
| 503 on auth/API | Redis throttler fail-closed | Restore Redis |
| Uploads stuck PENDING | Worker logs / CSAM provider | Ensure worker + hashlist; retries |
| Emails missing | `EMAIL_PROVIDER`, Resend dashboard | Resend API key/domain; user can resend verify |
| Webhooks ignored | HMAC secrets, ProcessorEvent | Verify signature; inspect FAILED rows |
| Geo not blocking | `GEO_EDGE_SHARED_SECRET` | Edge must send matching header |
| Payouts held | Risk score / LedgerHold / geo | Admin risk + holds UI |

## Failed migration

1. Do not restart app loops blindly
2. Inspect `_prisma_migrations` and Postgres logs
3. Restore from backup if schema half-applied
4. Fix SQL; deploy forward migration — do not rewrite applied history

## Worker / queue recovery

- BullMQ retries: media scan attempts with backoff
- Dead/failing jobs: check `ALERT_WEBHOOK_URL` alerts
- Replay: fix root cause then re-enqueue or re-complete upload

## External outages

- Processors: [processor-outage-playbook](runbooks/processor-outage-playbook.md)
- IDV: creators cannot pass creator gates — communicate status
- R2: uploads fail — pause publishing messaging
- Email: verification/resets delayed — keep log visibility in staging only

## Backup restoration

Follow [disaster-recovery](runbooks/disaster-recovery.md). Validate app health and a sample creator/fan login after restore.

## Logs and metrics

- Correlate with `x-request-id` / JSON error `requestId`
- Prometheus: `/v1/metrics`
- Optional Sentry via `SENTRY_DSN`
- Never log passwords, tokens, raw webhook secrets, or full card data

## Escalation

1. On-call eng — service down / data risk
2. Trust & Safety — CSAM / moderation
3. Finance — payout / ledger discrepancy
4. Counsel — legal/takedown ([dmca-takedown-chain](runbooks/dmca-takedown-chain.md))
