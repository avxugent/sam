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

# Generate the Prisma client, sync the schema, then start the dev server.
#
# generate runs at container start rather than image build: the schema's
# generator writes to ../generated/prisma (outside node_modules), and the
# `..:/app` bind mount shadows anything the build put there. Building it into the
# image would silently accomplish nothing. The output is plain TypeScript, so
# this is fast and platform-independent.
#
# `db push` is idempotent, so it is safe on every container start. Note it no
# longer accepts --skip-generate: Prisma 7 decoupled generation from db push and
# removed the flag, which is why generate is now an explicit step.
CMD ["sh", "-c", "npx prisma generate && npx prisma db push && npm run dev"]
