# Development Dockerfile — hot reload, all dependencies
#
# This image is NOT for production. It mounts the project source at runtime
# so that Next.js can hot-reload edits without rebuilding the image.
#
# The production image is at the project root (Dockerfile).

FROM node:24-alpine

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

# Copy manifests first so dependency installation is cached separately
# from source changes.
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/

# Install all dependencies (including devDependencies needed by next dev)
RUN npm ci

EXPOSE 3000

ENV NODE_ENV=development

# Generate the Prisma client, apply pending migrations, then start the dev server.
#
# generate runs at container start rather than image build: the schema's
# generator writes to ../generated/prisma (outside node_modules), and the
# `..:/app` bind mount shadows anything the build put there. Building it into the
# image would silently accomplish nothing. The output is plain TypeScript, so
# this is fast and platform-independent.
#
# `migrate deploy` applies only committed migrations (never a schema diff), so
# the dev database follows the same history as production and is safe to run
# on every start. Create new migrations on the host with `npm run db:migrate`.
# A database volume created earlier by `db push` has no migration history and
# makes `migrate deploy` stop with P3005; mark the committed migrations as
# applied once (the pushed schema already matches them), then restart:
#   for m in prisma/migrations/*/; do npx prisma migrate resolve --applied "$(basename "$m")"; done
CMD ["sh", "-c", "npx prisma generate && npx prisma migrate deploy && npm run dev"]
