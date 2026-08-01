# syntax=docker/dockerfile:1.7

# hushd worker (BullMQ media pipeline) — multi-stage, non-root, reproducible.
#
# The worker imports @hushd/shared (workspace source) and @prisma/client
# (generated). Build from the monorepo ROOT context:
#
#   docker build -f apps/worker/Dockerfile -t hushd/worker .
#
# The worker exposes no port; it connects out to Postgres, Redis, and R2.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY apps/worker/package.json apps/worker/
RUN pnpm install --frozen-lockfile

# --- build -------------------------------------------------------------------
FROM base AS build
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/worker apps/worker
RUN pnpm --filter @hushd/db exec prisma generate \
 && pnpm --filter @hushd/shared build \
 && pnpm --filter @hushd/worker build

RUN pnpm deploy --filter=@hushd/worker --prod /app/pruned
RUN cp -r apps/worker/dist /app/pruned/dist

# --- run ---------------------------------------------------------------------
FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=build --chown=nodejs:nodejs /app/pruned ./

USER nodejs

# No EXPOSE: worker has no inbound listener. Graceful shutdown is handled in
# main.ts (SIGINT/SIGTERM → worker.close() → prisma/redis disconnect).

CMD ["node", "dist/main.js"]
