# syntax=docker/dockerfile:1
# SAM – Simple Asset Management
# Multi-stage build using Next.js standalone output

# ─────────────────────────────────────────────────────────────
# Base — shared layer with libc6-compat
# ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
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
# production container (required for Nomad Actions).
# ─────────────────────────────────────────────────────────────
FROM base AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# ─────────────────────────────────────────────────────────────
# Stage 3: Prisma CLI — isolated install for running migrations
#
# Installs only the `prisma` package (+ its full transitive dep tree)
# into a separate directory so that the runner stage can invoke
# `prisma db push` without bundling the entire node_modules tree.
# ─────────────────────────────────────────────────────────────
FROM base AS prisma-cli
RUN apk add --no-cache openssl
WORKDIR /prisma-install

# Read the prisma version from the project manifest and install it
# in an isolated, minimal package.json so only prisma and its own
# transitive deps are downloaded — nothing else from the app.
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm \
    PRISMA_VER=$(node -p "require('./package.json').dependencies.prisma") \
 && echo "{\"name\":\"prisma-cli\",\"private\":true,\"dependencies\":{\"prisma\":\"${PRISMA_VER}\"}}" > package.json \
 && npm install --no-fund --loglevel=error

# ─────────────────────────────────────────────────────────────
# Stage 3: Build the application
# ─────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# Copy deps from previous stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time arguments — only used during `next build`, never baked into the
# runtime image. Dummy DB values are sufficient; the app does NOT connect to
# the database at build time.
ARG DB_HOST=localhost
ARG DB_PORT=3306
ARG DB_NAME=samdb
ARG DB_USER=sam
ARG DB_PASSWORD=build
ARG NEXTAUTH_SECRET=build-time-placeholder
ARG NEXTAUTH_URL=http://localhost:3000

ENV DB_HOST=$DB_HOST
ENV DB_PORT=$DB_PORT
ENV DB_NAME=$DB_NAME
ENV DB_USER=$DB_USER
ENV DB_PASSWORD=$DB_PASSWORD
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

# Prisma CLI in its own isolated module tree (all transitive deps included).
# Placed outside /app so it does not interfere with the standalone bundle.
# /usr/local/bin/prisma is created before switching to the non-root user.
COPY --from=prisma-cli /prisma-install/node_modules /prisma-cli/node_modules
RUN ln -sf /prisma-cli/node_modules/.bin/prisma /usr/local/bin/prisma \
 && ln -sf /prisma-cli/node_modules/prisma /app/node_modules/prisma

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

# Overlay the Prisma-generated client from the builder stage — prod-deps has
# the package skeleton but not the generated query engine / type definitions.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./scripts/node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma/client ./scripts/node_modules/@prisma/client

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
