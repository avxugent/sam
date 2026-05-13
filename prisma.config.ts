// Prisma skips .env loading when prisma.config.ts is present ("Prisma config
// detected, skipping environment variable loading"). Parse .env manually using
// only Node built-ins so this works in every environment — including the
// isolated prisma-cli Docker stage that only has prisma's own dependencies.
// In containers the DB_* vars are injected by the runtime; no .env is present.
import { existsSync, readFileSync } from "fs";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^\s*([^#\s=][^=]*?)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
}

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
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
