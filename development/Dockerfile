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

# Pre-generate the Prisma client so the app starts immediately.
# The source bind-mount at runtime will overlay /app, but the generated
# client lives inside node_modules which is kept in a named volume.
RUN npx prisma generate

EXPOSE 3000

ENV NODE_ENV=development

# Run Prisma db push to sync the schema, then start the dev server.
# db push is idempotent — safe to run on every container start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && npm run dev"]
