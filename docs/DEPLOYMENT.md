# Deployment

## Artifacts

Build from monorepo root:

```bash
docker build -f apps/api/Dockerfile -t hushd/api:VERSION .
docker build -f apps/worker/Dockerfile -t hushd/worker:VERSION .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t hushd/web:VERSION .
docker build -f apps/admin/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t hushd/admin:VERSION .
```

Images are multi-stage, non-root, with healthchecks where applicable. Next apps set `NEXT_STANDALONE=1` inside Docker.

## Environment

Copy [`.env.example`](../.env.example). For production, at minimum:

| Variable | Notes |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Redis |
| `JWT_*` / `ENCRYPTION_KEY` | ≥32 char strong secrets |
| `CORS_ORIGINS` | Web + admin origins |
| `APP_WEB_URL` | Email link base |
| `EMAIL_PROVIDER` | `resend` (not `log`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Verified domain |
| `AUTH_AUTO_ACTIVATE` | `false` |
| `IDV_PROVIDER` | `veriff` + Veriff keys |
| `PAYMENT_PROCESSORS_ENABLED` | Live ids only (no `_stub`) |
| `R2_*` | Staging + public buckets |
| `CSAM_PROVIDER` | `hashlist` on **worker** (not noop) |
| `GEO_EDGE_SHARED_SECRET` | If ACCESS geo required |

API `validateEnv` fails fast when production requirements are missing.

## Database migrations

```bash
# Against the target DATABASE_URL
pnpm db:migrate:deploy
# equivalent: pnpm --filter @hushd/db exec prisma migrate deploy
```

Order: migrate → start API/worker → start web/admin.

### Local compose note

`docker compose up -d` publishes Postgres on host **5433** (container 5432) to avoid clashing with a native Postgres on 5432. Use:

`postgresql://postgres:postgres@localhost:5433/hushd?schema=public`

## Health checks

- API liveness: `GET /v1/health`
- API readiness: `GET /v1/health/ready` (DB/Redis)
- Metrics: `GET /v1/metrics` (scrape carefully; protect in prod if exposed)

## Rollback

1. Redeploy previous immutable image tags
2. Do **not** automatically reverse migrations unless a down migration exists and is reviewed — prefer forward fixes
3. Restore DB from backup if a bad migration shipped ([disaster-recovery](runbooks/disaster-recovery.md))

## Backup and restore

- Continuous Postgres backups (PITR preferred)
- Test restore quarterly
- R2 versioning / lifecycle for media evidence retention per counsel

## Post-deployment smoke

1. Health/ready 200
2. Register + (verify email if gated) + login
3. Creator media init → complete → worker scan status OK
4. Inject signed sandbox webhook → one ledger mutation
5. Admin login → audit log entry on a mutation
