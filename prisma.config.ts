import "dotenv/config";
import { defineConfig } from "prisma/config";

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

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: buildDatabaseUrl(),
  },
});
