# syntax=docker/dockerfile:1.7

# hushd API (NestJS) — multi-stage, non-root, reproducible.
#
# Canonical Turborepo + pnpm pattern:
#   1. turbo prune → sparse workspace containing only the API's dependency graph
#   2. install from the pruned lockfile (deterministic, cache-friendly)
#   3. prisma generate + turbo build
#   4. copy a pruned production deployment into a minimal runtime image
#
# Build from the monorepo ROOT context:
#   docker build -f apps/api/Dockerfile -t hushd/api .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
# turbo CLI for pruning.
RUN pnpm add -g turbo@2.9.6
WORKDIR /app

# --- prune -------------------------------------------------------------------
# Produce a sparse monorepo with only the packages the API depends on.
FROM base AS prune
COPY . .
RUN turbo prune @hushd/api --docker

# --- install -----------------------------------------------------------------
# Install against the pruned lockfile + package.json manifests only (cache layer).
FROM base AS install
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build -------------------------------------------------------------------
FROM install AS build
# Full pruned source (src/, tsconfig, turbo.json, prisma schema).
COPY --from=prune /app/out/full/ ./
# tsconfig.base.json lives at the monorepo root and is shared by every package;
# turbo prune does not copy root-level files, so bring it in explicitly.
COPY tsconfig.base.json ./
# Generate the Prisma client, then build the API and its workspace deps.
RUN pnpm --filter @hushd/db exec prisma generate \
 && turbo build --filter @hushd/api

# Produce a self-contained production deployment of the API.
RUN pnpm deploy --filter=@hushd/api --prod /app/deploy \
 && cp -r apps/api/dist /app/deploy/dist
# pnpm deploy rebuilds node_modules from the lockfile, which drops the Prisma
# client generated above (it is emitted under node_modules/.prisma/client and
# is not a lockfile artifact). Regenerate it directly into the deployed tree so
# @prisma/client resolves real enums (UserRole, ...) at runtime instead of the
# empty stub. The prisma CLI is resolved from the db package's node_modules.
RUN cp -r packages/db/prisma /app/deploy/prisma-schema \
 && cd /app/deploy \
 && PRISMA_HIDE_UPDATE_MESSAGE=1 node /app/packages/db/node_modules/prisma/build/index.js generate --schema=/app/deploy/prisma-schema/schema.prisma \
 && rm -rf /app/deploy/prisma-schema

# --- run ---------------------------------------------------------------------
FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs
COPY --from=build --chown=nodejs:nodejs /app/deploy ./

USER nodejs

ENV PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/v1/health >/dev/null 2>&1 || exit 1

CMD ["node", "dist/main.js"]
