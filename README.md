# hushd

Monorepo for a compliance-first creator subscription platform (web-first).

## Packages

| Path | Role |
|------|------|
| `apps/web` | Fan + creator Next.js (App Router, Tailwind v4) |
| `apps/admin` | Admin Next.js shell |
| `apps/api` | NestJS HTTP API + webhooks |
| `apps/worker` | BullMQ workers (media pipeline) |
| `packages/db` | Prisma schema + migrations |
| `packages/shared` | Adapters, money helpers, webhook utilities, job types |
| `infra/terraform` | Infrastructure skeleton modules |
| `docs/` | Architecture, OpenAPI skeleton, runbooks, security checklist |

## Local development

1. Copy [`.env.example`](./.env.example) to `.env` and fill values.
2. Start Postgres and Redis (for example `docker compose up -d` using [`docker-compose.yml`](./docker-compose.yml)).
3. Install and run:

```bash
pnpm install
pnpm db:generate
pnpm dev
```

`pnpm dev` runs Turborepo dev tasks for all apps; use per-package scripts for focused work.

## Authentication (`apps/api`)

- `POST /v1/auth/register` — email + password; optional `role` (`FAN` default, `CREATOR` creates profile + slug).
- `POST /v1/auth/login` — bcrypt-verified login; issues **access** + **refresh** JWTs.
- `POST /v1/auth/refresh` — refresh rotation (revokes prior session on success; reuse revokes all sessions for the user).
- `POST /v1/auth/logout` — revokes the refresh session.
- `GET /v1/auth/me` — bearer access token.
- `POST /v1/auth/totp/setup` + `POST /v1/auth/totp/enable` — creator TOTP (secret sealed with `ENCRYPTION_KEY`).

Global `JwtAuthGuard` protects all routes except `@Public()` health and webhook entrypoints. Media uploads require `ownerCreatorId` to match the authenticated user.

## Enterprise roadmap modules (`apps/api`)

- `billing` — dual processor webhook ingestion, processor-event idempotency, transaction + ledger writes.
- `verification` — age and creator identity verification workflows with policy guards.
- `creator` / `feed` / `messaging` — core subscription content loops and entitlement checks.
- `admin` / `analytics` / `risk` — moderation operations, payout controls, fraud metrics, payout hold scoring.
- `compliance` — immutable compliance event emission for legal/audit traces.

## Media pipeline

1. `POST /v1/media/uploads/init` returns a **staging** upload target.
2. Client uploads to object storage.
3. `POST /v1/media/uploads/complete` enqueues `scan_and_ingest` on Redis.
4. `apps/worker` runs scan verdict handling (clean/quarantine/block), pushes moderation queue items, and performs promotion + Stream UID assignment stubs.

## Legal

Product-specific legal programs (for example 2257, reporting, and processor rules) require **qualified counsel**. This repository provides engineering scaffolding only.
