// Prisma skips .env loading when prisma.config.ts is present ("Prisma config
// detected, skipping environment variable loading"), so load it here with
// Node's built-in parser (no dependencies, so it also works with only the
// Prisma CLI installed). Variables already set win. In containers the DB_*
// vars are injected by the runtime and no .env is present.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) process.loadEnvFile(".env");

/** The migrate URL from the DB_* vars; throws like lib/prisma.ts when a required one is unset. */
function buildDatabaseUrl(): string {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD ?? "";

  if (!host || !name || !user) {
    throw new Error("Missing required database environment variables: DB_HOST, DB_NAME, DB_USER");
  }

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  let url = `mysql://${encodedUser}:${encodedPassword}@${host}:${port}/${name}`;

  if (process.env.DB_SSL === "true") {
    url += "?sslaccept=strict";
  }

  return url;
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // A getter, so only commands that connect (migrate, db) need the DB_* vars:
  // `prisma generate` never reads the URL and runs without them (Dockerfile
  // builder stage, CI type-check job).
  datasource: {
    get url() {
      return buildDatabaseUrl();
    },
  },
});
