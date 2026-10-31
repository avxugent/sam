// Prisma skips .env loading when prisma.config.ts is present ("Prisma config
// detected, skipping environment variable loading"), so load it here with
// Node's built-in parser (no dependencies, so it also works with only the
// Prisma CLI installed). Variables already set win. In containers the DB_*
// vars are injected by the runtime and no .env is present.
import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) process.loadEnvFile(".env");

function buildDatabaseUrl(): string {
  const host = process.env.DB_HOST ?? "localhost";
  const port = process.env.DB_PORT ?? "3306";
  const name = process.env.DB_NAME ?? "samdb";
  const user = process.env.DB_USER ?? "sam";
  const password = process.env.DB_PASSWORD ?? "";

  const encodedUser = encodeURIComponent(user);
  const encodedPassword = encodeURIComponent(password);
  let url = `mysql://${encodedUser}:${encodedPassword}@${host}:${port}/${name}`;

  if (process.env.DB_SSL === "true") {
    url += "?sslaccept=strict";
  }

  return url;
}

const databaseUrl = buildDatabaseUrl();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
