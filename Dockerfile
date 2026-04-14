# syntax=docker/dockerfile:1
# SAM – Simple Asset Management
# Multi-stage build using Next.js standalone output

# ─────────────────────────────────────────────────────────────
# Stage 1: Install ALL dependencies (dev + prod)
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the application
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat
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
ARG NEXT_TELEMETRY_DISABLED=1

ENV DB_HOST=$DB_HOST
ENV DB_PORT=$DB_PORT
ENV DB_NAME=$DB_NAME
ENV DB_USER=$DB_USER
ENV DB_PASSWORD=$DB_PASSWORD
ENV NEXTAUTH_SECRET=$NEXTAUTH_SECRET
ENV NEXTAUTH_URL=$NEXTAUTH_URL
ENV NEXT_TELEMETRY_DISABLED=$NEXT_TELEMETRY_DISABLED

# Generate Prisma client (reads schema.prisma — does NOT connect to DB)
RUN npx prisma generate

# Build produces .next/standalone + .next/static
RUN npm run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Production runtime — minimal image
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copy standalone server bundle
COPY --from=builder /app/.next/standalone ./

# Copy static assets (must be in place next to the server)
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy public directory
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Create uploads directory owned by the app user
RUN mkdir -p /app/uploads && chown nextjs:nodejs /app/uploads

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# The standalone bundle includes a pre-built server.js
CMD ["node", "server.js"]
