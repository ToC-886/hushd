# hushd

Compliance-first creator subscription platform (web-first monorepo).

**Production readiness:** see [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) — currently **CONDITIONALLY READY** (external processors, CSAM, email/IDV, and cookie auth remain before open launch).

## Architecture summary

| Path | Role |
|------|------|
| `apps/web` | Fan + creator Next.js 15 (App Router, Tailwind v4) |
| `apps/admin` | Admin Next.js console |
| `apps/api` | NestJS HTTP API + webhooks (`/v1`) |
| `apps/worker` | BullMQ workers (media, reconcile, sweeps) |
| `packages/db` | Prisma schema + migrations |
| `packages/shared` | Adapters, money helpers, webhooks, jobs |
| `infra/terraform` | Infrastructure skeleton |
| `docs/` | Architecture, ADRs, audit, runbooks, OpenAPI |

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Prerequisites

- Node.js 22+
- pnpm 9.14.2 (`packageManager` field)
- Docker (optional) for Postgres/Redis
- PostgreSQL 16 + Redis 7

## Local installation

```bash
cp .env.example .env
docker compose up -d   # Postgres on localhost:5433, Redis on 6379
# Point DATABASE_URL at :5433 when using compose (see comment in .env.example)
pnpm install
pnpm db:generate
pnpm db:migrate:deploy   # or pnpm db:migrate for interactive dev
pnpm dev
```

| App | Default URL |
|-----|-------------|
| Web | http://localhost:3000 |
| Admin | http://localhost:3010 |
| API | http://localhost:3001/v1 |

## Validation commands

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm audit:deps
```

## Production build / deploy

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Docker builds from repo root:

```bash
docker build -f apps/api/Dockerfile -t hushd/api .
docker build -f apps/worker/Dockerfile -t hushd/worker .
docker build -f apps/web/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t hushd/web .
docker build -f apps/admin/Dockerfile --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.example.com -t hushd/admin .
```

On Windows, Next `standalone` output is skipped locally (symlink privileges); Docker sets `NEXT_STANDALONE=1`.

## Authentication (API)

- Register / login / refresh / logout / me
- Email verify + password reset (Resend in prod; log provider in dev)
- Creator TOTP setup/enable
- Global JWT guard; `@Public` for health/webhooks/auth entrypoints

## Domain modules

Billing (stub processors until live), verification, creator/feed/messaging, media+worker CSAM gate, payouts, admin/risk/compliance, observability.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `migrate deploy` encoding/null errors | Ensure SQL files are UTF-8 (not UTF-16) |
| Port 5432 busy | Use compose host port **5433** or stop native Postgres |
| API refuses to start in production | Read `validateEnv` error — stubs/log email/noop IDV blocked |
| Worker exits on CSAM noop in prod | Set `CSAM_PROVIDER=hashlist` + hashlist file/URL |
| Next Windows build EPERM | Expected without standalone; use Docker for standalone images |

## Documentation index

| Doc | Purpose |
|-----|---------|
| [`docs/PHASE_1_TO_6_AUDIT.md`](docs/PHASE_1_TO_6_AUDIT.md) | Phase verification summary |
| [`docs/audit/`](docs/audit/) | Inventory, matrix, gaps, remediation log |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Security model |
| [`docs/OPERATIONS_RUNBOOK.md`](docs/OPERATIONS_RUNBOOK.md) | Incidents / ops |
| [`CHANGELOG.md`](CHANGELOG.md) | Material changes |

## Legal

2257, reporting, and processor programs require **qualified counsel**. This repository provides engineering scaffolding and controls — not a legal compliance certificate.
