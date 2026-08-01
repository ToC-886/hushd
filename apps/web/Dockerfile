# syntax=docker/dockerfile:1.7

# hushd web (Next.js 15, standalone output) — multi-stage, non-root.
#
# Standalone output traces the exact node_modules the server needs, so the
# runtime image is self-contained. Build from the monorepo ROOT context:
#
#   docker build -f apps/web/Dockerfile -t hushd/web .

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@9.14.2 --activate
WORKDIR /app

# --- build -------------------------------------------------------------------
FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

COPY apps/web apps/web
# NEXT_PUBLIC_* vars must be present at build time for the browser bundle.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_STANDALONE=1
RUN pnpm --filter @hushd/web build

# --- run ---------------------------------------------------------------------
FROM node:22-alpine AS run
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Standalone server + traced node_modules + static assets.
# With outputFileTracingRoot at the monorepo root, Next emits:
#   .next/standalone/apps/web/server.js  (+ node_modules at standalone root)
COPY --from=build --chown=nodejs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nodejs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nodejs:nodejs /app/apps/web/public ./apps/web/public

USER nodejs

ENV PORT=3000
EXPOSE 3000
ENV HOSTNAME=0.0.0.0

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "apps/web/server.js"]
