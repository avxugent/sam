# syntax=docker/dockerfile:1
# SAM – Simple Asset Management
# Multi-stage build using Next.js standalone output

# ─────────────────────────────────────────────────────────────
# Base — shared layer with libc6-compat
# ─────────────────────────────────────────────────────────────
FROM node:24.22.1-alpine AS base
RUN apk add --no-cache libc6-compat

# ─────────────────────────────────────────────────────────────
# Stage 1: Install ALL dependencies (dev + prod)
# ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ─────────────────────────────────────────────────────────────
# Stage 2: Production-only dependencies
#
# Installs only non-dev dependencies. Copied into the runner image
# under scripts/node_modules/ so maintenance scripts can run in the
# production container (required for Nomad Actions). This tree also
# provides the Prisma CLI for `prisma migrate deploy` (prisma is a
# runtime dependency), so the image carries a single copy of it.
# openssl lets Prisma's postinstall pick the matching engine build.
# ─────────────────────────────────────────────────────────────
FROM base AS prod-deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ─────────────────────────────────────────────────────────────
# Stage 3: Build the application
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time arguments — only used during `next build`, never baked into the
# runtime image. No DB_* values are needed: lib/prisma.ts creates the client
# on first query, and nothing queries the database at build time.
ARG NEXTAUTH_SECRET=build-time-placeholder
ARG NEXTAUTH_URL=http://localhost:3000

ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_TELEMETRY_DISABLED=1

# Generate Prisma client (reads schema.prisma — does NOT connect to DB)
RUN npx prisma generate

# Build produces .next/standalone + .next/static
# --webpack: Turbopack native bindings require glibc; Alpine uses musl
RUN --mount=type=cache,target=/app/.next/cache \
    npx next build --webpack

# ─────────────────────────────────────────────────────────────
# Stage 4: Production runtime — minimal image
# ─────────────────────────────────────────────────────────────
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Pre-create .next so Next.js can write its runtime cache as the nextjs user
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone server bundle (includes minimal node_modules + server.js)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static assets (must be in place next to the server)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public directory
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma schema and config — needed so the CLI can read the schema
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Create uploads directory owned by the app user
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

# ── Maintenance scripts (for Nomad Actions) ───────────────────────────────────
# Scripts are isolated under /app/scripts/ with their own node_modules so they
# don't interfere with the standalone bundle. Node resolves bare imports from
# the closest node_modules/ ancestor, so scripts/node_modules/ is picked up
# automatically when running any script under /app/scripts/.
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts

# Production node_modules (no devDeps) give scripts access to @prisma/client,
# @aws-sdk/client-s3, jsdom, and other runtime dependencies.
COPY --from=prod-deps --chown=nextjs:nodejs /app/node_modules ./scripts/node_modules

# The Prisma CLI for migrations comes from that same tree. prisma.config.ts
# imports "prisma/config", resolved from /app/node_modules. Both links are
# created before switching to the non-root user.
RUN ln -sf /app/scripts/node_modules/.bin/prisma /usr/local/bin/prisma \
 && ln -sf /app/scripts/node_modules/prisma /app/node_modules/prisma

# Prisma 7 generates TypeScript source to generated/prisma/ (no longer in
# node_modules/.prisma).  The _prisma.mjs helper registers tsx at runtime so
# the generated .ts files can be imported without a separate compile step.
COPY --from=builder --chown=nextjs:nodejs /app/generated/prisma ./scripts/generated/prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check — orchestrator can detect unhealthy container.
# /api/auth/session is unauthenticated and returns 200 once the server is up.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/auth/session || exit 1

# The standalone bundle includes a pre-built server.js
CMD ["node", "server.js"]
